import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

const workspaceRoot = resolve(process.cwd(), "../..");
for (const file of [resolve(workspaceRoot, ".env"), resolve(workspaceRoot, ".env.example")]) {
  if (existsSync(file)) {
    loadEnv({ path: file, override: false });
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run Drizzle commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl
  },
  strict: true,
  verbose: true
});
