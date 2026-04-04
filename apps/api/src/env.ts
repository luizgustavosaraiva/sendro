import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const candidateRoots = [process.cwd(), resolve(process.cwd(), "../..")];
const envFiles = candidateRoots.flatMap((root) => [resolve(root, ".env"), resolve(root, ".env.example")]);

for (const file of envFiles) {
  if (existsSync(file)) {
    loadEnv({ path: file, override: false });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1),
  API_URL: z.string().url().default("http://localhost:3001"),
  DASHBOARD_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(1),
  STRIPE_API_KEY: z.string().min(1).optional()
});

export const env = envSchema.parse(process.env);
export const isTest = env.NODE_ENV === "test";
