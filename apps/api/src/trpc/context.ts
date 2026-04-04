import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../auth";

export const createTrpcContext = async (opts: { req: FastifyRequest; res: FastifyReply }) => {
  const headers = fromNodeHeaders(opts.req.headers);
  const session = await auth.api.getSession({ headers });

  return {
    req: opts.req,
    res: opts.res,
    session
  };
};

export type TrpcContext = Awaited<ReturnType<typeof createTrpcContext>>;
