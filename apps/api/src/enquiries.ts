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


enquiryRouter.get("/dashboard", requirePermission("enquiries.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const conditions = scopeConditions(request);
    conditions.push(sql`e.archived_at IS NULL`);
    const where = sql.join(conditions, sql` AND `);
    const result = await withTenant(auth.tenantId, async (trx) => {
      const metrics = await sql<any>`
        SELECT count(*)::integer AS total,
          count(*) FILTER (WHERE e.created_at >= date_trunc('day', now()))::integer AS new_today,
          count(*) FILTER (WHERE e.status_key='assigned')::integer AS assigned,
          count(*) FILTER (WHERE e.status_key='interested')::integer AS interested,
          count(*) FILTER (WHERE e.status_key='converted')::integer AS converted,
          count(*) FILTER (WHERE e.status_key='lost')::integer AS lost,
          count(*) FILTER (WHERE e.status_key NOT IN ('converted','lost','not_interested'))::integer AS active_pipeline
        FROM enquiries e WHERE ${where}
      `.execute(trx);
      const followups = await sql<any>`
        SELECT count(*) FILTER (WHERE f.scheduled_at < now())::integer AS overdue,
          count(*) FILTER (WHERE f.scheduled_at >= date_trunc('day',now()) AND f.scheduled_at < date_trunc('day',now()) + interval '1 day')::integer AS due_today,
          count(*) FILTER (WHERE f.scheduled_at >= date_trunc('day',now()) + interval '1 day')::integer AS upcoming
        FROM follow_ups f JOIN enquiries e ON e.tenant_id=f.tenant_id AND e.id=f.enquiry_id
        WHERE ${where} AND f.status='pending'
      `.execute(trx);
      const byStatus = await sql<any>`
        SELECT s.key, s.label, count(e.id)::integer AS count
        FROM enquiry_statuses s
        LEFT JOIN enquiries e ON e.tenant_id=s.tenant_id AND e.status_key=s.key
          AND e.archived_at IS NULL
          AND (${request.canAccessAllBranches === true} OR e.branch_id=ANY(${request.accessibleBranchIds || []}::uuid[]))
          AND (${request.permissionSet?.has("enquiries.read_all") === true} OR e.assigned_to_membership_id=${auth.membershipId} OR e.assigned_to_membership_id IS NULL)
        WHERE s.tenant_id=${auth.tenantId} AND s.is_active=true
        GROUP BY s.key,s.label,s.sort_order ORDER BY s.sort_order
      `.execute(trx);
      const trend = await sql<any>`
        SELECT to_char(date_trunc('day',e.created_at),'YYYY-MM-DD') AS day,count(*)::integer AS count
        FROM enquiries e WHERE ${where} AND e.created_at >= now()-interval '29 days'
        GROUP BY date_trunc('day',e.created_at) ORDER BY date_trunc('day',e.created_at)
      `.execute(trx);
      return { metrics: metrics.rows[0], followups: followups.rows[0], statusBreakdown: byStatus.rows, dailyTrend: trend.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

enquiryRouter.get("/enquiries", requirePermission("enquiries.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const page = parsePositiveInteger(request.query.page, 1, 1000000);
    const pageSize = parsePositiveInteger(request.query.pageSize, 20, 100);
    const search = inputText(request.query.q, "Search", 120) || "";
    const status = inputText(request.query.status, "Status", 40);
    const sourceId = inputUuid(request.query.sourceId, "Source");
    const courseId = inputUuid(request.query.courseId, "Course");
    const branchId = inputUuid(request.query.branchId, "Branch");
    const counsellorId = inputUuid(request.query.counsellorId, "Counsellor");
    const archived = request.query.archived === "true";
    if (archived && !request.permissionSet?.has("enquiries.archive")) throw new ApiError(403, "FORBIDDEN", "You cannot view archived enquiries.");
    if (branchId) assertBranch(request, branchId);
    const conditions = scopeConditions(request);
    conditions.push(archived ? sql`e.archived_at IS NOT NULL` : sql`e.archived_at IS NULL`);
    if (search) {
      const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
      conditions.push(sql`(e.student_name ILIKE ${pattern} OR e.parent_name ILIKE ${pattern} OR e.mobile ILIKE ${pattern} OR e.enquiry_number ILIKE ${pattern})`);
    }
    if (status) conditions.push(sql`e.status_key=${status}`);
    if (sourceId) conditions.push(sql`e.source_id=${sourceId}`);
    if (courseId) conditions.push(sql`e.course_id=${courseId}`);
    if (branchId) conditions.push(sql`e.branch_id=${branchId}`);
    if (counsellorId) conditions.push(sql`e.assigned_to_membership_id=${counsellorId}`);
    const order = request.query.sort === "name" ? sql`e.student_name ASC` : request.query.sort === "updated" ? sql`e.updated_at DESC` : sql`e.created_at DESC`;
    const where = sql.join(conditions, sql` AND `);
    const data = await withTenant(auth.tenantId, async (trx) => {
      const count = await sql<{total:number}>`SELECT count(*)::integer AS total FROM enquiries e WHERE ${where}`.execute(trx);
      const rows = await sql<any>`
        SELECT e.id,e.enquiry_number,e.student_name,e.parent_name,e.mobile,e.email,e.current_class,
          e.priority,e.status_key,e.created_at,e.updated_at,e.expected_joining_date,e.remarks,e.row_version,
          b.id AS branch_id,b.name AS branch_name,c.id AS course_id,c.name AS course_name,
          s.id AS source_id,s.name AS source_name,m.id AS counsellor_membership_id,u.full_name AS counsellor_name
        FROM enquiries e
        JOIN branches b ON b.tenant_id=e.tenant_id AND b.id=e.branch_id
        LEFT JOIN courses c ON c.tenant_id=e.tenant_id AND c.id=e.course_id
        LEFT JOIN enquiry_sources s ON s.tenant_id=e.tenant_id AND s.id=e.source_id
        LEFT JOIN memberships m ON m.tenant_id=e.tenant_id AND m.id=e.assigned_to_membership_id
        LEFT JOIN users u ON u.id=m.user_id
        WHERE ${where} ORDER BY ${order}
        LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}
      `.execute(trx);
      return { items: rows.rows, total: Number(count.rows[0]?.total || 0) };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ ...data, page, pageSize, pageCount: Math.ceil(data.total/pageSize) });
  } catch (error) { next(error); }
});
