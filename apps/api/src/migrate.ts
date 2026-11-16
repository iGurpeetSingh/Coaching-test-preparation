import { readFile } from "node:fs/promises";
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

  const migrationName = "001_student_enquiry_management.sql";
  const migrationPath = resolve(process.cwd(), "migrations", migrationName);
  const migration = await readFile(migrationPath, "utf8");

  const alreadyApplied = await sql<{ migration_name: string }>`
SELECT migration_name FROM schema_migrations WHERE migration_name = ${migrationName}
`.execute(db);

  if (alreadyApplied.rows.length > 0) {
    console.log("Migration already applied:", migrationName);
    return;
  }

  await db.transaction().execute(async (trx) => {
    await sql.raw(migration).execute(trx);
    await sql`INSERT INTO schema_migrations (migration_name) VALUES (${migrationName})`.execute(trx);
  });
  console.log("Applied migration:", migrationName);
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
