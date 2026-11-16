import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sql } from "kysely";
import { db, pool } from "./db.js";

async function main() {
  await sql.raw(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
`).execute(db);

  const migrationDirectory = resolve(process.cwd(), "migrations");
  const migrationNames = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_[a-z0-9_]+\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right, "en"));

  if (!migrationNames.length) {
    console.log("No SQL migrations were found.");
    return;
  }

  for (const migrationName of migrationNames) {
    const alreadyApplied = await sql<{ migration_name: string }>`
      SELECT migration_name FROM schema_migrations WHERE migration_name = ${migrationName}
    `.execute(db);

    if (alreadyApplied.rows.length > 0) {
      console.log("Migration already applied:", migrationName);
      continue;
    }

    const migration = await readFile(resolve(migrationDirectory, migrationName), "utf8");
    await db.transaction().execute(async (trx) => {
      await sql.raw(migration).execute(trx);
      await sql`INSERT INTO schema_migrations (migration_name) VALUES (${migrationName})`.execute(trx);
    });
    console.log("Applied migration:", migrationName);
  }
}

main()
  .catch((error) => {
    console.error("Database migration failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
    await pool.end();
  });
