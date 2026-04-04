import Fastify from "fastify";
import cors from "@fastify/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { env } from "./env";
import { ensureProfileForUser } from "./routes/auth/register";
import { appRouter } from "./trpc/router";
import { createTrpcContext } from "./trpc/context";

const applySetCookie = (reply: import("fastify").FastifyReply, headers: Headers) => {
  const setCookie = headers.get("set-cookie");
  if (setCookie) {
    reply.header("set-cookie", setCookie);
  }
};

export const buildApp = async () => {
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  await app.register(cors, {
    origin: env.DASHBOARD_URL,
    credentials: true
  });

  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    try {
      const payload = typeof body === "string" ? body : body.toString("utf8");
      done(null, payload ? JSON.parse(payload) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

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
      : JSON.stringify(request.body ?? null);

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
