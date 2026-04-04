import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

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
