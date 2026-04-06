import { readFileSync } from "node:fs";
import { Client } from "pg";

const readDatabaseUrl = () => {
  const env = readFileSync(".env", "utf8").split(/\r?\n/);
  const line = env.find((entry) => entry.startsWith("DATABASE_URL="));
  if (!line) {
    throw new Error("DATABASE_URL is required for repair-local-drizzle-state.");
  }

  return line.slice("DATABASE_URL=".length);
};

const migrationHashes = {
  "0000_parched_misty_knight": "76d9e383aa0ba21c23d65186084fb949ed5bd1de0588556d908466b83ffb036e",
  "0001_dispatch_queue": "875a2ff9442d8b7b3a6dae7da64b06dbb1545813dc54ade6754315d93a2cf301"
} as const;

const migrationTimes = {
  "0000_parched_misty_knight": 1775334643211,
  "0001_dispatch_queue": 1775395200000
} as const;

const main = async () => {
  const client = new Client({ connectionString: readDatabaseUrl() });
  await client.connect();

  try {
    await client.query("begin");

    await client.query('create schema if not exists drizzle');
    await client.query(`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint not null
      )
    `);

    const hasDispatchQueueTable = await client.query(`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = 'dispatch_queue_entries'
      ) as exists
    `);

    const hasDispatchAttemptsStatus = await client.query(`
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'dispatch_attempts'
          and column_name = 'status'
      ) as exists
    `);

    if (hasDispatchQueueTable.rows[0]?.exists && hasDispatchAttemptsStatus.rows[0]?.exists) {
      const existing0001 = await client.query(
        `select 1 from drizzle.__drizzle_migrations where hash = $1 limit 1`,
        [migrationHashes["0001_dispatch_queue"]]
      );

      if (existing0001.rowCount === 0) {
        await client.query(
          `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
          [migrationHashes["0001_dispatch_queue"], migrationTimes["0001_dispatch_queue"]]
        );
      }
    }

    const existing0000 = await client.query(
      `select 1 from drizzle.__drizzle_migrations where hash = $1 limit 1`,
      [migrationHashes["0000_parched_misty_knight"]]
    );
    if (existing0000.rowCount === 0) {
      await client.query(
        `insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`,
        [migrationHashes["0000_parched_misty_knight"], migrationTimes["0000_parched_misty_knight"]]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
