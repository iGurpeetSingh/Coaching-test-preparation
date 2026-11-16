import { Router } from "express";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { actorOf } from "./enquiry-service.js";
import { sql, type RawBuilder } from "kysely";
import { ApiError, getEnquiry, assertEnquiryScope, addActivity, addAudit, assignEnquiry, chooseRoundRobinCounsellor } from "./enquiry-service.js";
import { canTransition, normalizePhone, validatePhone, normalizePersonName, parsePositiveInteger, validateFee } from "./enquiry-domain.js";

export const enquiryRouter = Router();
enquiryRouter.use(requireAuth);
enquiryRouter.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request, response, next);
});

enquiryRouter.get("/enquiries/summary", requirePermission("enquiries.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const result = await withTenant(auth.tenantId, async (trx) => {
      return sql`SELECT count(*)::integer AS total FROM enquiries WHERE tenant_id = ${auth.tenantId} AND archived_at IS NULL`.execute(trx);
    });
    response.json({ total: Number(result.rows[0]?.total || 0) });
  } catch (error) {
    next(error);
  }
});


import { sql, type RawBuilder } from "kysely";
import { ApiError, getEnquiry, assertEnquiryScope, addActivity, addAudit, assignEnquiry, chooseRoundRobinCounsellor } from "./enquiry-service.js";
import { canTransition, normalizePhone, validatePhone, normalizePersonName, parsePositiveInteger, validateFee } from "./enquiry-domain.js";

function inputText(value: unknown, label: string, max = 250, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
    return null;
  }
  if (typeof value !== "string") throw new ApiError(400, "VALIDATION_ERROR", label + " must be text.");
  const result = value.trim();
  if (required && !result) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
  if (result.length > max) throw new ApiError(400, "VALIDATION_ERROR", label + " is too long.");
  return result || null;
}

function inputUuid(value: unknown, label: string, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
    return null;
  }
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " is invalid.");
  }
  return value;
}

function inputDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " must use YYYY-MM-DD.");
  }
  return value;
}

function scopeConditions(request: Request, alias = "e"): RawBuilder<unknown>[] {
  const auth = actorOf(request);
  const conditions: RawBuilder<unknown>[] = [sql`${sql.raw(alias)}.tenant_id = ${auth.tenantId}`];
  const branches = request.accessibleBranchIds || [];
  if (!request.canAccessAllBranches) {
    conditions.push(branches.length ? sql`${sql.raw(alias)}.branch_id = ANY(${branches}::uuid[])` : sql`false`);
    if (!request.permissionSet?.has("enquiries.read_all")) {
      conditions.push(sql`(${sql.raw(alias)}.assigned_to_membership_id = ${auth.membershipId} OR ${sql.raw(alias)}.assigned_to_membership_id IS NULL)`);
    }
  }
  return conditions;
}

async function assertReference(trx: any, tenantId: string, table: "branches" | "courses" | "enquiry_sources", id: string | null, label: string): Promise<void> {
  if (!id) return;
  const found = await sql<{id:string}>`SELECT id FROM ${sql.raw(table)} WHERE tenant_id=${tenantId} AND id=${id} AND is_active=true LIMIT 1`.execute(trx);
  if (!found.rows.length) throw new ApiError(400, "INVALID_REFERENCE", label + " is unavailable or belongs to another institute.");
}

async function nextSequence(trx:any, table:"enquiry_id_sequences"|"admission_id_sequences", tenantId:string, branchId:string, period:string):Promise<number>{
  const result = table==="enquiry_id_sequences"
    ? await sql<{last_value:number}>`INSERT INTO enquiry_id_sequences (tenant_id,branch_id,period_key,last_value) VALUES (${tenantId},${branchId},${period},1) ON CONFLICT (tenant_id,branch_id,period_key) DO UPDATE SET last_value=enquiry_id_sequences.last_value+1 RETURNING last_value`.execute(trx)
    : await sql<{last_value:number}>`INSERT INTO admission_id_sequences (tenant_id,branch_id,period_key,last_value) VALUES (${tenantId},${branchId},${period},1) ON CONFLICT (tenant_id,branch_id,period_key) DO UPDATE SET last_value=admission_id_sequences.last_value+1 RETURNING last_value`.execute(trx);
  return Number(result.rows[0].last_value);
}
