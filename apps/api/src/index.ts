import Fastify from "fastify";
import cors from "@fastify/cors";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { fromNodeHeaders } from "better-auth/node";
import { assertDb } from "@repo/db";
import { auth } from "./auth";
import { env } from "./env";
import { lookupInvitationByToken } from "./lib/invitations";
import { ensureProfileForUser } from "./routes/auth/register";
import { appRouter } from "./trpc/router";
import { createTrpcContext } from "./trpc/context";

const applySetCookie = (reply: import("fastify").FastifyReply, headers: Headers) => {
  const setCookie = headers.get("set-cookie");
  if (setCookie) {
    reply.header("set-cookie", setCookie);
  }
};

const sendPublicError = (
  reply: import("fastify").FastifyReply,
  error: unknown,
  fallbackMessage: string,
  logger?: { error: (payload: object, message: string) => void }
) => {
  if (error instanceof TRPCError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "BAD_REQUEST"
          ? 400
          : error.code === "FORBIDDEN"
            ? 403
            : error.code === "CONFLICT"
              ? 409
              : error.code === "UNAUTHORIZED"
                ? 401
                : 500;

    reply.status(status).send({
      code: error.code,
      message: error.message
    });
    return;
  }

  logger?.error({ event: "public.route.error", error }, fallbackMessage);
  reply.status(500).send({ code: "INTERNAL_SERVER_ERROR", message: fallbackMessage });
};

let dispatchSchemaInitPromise: Promise<void> | null = null;

const ensureDispatchSchemaForTests = async () => {
  if (env.NODE_ENV !== "test") {
    return;
  }

  if (!dispatchSchemaInitPromise) {
    dispatchSchemaInitPromise = (async () => {
      const { pool } = assertDb();
      const client = await pool.connect();

      try {
        await client.query(`
          do $$ begin
            if not exists (
              select 1
              from pg_type t
              join pg_namespace n on n.oid = t.typnamespace
              where t.typname = 'dispatch_phase' and n.nspname = 'public'
            ) then
              create type dispatch_phase as enum ('queued', 'offered', 'waiting', 'completed');
            end if;
          end $$;
        `);

        await client.query(`
          do $$ begin
            if not exists (
              select 1
              from pg_type t
              join pg_namespace n on n.oid = t.typnamespace
              where t.typname = 'dispatch_attempt_status' and n.nspname = 'public'
            ) then
              create type dispatch_attempt_status as enum ('pending', 'expired', 'accepted', 'cancelled');
            end if;
          end $$;
        `);

        await client.query(`
          do $$ begin
            if not exists (
              select 1
              from pg_type t
              join pg_namespace n on n.oid = t.typnamespace
              where t.typname = 'dispatch_waiting_reason' and n.nspname = 'public'
            ) then
              create type dispatch_waiting_reason as enum ('max_private_attempts_reached', 'no_candidates_available');
            end if;
          end $$;
        `);

        await client.query(`
          create table if not exists dispatch_queue_entries (
            id uuid primary key default gen_random_uuid() not null,
            delivery_id uuid not null references deliveries(id) on delete cascade,
            company_id uuid not null references companies(id) on delete cascade,
            phase dispatch_phase default 'queued' not null,
            timeout_seconds integer default 120 not null,
            active_attempt_number integer default 0 not null,
            active_attempt_id uuid,
            offered_driver_id uuid references drivers(id) on delete set null,
            offered_driver_name varchar(255),
            offered_at timestamp with time zone,
            deadline_at timestamp with time zone,
            waiting_reason dispatch_waiting_reason,
            waiting_since timestamp with time zone,
            ranking_version varchar(64) default 'dispatch-v1' not null,
            assumptions jsonb default '[]'::jsonb not null,
            latest_snapshot jsonb default '[]'::jsonb not null,
            created_at timestamp with time zone default now() not null,
            updated_at timestamp with time zone default now() not null
          )
        `);

        await client.query("create unique index if not exists dispatch_queue_entries_delivery_unique on dispatch_queue_entries (delivery_id)");
        await client.query("create index if not exists dispatch_queue_entries_company_phase_deadline_idx on dispatch_queue_entries (company_id, phase, deadline_at)");

        await client.query(`
          do $$ begin
            if not exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'dispatch_attempts'
                and column_name = 'offer_status'
            ) then
              create table if not exists dispatch_attempts (
                id uuid primary key default gen_random_uuid() not null,
                delivery_id uuid not null references deliveries(id) on delete cascade,
                queue_entry_id uuid not null references dispatch_queue_entries(id) on delete cascade,
                company_id uuid not null references companies(id) on delete cascade,
                attempt_number integer not null,
                driver_id uuid references drivers(id) on delete set null,
                status dispatch_attempt_status default 'pending' not null,
                expires_at timestamp with time zone not null,
                resolved_at timestamp with time zone,
                candidate_snapshot jsonb default null,
                created_at timestamp with time zone default now() not null,
                updated_at timestamp with time zone default now() not null,
                constraint dispatch_attempts_delivery_attempt_unique unique (delivery_id, attempt_number)
              );
            end if;
          end $$;
        `);

        await client.query(`
          do $$ begin
            if exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'dispatch_attempts'
                and column_name = 'status'
            ) then
              create index if not exists dispatch_attempts_queue_status_deadline_idx on dispatch_attempts (queue_entry_id, status, expires_at);
              create index if not exists dispatch_attempts_company_status_deadline_idx on dispatch_attempts (company_id, status, expires_at);
            elsif exists (
              select 1
              from information_schema.columns
              where table_schema = 'public'
                and table_name = 'dispatch_attempts'
                and column_name = 'offer_status'
            ) then
              create index if not exists dispatch_attempts_queue_status_deadline_idx on dispatch_attempts (queue_entry_id, offer_status, expires_at);
              create index if not exists dispatch_attempts_company_status_deadline_idx on dispatch_attempts (company_id, offer_status, expires_at);
            end if;
          end $$;
        `);
      } finally {
        client.release();
      }
    })();
  }

  await dispatchSchemaInitPromise;
};

export const buildApp = async () => {
  await ensureDispatchSchemaForTests();

  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  await app.register(cors, {
    origin: env.DASHBOARD_URL,
    credentials: true
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/api/invitations/:token", async (request, reply) => {
    const { token } = request.params as { token: string };

    try {
      const invitation = await lookupInvitationByToken(token);
      reply.send(invitation);
    } catch (error) {
      sendPublicError(reply, error, "Invitation lookup failed.", app.log);
    }
  });

  app.post("/api/auth/sign-up/email", async (request, reply) => {
    const headers = fromNodeHeaders(request.headers);
    if (!headers.has("origin")) {
      headers.set("origin", env.DASHBOARD_URL);
    }

    const authResponse = await auth.api.signUpEmail({
      headers,
      body: request.body as Record<string, unknown>,
      returnHeaders: true
    });

    applySetCookie(reply, authResponse.headers);

    if (authResponse.response?.user?.id && authResponse.response.user.role) {
      try {
        const bootstrap = await ensureProfileForUser({
          userId: authResponse.response.user.id,
          role: authResponse.response.user.role as "company" | "retailer" | "driver"
        });
        app.log.info(
          { event: "auth.profile.bootstrap", role: authResponse.response.user.role, created: bootstrap.created, stripeStage: bootstrap.stripeStage },
          "Profile bootstrap completed."
        );
      } catch (error) {
        app.log.error({ event: "auth.profile.bootstrap.error", error }, "Profile bootstrap failed after sign-up.");
        reply.status(502).send({
          code: "PROFILE_BOOTSTRAP_FAILED",
          message: error instanceof Error ? error.message : "Unknown profile bootstrap failure"
        });
        return;
      }
    }

    reply.send(authResponse.response);
  });

  app.post("/api/auth/sign-in/email", async (request, reply) => {
    const headers = fromNodeHeaders(request.headers);
    if (!headers.has("origin")) {
      headers.set("origin", env.DASHBOARD_URL);
    }

    const authResponse = await auth.api.signInEmail({
      headers,
      body: request.body as Record<string, unknown>,
      returnHeaders: true
    });

    applySetCookie(reply, authResponse.headers);
    reply.send(authResponse.response);
  });

  app.get("/api/auth/get-session", async (request, reply) => {
    const headers = fromNodeHeaders(request.headers);
    if (!headers.has("origin")) {
      headers.set("origin", env.DASHBOARD_URL);
    }

    const session = await auth.api.getSession({ headers });
    reply.send(session);
  });

  app.all("/trpc/*", async (request, reply) => {
    const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
    const requestBody = request.method === "GET" || request.method === "HEAD"
      ? undefined
      : request.body == null
        ? undefined
        : typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request(url.toString(), {
        method: request.method,
        headers: request.headers as HeadersInit,
        body: requestBody
      }),
      router: appRouter,
      createContext: () => createTrpcContext({ req: request, res: reply })
    });

    reply.status(response.status);
    response.headers.forEach((value, key) => reply.header(key, value));
    reply.send(await response.text());
  });

  return app;
};

export const startApi = async () => {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  return app;
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));

if (isMain) {
  void startApi();
}
