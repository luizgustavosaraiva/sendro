import "./env";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { env } from "./env";
import { ensureProfileForUser } from "./routes/auth/register";
import { registerTrpc } from "./plugins/trpc";

export const buildApp = async () => {
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  await app.register(cors, {
    origin: env.DASHBOARD_URL,
    credentials: true
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.all("/api/auth/*", async (request, reply) => {
    const url = new URL(request.url, env.API_URL);
    const headers = fromNodeHeaders(request.headers);
    if (!headers.has("origin")) {
      headers.set("origin", env.DASHBOARD_URL);
    }
    const body = request.method === "GET" || request.method === "HEAD"
      ? undefined
      : JSON.stringify(request.body ?? null);

    const authRequest = new Request(url.toString(), {
      method: request.method,
      headers,
      body
    });

    const authResponse = await auth.handler(authRequest);
    reply.status(authResponse.status);
    authResponse.headers.forEach((value: string, key: string) => reply.header(key, value));

    const pathname = new URL(authRequest.url).pathname;
    if (authResponse.ok && pathname.endsWith("/sign-up/email")) {
      try {
        const session = await auth.api.getSession({ headers: authResponse.headers });
        const sessionUser = session?.user as { id?: string; role?: "company" | "retailer" | "driver" } | undefined;
        if (sessionUser?.id && sessionUser.role) {
          const bootstrap = await ensureProfileForUser({ userId: sessionUser.id, role: sessionUser.role });
          app.log.info(
            { event: "auth.profile.bootstrap", role: sessionUser.role, created: bootstrap.created, stripeStage: bootstrap.stripeStage },
            "Profile bootstrap completed."
          );
        }
      } catch (error) {
        app.log.error({ event: "auth.profile.bootstrap.error", error }, "Profile bootstrap failed after sign-up.");
        reply.status(502).send({
          code: "PROFILE_BOOTSTRAP_FAILED",
          message: error instanceof Error ? error.message : "Unknown profile bootstrap failure"
        });
        return;
      }
    }

    const text = authResponse.body ? await authResponse.text() : null;
    reply.send(text);
  });

  await registerTrpc(app);

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
