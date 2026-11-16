import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
  ...(process.env.PGSSL === "true"
    ? { ssl: { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } }
    : {})
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error.message);
});

export const db = new Kysely<any>({
  dialect: new PostgresDialect({ pool })
});

export type TenantTransaction = Transaction<any>;

export async function withTenant<T>(
  tenantId: string,
  operation: (trx: TenantTransaction) => Promise<T>
): Promise<T> {
  if (!tenantId) throw new Error("Tenant context is required.");
  return db.transaction().execute(async (trx) => {
    // Transaction-local context is reset automatically before a pooled connection is reused.
    await sql`select set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);
    return operation(trx);
  });
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await sql`select 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await db.destroy();
}
