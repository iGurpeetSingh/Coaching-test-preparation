import { Router, type Request } from "express";
import { sql, type RawBuilder } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, assertBranch } from "./enquiry-service.js";
import { parsePositiveInteger } from "./enquiry-domain.js";

export const academicRouter = Router();
academicRouter.use(requireAuth);
academicRouter.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request, response, next);
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function inputText(value: unknown, label: string, max: number, required = false): string | null {
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
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " is invalid.");
  }
  return value;
}

function inputDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " must use YYYY-MM-DD.");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " is not a valid calendar date.");
  }
  return value;
}

function inputNonNegativeNumber(value: unknown, label: string, fallback?: number): number {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999.99) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " must be a valid non-negative amount.");
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function inputOptionalPositiveInteger(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiError(400, "VALIDATION_ERROR", label + " must be a positive whole number.");
  }
  return parsed;
}

function branchScope(request: Request, alias = "b"): RawBuilder<unknown>[] {
  const auth = actorOf(request);
  const conditions: RawBuilder<unknown>[] = [sql`${sql.raw(alias)}.tenant_id = ${auth.tenantId}`];
  if (!request.canAccessAllBranches) {
    const branchIds = request.accessibleBranchIds || [];
    conditions.push(branchIds.length
      ? sql`${sql.raw(alias)}.branch_id = ANY(${branchIds}::uuid[])`
      : sql`false`);
  }
  return conditions;
}

academicRouter.get("/courses", requirePermission("admissions.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const includeInactive = request.query.includeInactive === "true" && request.permissionSet?.has("courses.manage");
    const result = await withTenant(auth.tenantId, (trx) => sql`
      SELECT id, code, name, description, duration_months, default_fee, is_active, created_at
      FROM courses
      WHERE tenant_id = ${auth.tenantId} AND (${includeInactive} = true OR is_active = true)
      ORDER BY name, code
    `.execute(trx));
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

academicRouter.post("/courses", requirePermission("courses.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const code = inputText(request.body?.code, "Course code", 32, true)!.toUpperCase();
    const name = inputText(request.body?.name, "Course name", 160, true)!;
    const description = inputText(request.body?.description, "Description", 2000);
    const durationMonths = inputOptionalPositiveInteger(request.body?.durationMonths, "Duration");
    const defaultFee = inputNonNegativeNumber(request.body?.defaultFee, "Default fee", 0);
    const result = await withTenant(auth.tenantId, (trx) => sql`
      INSERT INTO courses (tenant_id, code, name, description, duration_months, default_fee)
      VALUES (${auth.tenantId}, ${code}, ${name}, ${description}, ${durationMonths}, ${defaultFee})
      RETURNING id, code, name, description, duration_months, default_fee, is_active, created_at
    `.execute(trx));
    response.status(201).json({ course: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

academicRouter.patch("/courses/:id", requirePermission("courses.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const id = inputUuid(request.params.id, "Course", true)!;
    const updates: RawBuilder<unknown>[] = [];
    if (request.body?.code !== undefined) updates.push(sql`code = ${inputText(request.body.code, "Course code", 32, true)!.toUpperCase()}`);
    if (request.body?.name !== undefined) updates.push(sql`name = ${inputText(request.body.name, "Course name", 160, true)!}`);
    if (request.body?.description !== undefined) updates.push(sql`description = ${inputText(request.body.description, "Description", 2000)}`);
    if (request.body?.durationMonths !== undefined) updates.push(sql`duration_months = ${inputOptionalPositiveInteger(request.body.durationMonths, "Duration")}`);
    if (request.body?.defaultFee !== undefined) updates.push(sql`default_fee = ${inputNonNegativeNumber(request.body.defaultFee, "Default fee")}`);
    if (request.body?.isActive !== undefined) {
      if (typeof request.body.isActive !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", "isActive must be true or false.");
      updates.push(sql`is_active = ${request.body.isActive}`);
    }
    if (!updates.length) throw new ApiError(400, "NO_CHANGES", "Provide at least one course field to update.");
    const result = await withTenant(auth.tenantId, (trx) => sql`
      UPDATE courses SET ${sql.join(updates, sql`, `)}
      WHERE tenant_id = ${auth.tenantId} AND id = ${id}
      RETURNING id, code, name, description, duration_months, default_fee, is_active, created_at
    `.execute(trx));
    if (!result.rows[0]) throw new ApiError(404, "COURSE_NOT_FOUND", "Course was not found.");
    response.json({ course: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

academicRouter.get("/batches", requirePermission("admissions.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const branchId = inputUuid(request.query.branchId, "Branch");
    const courseId = inputUuid(request.query.courseId, "Course");
    if (branchId) assertBranch(request, branchId);
    const conditions = branchScope(request, "ba");
    if (branchId) conditions.push(sql`ba.branch_id = ${branchId}`);
    if (courseId) conditions.push(sql`ba.course_id = ${courseId}`);
    const where = sql.join(conditions, sql` AND `);
    const result = await withTenant(auth.tenantId, (trx) => sql`
      SELECT ba.id, ba.branch_id, ba.course_id, ba.code, ba.name, ba.start_date,
             ba.end_date, ba.seat_limit, ba.is_active, b.name AS branch_name,
             c.name AS course_name,
             (SELECT count(*)::integer FROM admissions a
              WHERE a.tenant_id = ba.tenant_id AND a.batch_id = ba.id) AS enrolled_count
      FROM batches ba
      JOIN branches b ON b.tenant_id = ba.tenant_id AND b.id = ba.branch_id
      JOIN courses c ON c.tenant_id = ba.tenant_id AND c.id = ba.course_id
      WHERE ${where}
      ORDER BY ba.start_date DESC NULLS LAST, ba.name
    `.execute(trx));
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

academicRouter.post("/batches", requirePermission("courses.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const branchId = inputUuid(request.body?.branchId, "Branch", true)!;
    const courseId = inputUuid(request.body?.courseId, "Course", true)!;
    const code = inputText(request.body?.code, "Batch code", 32, true)!.toUpperCase();
    const name = inputText(request.body?.name, "Batch name", 160, true)!;
    const startDate = inputDate(request.body?.startDate, "Start date");
    const endDate = inputDate(request.body?.endDate, "End date");
    const seatLimit = inputOptionalPositiveInteger(request.body?.seatLimit, "Seat limit");
    if (startDate && endDate && endDate < startDate) throw new ApiError(400, "INVALID_DATE_RANGE", "End date must be on or after start date.");
    assertBranch(request, branchId);
    const result = await withTenant(auth.tenantId, async (trx) => {
      const reference = await sql`
        SELECT 1 FROM courses WHERE tenant_id = ${auth.tenantId} AND id = ${courseId} AND is_active = true
      `.execute(trx);
      if (!reference.rows.length) throw new ApiError(400, "COURSE_UNAVAILABLE", "The selected course is unavailable.");
      return sql`
        INSERT INTO batches (tenant_id, branch_id, course_id, code, name, start_date, end_date, seat_limit)
        VALUES (${auth.tenantId}, ${branchId}, ${courseId}, ${code}, ${name}, ${startDate}, ${endDate}, ${seatLimit})
        RETURNING id, branch_id, course_id, code, name, start_date, end_date, seat_limit, is_active, created_at
      `.execute(trx);
    });
    response.status(201).json({ batch: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

academicRouter.patch("/batches/:id", requirePermission("courses.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const id = inputUuid(request.params.id, "Batch", true)!;
    const updates: RawBuilder<unknown>[] = [];
    if (request.body?.code !== undefined) updates.push(sql`code = ${inputText(request.body.code, "Batch code", 32, true)!.toUpperCase()}`);
    if (request.body?.name !== undefined) updates.push(sql`name = ${inputText(request.body.name, "Batch name", 160, true)!}`);
    if (request.body?.startDate !== undefined) updates.push(sql`start_date = ${inputDate(request.body.startDate, "Start date")}`);
    if (request.body?.endDate !== undefined) updates.push(sql`end_date = ${inputDate(request.body.endDate, "End date")}`);
    if (request.body?.seatLimit !== undefined) updates.push(sql`seat_limit = ${inputOptionalPositiveInteger(request.body.seatLimit, "Seat limit")}`);
    if (request.body?.isActive !== undefined) {
      if (typeof request.body.isActive !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", "isActive must be true or false.");
      updates.push(sql`is_active = ${request.body.isActive}`);
    }
    if (!updates.length) throw new ApiError(400, "NO_CHANGES", "Provide at least one batch field to update.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const current = await sql<any>`SELECT branch_id, start_date, end_date FROM batches WHERE tenant_id = ${auth.tenantId} AND id = ${id}`.execute(trx);
      if (!current.rows[0]) throw new ApiError(404, "BATCH_NOT_FOUND", "Batch was not found.");
      assertBranch(request, current.rows[0].branch_id);
      const start = request.body?.startDate !== undefined ? inputDate(request.body.startDate, "Start date") : current.rows[0].start_date;
      const end = request.body?.endDate !== undefined ? inputDate(request.body.endDate, "End date") : current.rows[0].end_date;
      if (start && end && String(end) < String(start)) throw new ApiError(400, "INVALID_DATE_RANGE", "End date must be on or after start date.");
      return sql`
        UPDATE batches SET ${sql.join(updates, sql`, `)}
        WHERE tenant_id = ${auth.tenantId} AND id = ${id}
        RETURNING id, branch_id, course_id, code, name, start_date, end_date, seat_limit, is_active, created_at
      `.execute(trx);
    });
    response.json({ batch: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

academicRouter.get("/students", requirePermission("admissions.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const page = parsePositiveInteger(request.query.page, 1, 1000000);
    const pageSize = parsePositiveInteger(request.query.pageSize, 20, 100);
    const branchId = inputUuid(request.query.branchId, "Branch");
    const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 120) : "";
    if (branchId) assertBranch(request, branchId);
    const conditions: RawBuilder<unknown>[] = [sql`a.tenant_id = ${auth.tenantId}`];
    if (!request.canAccessAllBranches) {
      const branchIds = request.accessibleBranchIds || [];
      conditions.push(branchIds.length ? sql`a.branch_id = ANY(${branchIds}::uuid[])` : sql`false`);
    }
    if (branchId) conditions.push(sql`a.branch_id = ${branchId}`);
    if (search) {
      const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
      conditions.push(sql`(s.full_name ILIKE ${pattern} OR s.mobile ILIKE ${pattern} OR s.student_number ILIKE ${pattern})`);
    }
    const where = sql.join(conditions, sql` AND `);
    const data = await withTenant(auth.tenantId, async (trx) => {
      const count = await sql`
        SELECT count(DISTINCT s.id)::integer AS total
        FROM students s
        JOIN admissions a ON a.tenant_id = s.tenant_id AND a.student_id = s.id
        WHERE ${where}
      `.execute(trx);
      const rows = await sql`
        SELECT * FROM (
          SELECT DISTINCT ON (s.id)
            s.id, s.student_number, s.full_name, s.mobile, s.email,
            s.date_of_birth, s.guardian_name, s.guardian_mobile, s.created_at,
            a.admission_number, a.admitted_at, a.branch_id, b.name AS branch_name,
            c.name AS course_name, ba.name AS batch_name
          FROM students s
          JOIN admissions a ON a.tenant_id = s.tenant_id AND a.student_id = s.id
          JOIN branches b ON b.tenant_id = a.tenant_id AND b.id = a.branch_id
          JOIN courses c ON c.tenant_id = a.tenant_id AND c.id = a.course_id
          LEFT JOIN batches ba ON ba.tenant_id = a.tenant_id AND ba.id = a.batch_id
          WHERE ${where}
          ORDER BY s.id, a.admitted_at DESC, a.id DESC
        ) latest_admission
        ORDER BY admitted_at DESC, full_name
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `.execute(trx);
      return { items: rows.rows, total: Number(count.rows[0]?.total || 0) };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ ...data, page, pageSize, pageCount: Math.ceil(data.total / pageSize) });
  } catch (error) {
    next(error);
  }
});
