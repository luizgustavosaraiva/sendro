import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { assertDb, schema } from "@repo/db";
import { env } from "./env";

const { db } = assertDb();

export const auth: any = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.API_URL,
  trustedOrigins: [env.DASHBOARD_URL],
  emailAndPassword: {
    enabled: true
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: true,
        required: true
      }
    }
  }
});
