import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

const candidateRoots = [process.cwd(), resolve(process.cwd(), "../..")];
const envFiles = candidateRoots.flatMap((root) => [resolve(root, ".env"), resolve(root, ".env.example")]);

for (const file of envFiles) {
  if (existsSync(file)) {
    loadEnv({ path: file, override: false });
  }
}

export const createDbClient = (databaseUrl: string) => {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10
  });

  return {
    pool,
    db: drizzle(pool, {
      schema,
      casing: "snake_case"
    })
  };
};

const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl ? createDbClient(databaseUrl).pool : null;
export const db = databaseUrl ? createDbClient(databaseUrl).db : null;

export const assertDb = () => {
  if (!db || !pool) {
    throw new Error("DATABASE_URL is required to initialize @repo/db.");
  }

  return { db, pool };
};
