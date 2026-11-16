import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, assertBranch } from "./enquiry-service.js";

export const paperRouter = Router();
paperRouter.use(requireAuth);
paperRouter.use((request, response, next) => {
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
function positiveInteger(value: unknown, label: string, min: number, max: number): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new ApiError(400, "VALIDATION_ERROR", label + " must be between " + min + " and " + max + ".");
  return result;
}
function isoDate(value: unknown, label: string): Date {
  if (typeof value !== "string") throw new ApiError(400, "INVALID_DATE", label + " must be an ISO date-time string.");
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) throw new ApiError(400, "INVALID_DATE", label + " is invalid.");
  return result;
}

paperRouter.get("/papers", requirePermission("papers.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const batchId = uuid(request.query.batchId, "Batch");
    const status = text(request.query.status, "Status", 16);
    if (status && !["draft", "published", "closed", "archived"].includes(status)) throw new ApiError(400, "INVALID_STATUS", "Paper status is invalid.");
    const branchIds = request.accessibleBranchIds || [];
    const result = await withTenant(auth.tenantId, async (trx) => {
      const rows = await sql<any>`
        SELECT p.id, p.branch_id, p.batch_id, p.paper_code, p.title, p.subject_name,
               p.duration_minutes, p.starts_at, p.ends_at, p.instructions, p.status,
               p.version, p.total_marks, p.question_count, p.created_at, p.published_at,
               ba.name AS batch_name, b.name AS branch_name
        FROM exam_papers p
        JOIN batches ba ON ba.tenant_id=p.tenant_id AND ba.id=p.batch_id
        JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id
        WHERE p.tenant_id=${auth.tenantId}
          AND (${request.canAccessAllBranches === true} OR p.branch_id=ANY(${branchIds}::uuid[]))
          AND (${batchId}::uuid IS NULL OR p.batch_id=${batchId})
          AND (${status}::text IS NULL OR p.status=${status})
        ORDER BY p.starts_at DESC LIMIT 200
      `.execute(trx);
      return rows.rows;
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result });
  } catch (error) { next(error); }
});

paperRouter.post("/papers", requirePermission("papers.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const batchId = uuid(request.body?.batchId, "Batch", true)!;
    const paperCode = text(request.body?.paperCode, "Paper code", 48, true)!.toUpperCase();
    const title = text(request.body?.title, "Paper title", 180, true)!;
    const subjectName = text(request.body?.subjectName, "Subject", 120, true)!;
    const duration = positiveInteger(request.body?.durationMinutes, "Duration", 1, 600);
    const startsAt = isoDate(request.body?.startsAt, "Start time");
    const endsAt = isoDate(request.body?.endsAt, "End time");
    const instructions = text(request.body?.instructions, "Instructions", 3000);
    const questionIds = request.body?.questionIds;
    if (!Array.isArray(questionIds) || questionIds.length < 1 || questionIds.length > 200) {
      throw new ApiError(400, "INVALID_QUESTION_LIST", "Select between 1 and 200 published questions.");
    }
    const normalizedIds = questionIds.map((id: unknown) => uuid(id, "Question ID", true)!);
    if (new Set(normalizedIds).size !== normalizedIds.length) throw new ApiError(400, "DUPLICATE_QUESTION", "A question can appear only once in a paper.");
    if (endsAt <= startsAt) throw new ApiError(400, "INVALID_SCHEDULE", "Paper end time must be after its start time.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const batchRows = await sql<any>`
        SELECT id, branch_id FROM batches
        WHERE tenant_id=${auth.tenantId} AND id=${batchId} AND is_active=true
      `.execute(trx);
      const batch = batchRows.rows[0];
      if (!batch) throw new ApiError(404, "BATCH_NOT_FOUND", "The active batch was not found.");
      assertBranch(request, batch.branch_id);
      const questionRows = await sql<any>`
        SELECT id, question_code, question_type, difficulty, prompt, options,
               answer_key, explanation, marks, version
        FROM question_bank
        WHERE tenant_id=${auth.tenantId} AND id=ANY(${normalizedIds}::uuid[]) AND status='published'
      `.execute(trx);
      if (questionRows.rows.length !== normalizedIds.length) {
        throw new ApiError(400, "QUESTION_NOT_PUBLISHED", "Every selected question must exist and be published.");
      }
      const byId = new Map(questionRows.rows.map((question: any) => [question.id, question]));
      const ordered = normalizedIds.map((id: string) => byId.get(id));
      const totalMarks = ordered.reduce((sum: number, question: any) => sum + Number(question.marks), 0);
      const inserted = await sql<any>`
        INSERT INTO exam_papers (
          tenant_id, branch_id, batch_id, paper_code, title, subject_name,
          duration_minutes, starts_at, ends_at, instructions, total_marks,
          question_count, created_by_membership_id, updated_by_membership_id
        ) VALUES (
          ${auth.tenantId}, ${batch.branch_id}, ${batch.id}, ${paperCode}, ${title}, ${subjectName},
          ${duration}, ${startsAt.toISOString()}, ${endsAt.toISOString()}, ${instructions},
          ${totalMarks}, ${ordered.length}, ${auth.membershipId}, ${auth.membershipId}
        ) RETURNING *
      `.execute(trx);
      const paper = inserted.rows[0];
      for (let index = 0; index < ordered.length; index++) {
        const question = ordered[index] as any;
        const snapshot = {
          questionCode: question.question_code,
          questionType: question.question_type,
          difficulty: question.difficulty,
          prompt: question.prompt,
          options: question.options,
          explanation: question.explanation
        };
        await sql`
          INSERT INTO exam_paper_questions (
            tenant_id, paper_id, source_question_id, source_question_version,
            position, question_snapshot, answer_snapshot, marks
          ) VALUES (
            ${auth.tenantId}, ${paper.id}, ${question.id}, ${question.version},
            ${index + 1}, ${JSON.stringify(snapshot)}::jsonb,
            ${question.answer_key === null ? null : JSON.stringify(question.answer_key)}::jsonb,
            ${question.marks}
          )
        `.execute(trx);
      }
      return paper;
    });
    response.status(201).json({ paper: result });
  } catch (error) { next(error); }
});

paperRouter.get("/papers/:id", requirePermission("papers.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const id = uuid(request.params.id, "Paper", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const papers = await sql<any>`
        SELECT p.*, ba.name AS batch_name, b.name AS branch_name
        FROM exam_papers p
        JOIN batches ba ON ba.tenant_id=p.tenant_id AND ba.id=p.batch_id
        JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id
        WHERE p.tenant_id=${auth.tenantId} AND p.id=${id}
      `.execute(trx);
      const paper = papers.rows[0];
      if (!paper) throw new ApiError(404, "PAPER_NOT_FOUND", "Paper was not found.");
      assertBranch(request, paper.branch_id);
      const questions = await sql<any>`
        SELECT id, source_question_id, source_question_version, position,
               question_snapshot, answer_snapshot, marks
        FROM exam_paper_questions
        WHERE tenant_id=${auth.tenantId} AND paper_id=${id}
        ORDER BY position
      `.execute(trx);
      return { paper, questions: questions.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

paperRouter.patch("/papers/:id/status", requirePermission("papers.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const id = uuid(request.params.id, "Paper", true)!;
    const status = text(request.body?.status, "Status", 16, true)!;
    if (!["published", "closed", "archived"].includes(status)) throw new ApiError(400, "INVALID_STATUS", "Use published, closed or archived status.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const rows = await sql<any>`
        SELECT id, branch_id, status, starts_at, ends_at, question_count
        FROM exam_papers WHERE tenant_id=${auth.tenantId} AND id=${id} FOR UPDATE
      `.execute(trx);
      const paper = rows.rows[0];
      if (!paper) throw new ApiError(404, "PAPER_NOT_FOUND", "Paper was not found.");
      assertBranch(request, paper.branch_id);
      if (paper.status !== "draft" && status === "published") throw new ApiError(409, "PAPER_NOT_DRAFT", "Only a draft paper can be published.");
      if (status === "published") {
        if (Number(paper.question_count) < 1) throw new ApiError(409, "EMPTY_PAPER", "Add at least one question before publishing.");
        if (new Date(paper.ends_at).getTime() <= Date.now()) throw new ApiError(409, "SCHEDULE_EXPIRED", "A paper with an expired exam window cannot be published.");
      }
      if (status === "closed" && paper.status !== "published") throw new ApiError(409, "PAPER_NOT_PUBLISHED", "Only a published paper can be closed.");
      const updated = await sql<any>`
        UPDATE exam_papers
        SET status=${status}, published_at=CASE WHEN ${status}='published' THEN now() ELSE published_at END,
            updated_at=now(), updated_by_membership_id=${auth.membershipId}
        WHERE tenant_id=${auth.tenantId} AND id=${id}
        RETURNING id, paper_code, title, status, published_at
      `.execute(trx);
      return updated.rows[0];
    });
    response.json({ paper: result });
  } catch (error) { next(error); }
});
