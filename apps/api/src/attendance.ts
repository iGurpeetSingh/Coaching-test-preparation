import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, assertBranch } from "./enquiry-service.js";

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);
attendanceRouter.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request, response, next);
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown, label: string, required = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ApiError(400, "VALIDATION_ERROR", label + " is required.");
    return null;
  }
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "VALIDATION_ERROR", label + " is invalid.");
  return value;
}
function text(value: unknown, label: string, max: number, required = false): string | null {
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
async function getAccessibleBatch(trx: any, request: any, batchId: string) {
  const auth = actorOf(request);
  const result = await sql<any>`
    SELECT ba.id, ba.branch_id, ba.name, ba.code
    FROM batches ba
    WHERE ba.tenant_id = ${auth.tenantId} AND ba.id = ${batchId} AND ba.is_active = true
    LIMIT 1
  `.execute(trx);
  const batch = result.rows[0];
  if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", "The active batch was not found.");
  assertBranch(request, batch.branch_id);
  return batch;
}

attendanceRouter.get("/attendance/sessions", requirePermission("attendance.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const batchId = uuid(request.query.batchId, "Batch");
    const from = text(request.query.from, "From date", 10);
    const to = text(request.query.to, "To date", 10);
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new ApiError(400, "INVALID_DATE", "From date must use YYYY-MM-DD.");
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new ApiError(400, "INVALID_DATE", "To date must use YYYY-MM-DD.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      if (batchId) await getAccessibleBatch(trx, request, batchId);
      const branchIds = request.accessibleBranchIds || [];
      const rows = await sql<any>`
        SELECT s.id, s.batch_id, ba.name AS batch_name, s.branch_id, b.name AS branch_name,
               s.session_date, s.starts_at, s.ends_at, s.topic, s.status, s.submitted_at,
               count(ar.id)::integer AS marked_count,
               (SELECT count(*)::integer FROM admissions a
                WHERE a.tenant_id=s.tenant_id AND a.batch_id=s.batch_id) AS roster_count
        FROM attendance_sessions s
        JOIN batches ba ON ba.tenant_id=s.tenant_id AND ba.id=s.batch_id
        JOIN branches b ON b.tenant_id=s.tenant_id AND b.id=s.branch_id
        LEFT JOIN attendance_records ar ON ar.tenant_id=s.tenant_id AND ar.session_id=s.id
        WHERE s.tenant_id=${auth.tenantId}
          AND (${request.canAccessAllBranches === true} OR s.branch_id = ANY(${branchIds}::uuid[]))
          AND (${batchId}::uuid IS NULL OR s.batch_id=${batchId})
          AND (${from}::date IS NULL OR s.session_date >= ${from}::date)
          AND (${to}::date IS NULL OR s.session_date <= ${to}::date)
        GROUP BY s.id, ba.name, b.name
        ORDER BY s.session_date DESC, s.starts_at DESC
        LIMIT 200
      `.execute(trx);
      return rows.rows;
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result });
  } catch (error) { next(error); }
});

attendanceRouter.post("/attendance/sessions", requirePermission("attendance.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const batchId = uuid(request.body?.batchId, "Batch", true)!;
    const sessionDate = text(request.body?.sessionDate, "Session date", 10, true)!;
    const startsAt = text(request.body?.startsAt, "Start time", 50, true)!;
    const endsAt = text(request.body?.endsAt, "End time", 50, true)!;
    const topic = text(request.body?.topic, "Topic", 240);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) || Number.isNaN(Date.parse(sessionDate + "T00:00:00Z"))) {
      throw new ApiError(400, "INVALID_DATE", "Session date must use YYYY-MM-DD.");
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      throw new ApiError(400, "INVALID_TIME_RANGE", "Provide valid start and end times; end must be after start.");
    }
    const result = await withTenant(auth.tenantId, async (trx) => {
      const batch = await getAccessibleBatch(trx, request, batchId);
      const inserted = await sql<any>`
        INSERT INTO attendance_sessions
          (tenant_id, branch_id, batch_id, session_date, starts_at, ends_at, topic, created_by_membership_id)
        VALUES
          (${auth.tenantId}, ${batch.branch_id}, ${batch.id}, ${sessionDate}, ${start.toISOString()}, ${end.toISOString()}, ${topic}, ${auth.membershipId})
        RETURNING *
      `.execute(trx);
      return inserted.rows[0];
    });
    response.status(201).json({ session: result });
  } catch (error) { next(error); }
});

attendanceRouter.get("/attendance/sessions/:id/roster", requirePermission("attendance.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const sessionId = uuid(request.params.id, "Session", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const sessionRows = await sql<any>`
        SELECT s.*, ba.name AS batch_name
        FROM attendance_sessions s JOIN batches ba ON ba.tenant_id=s.tenant_id AND ba.id=s.batch_id
        WHERE s.tenant_id=${auth.tenantId} AND s.id=${sessionId}
      `.execute(trx);
      const session = sessionRows.rows[0];
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Attendance session was not found.");
      assertBranch(request, session.branch_id);
      const roster = await sql<any>`
        SELECT DISTINCT st.id AS student_id, st.student_number, st.full_name, st.mobile,
               ar.status AS attendance_status, ar.remarks, ar.marked_at
        FROM admissions a
        JOIN students st ON st.tenant_id=a.tenant_id AND st.id=a.student_id
        LEFT JOIN attendance_records ar ON ar.tenant_id=st.tenant_id
          AND ar.student_id=st.id AND ar.session_id=${sessionId}
        WHERE a.tenant_id=${auth.tenantId} AND a.batch_id=${session.batch_id}
        ORDER BY st.full_name, st.student_number
      `.execute(trx);
      return { session, students: roster.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

attendanceRouter.put("/attendance/sessions/:id/records", requirePermission("attendance.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const sessionId = uuid(request.params.id, "Session", true)!;
    const records = request.body?.records;
    if (!Array.isArray(records) || records.length < 1 || records.length > 500) {
      throw new ApiError(400, "INVALID_ATTENDANCE_PAYLOAD", "Provide between 1 and 500 attendance records.");
    }
    const normalized = records.map((record: any, index: number) => {
      const studentId = uuid(record?.studentId, "Student ID", true)!;
      const status = text(record?.status, "Attendance status", 16, true)!;
      if (!["present", "absent", "late", "excused"].includes(status)) {
        throw new ApiError(400, "INVALID_ATTENDANCE_STATUS", "Record " + (index + 1) + " has an invalid status.");
      }
      return { studentId, status, remarks: text(record?.remarks, "Remarks", 500) };
    });
    if (new Set(normalized.map((item) => item.studentId)).size !== normalized.length) {
      throw new ApiError(400, "DUPLICATE_STUDENT", "A student may appear only once in an attendance submission.");
    }
    const result = await withTenant(auth.tenantId, async (trx) => {
      const sessionRows = await sql<any>`
        SELECT id, branch_id, batch_id, status FROM attendance_sessions
        WHERE tenant_id=${auth.tenantId} AND id=${sessionId} FOR UPDATE
      `.execute(trx);
      const session = sessionRows.rows[0];
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Attendance session was not found.");
      assertBranch(request, session.branch_id);
      if (session.status !== "open") throw new ApiError(409, "SESSION_NOT_OPEN", "Submitted or locked attendance cannot be changed.");
      const eligible = await sql<any>`
        SELECT DISTINCT student_id FROM admissions
        WHERE tenant_id=${auth.tenantId} AND batch_id=${session.batch_id}
          AND student_id=ANY(${normalized.map((item) => item.studentId)}::uuid[])
      `.execute(trx);
      if (eligible.rows.length !== normalized.length) {
        throw new ApiError(400, "STUDENT_NOT_IN_BATCH", "Every student must be enrolled in the session batch.");
      }
      for (const item of normalized) {
        await sql`
          INSERT INTO attendance_records (tenant_id, session_id, student_id, status, remarks, marked_by_membership_id)
          VALUES (${auth.tenantId}, ${sessionId}, ${item.studentId}, ${item.status}, ${item.remarks}, ${auth.membershipId})
          ON CONFLICT (tenant_id, session_id, student_id)
          DO UPDATE SET status=EXCLUDED.status, remarks=EXCLUDED.remarks,
            marked_by_membership_id=EXCLUDED.marked_by_membership_id, marked_at=now(), updated_at=now()
        `.execute(trx);
      }
      return { saved: normalized.length };
    });
    response.json(result);
  } catch (error) { next(error); }
});

attendanceRouter.post("/attendance/sessions/:id/submit", requirePermission("attendance.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const sessionId = uuid(request.params.id, "Session", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const rows = await sql<any>`
        SELECT s.id, s.branch_id, s.batch_id, s.status,
          (SELECT count(DISTINCT a.student_id)::integer FROM admissions a
           WHERE a.tenant_id=s.tenant_id AND a.batch_id=s.batch_id) AS roster_count,
          (SELECT count(*)::integer FROM attendance_records ar
           WHERE ar.tenant_id=s.tenant_id AND ar.session_id=s.id) AS marked_count
        FROM attendance_sessions s
        WHERE s.tenant_id=${auth.tenantId} AND s.id=${sessionId}
        FOR UPDATE
      `.execute(trx);
      const session = rows.rows[0];
      if (!session) throw new ApiError(404, "SESSION_NOT_FOUND", "Attendance session was not found.");
      assertBranch(request, session.branch_id);
      if (session.status !== "open") throw new ApiError(409, "SESSION_NOT_OPEN", "This attendance session is already submitted or locked.");
      if (Number(session.roster_count) !== Number(session.marked_count)) {
        throw new ApiError(409, "ATTENDANCE_INCOMPLETE", "Mark every student before submitting attendance.",);
      }
      const updated = await sql<any>`
        UPDATE attendance_sessions SET status='submitted', submitted_at=now(), updated_at=now()
        WHERE tenant_id=${auth.tenantId} AND id=${sessionId} RETURNING id, status, submitted_at
      `.execute(trx);
      return updated.rows[0];
    });
    response.json({ session: result });
  } catch (error) { next(error); }
});
