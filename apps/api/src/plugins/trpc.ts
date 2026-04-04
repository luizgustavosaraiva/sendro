import type { FastifyInstance } from "fastify";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../trpc/router";
import { createTrpcContext } from "../trpc/context";

export const registerTrpc = async (app: FastifyInstance) => {
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
};
