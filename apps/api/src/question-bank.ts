import { randomUUID } from "node:crypto";
import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf } from "./enquiry-service.js";

export const questionBankRouter = Router();
questionBankRouter.use(requireAuth);
questionBankRouter.use((request, response, next) => {
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
function positiveNumber(value: unknown, label: string, fallback?: number): number {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000) throw new ApiError(400, "VALIDATION_ERROR", label + " must be a positive number.");
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}
function optionsValue(value: unknown): Array<{ id: string; text: string }> {
  if (!Array.isArray(value) || value.length < 2 || value.length > 8) {
    throw new ApiError(400, "INVALID_OPTIONS", "Objective questions need between 2 and 8 options.");
  }
  const options = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(400, "INVALID_OPTIONS", "Option " + (index + 1) + " must contain an id and text.");
    const id = text((item as any).id, "Option ID", 20, true)!;
    const optionText = text((item as any).text, "Option text", 1000, true)!;
    return { id, text: optionText };
  });
  if (new Set(options.map((item) => item.id)).size !== options.length) throw new ApiError(400, "DUPLICATE_OPTION", "Option IDs must be unique.");
  return options;
}
function validateAnswerKey(type: string, options: Array<{ id: string; text: string }>, answerKey: unknown): void {
  if (type === "short_answer" || type === "long_answer") return;
  if (type === "true_false") {
    if (typeof answerKey !== "boolean") throw new ApiError(400, "INVALID_ANSWER_KEY", "True/false questions need a boolean answer key.");
    return;
  }
  if (type === "single_choice") {
    if (typeof answerKey !== "string" || !options.some((option) => option.id === answerKey)) {
      throw new ApiError(400, "INVALID_ANSWER_KEY", "Single-choice answer key must match one option ID.");
    }
    return;
  }
  if (type === "multiple_choice") {
    if (!Array.isArray(answerKey) || !answerKey.length || answerKey.some((id) => typeof id !== "string" || !options.some((option) => option.id === id))) {
      throw new ApiError(400, "INVALID_ANSWER_KEY", "Multiple-choice answer key must be an array of option IDs.");
    }
    return;
  }
  throw new ApiError(400, "INVALID_QUESTION_TYPE", "Question type is not supported.");
}

questionBankRouter.get("/syllabus", requirePermission("question_bank.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const rows = await withTenant(auth.tenantId, async (trx) => {
      const subjects = await sql<any>`
        SELECT id, code, name, is_active FROM academic_subjects
        WHERE tenant_id=${auth.tenantId} ORDER BY name
      `.execute(trx);
      const chapters = await sql<any>`
        SELECT id, subject_id, code, name, sort_order, is_active FROM syllabus_chapters
        WHERE tenant_id=${auth.tenantId} ORDER BY sort_order, name
      `.execute(trx);
      const topics = await sql<any>`
        SELECT id, chapter_id, code, name, sort_order, is_active FROM syllabus_topics
        WHERE tenant_id=${auth.tenantId} ORDER BY sort_order, name
      `.execute(trx);
      return { subjects: subjects.rows, chapters: chapters.rows, topics: topics.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(rows);
  } catch (error) { next(error); }
});

questionBankRouter.post("/syllabus/subjects", requirePermission("question_bank.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const code = text(request.body?.code, "Subject code", 32, true)!.toUpperCase();
    const name = text(request.body?.name, "Subject name", 120, true)!;
    const result = await withTenant(auth.tenantId, (trx) => sql<any>`
      INSERT INTO academic_subjects (tenant_id, code, name)
      VALUES (${auth.tenantId}, ${code}, ${name})
      RETURNING id, code, name, is_active
    `.execute(trx));
    response.status(201).json({ subject: result.rows[0] });
  } catch (error) { next(error); }
});

questionBankRouter.post("/syllabus/chapters", requirePermission("question_bank.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const subjectId = uuid(request.body?.subjectId, "Subject", true)!;
    const code = text(request.body?.code, "Chapter code", 32, true)!.toUpperCase();
    const name = text(request.body?.name, "Chapter name", 160, true)!;
    const sortOrder = Number.isInteger(request.body?.sortOrder) && request.body.sortOrder >= 0 ? request.body.sortOrder : 0;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const subject = await sql`SELECT 1 FROM academic_subjects WHERE tenant_id=${auth.tenantId} AND id=${subjectId} AND is_active=true`.execute(trx);
      if (!subject.rows.length) throw new ApiError(400, "SUBJECT_UNAVAILABLE", "The selected subject is unavailable.");
      return sql<any>`
        INSERT INTO syllabus_chapters (tenant_id, subject_id, code, name, sort_order)
        VALUES (${auth.tenantId}, ${subjectId}, ${code}, ${name}, ${sortOrder})
        RETURNING id, subject_id, code, name, sort_order, is_active
      `.execute(trx);
    });
    response.status(201).json({ chapter: result.rows[0] });
  } catch (error) { next(error); }
});

questionBankRouter.post("/syllabus/topics", requirePermission("question_bank.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const chapterId = uuid(request.body?.chapterId, "Chapter", true)!;
    const code = text(request.body?.code, "Topic code", 32, true)!.toUpperCase();
    const name = text(request.body?.name, "Topic name", 160, true)!;
    const sortOrder = Number.isInteger(request.body?.sortOrder) && request.body.sortOrder >= 0 ? request.body.sortOrder : 0;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const chapter = await sql`SELECT 1 FROM syllabus_chapters WHERE tenant_id=${auth.tenantId} AND id=${chapterId} AND is_active=true`.execute(trx);
      if (!chapter.rows.length) throw new ApiError(400, "CHAPTER_UNAVAILABLE", "The selected chapter is unavailable.");
      return sql<any>`
        INSERT INTO syllabus_topics (tenant_id, chapter_id, code, name, sort_order)
        VALUES (${auth.tenantId}, ${chapterId}, ${code}, ${name}, ${sortOrder})
        RETURNING id, chapter_id, code, name, sort_order, is_active
      `.execute(trx);
    });
    response.status(201).json({ topic: result.rows[0] });
  } catch (error) { next(error); }
});

questionBankRouter.get("/questions", requirePermission("question_bank.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const status = text(request.query.status, "Status", 16);
    const topicId = uuid(request.query.topicId, "Topic");
    const subjectId = uuid(request.query.subjectId, "Subject");
    const type = text(request.query.type, "Question type", 24);
    const q = text(request.query.q, "Search", 120);
    const conditions = [sql`q.tenant_id=${auth.tenantId}`];
    if (status) {
      if (!["draft", "review", "published", "archived"].includes(status)) throw new ApiError(400, "INVALID_STATUS", "Question status is invalid.");
      if (status !== "published" && !request.permissionSet?.has("question_bank.manage")) {
        throw new ApiError(403, "FORBIDDEN", "You can only view published questions.");
      }
      conditions.push(sql`q.status=${status}`);
    } else if (!request.permissionSet?.has("question_bank.manage")) {
      conditions.push(sql`q.status='published'`);
    }
    if (topicId) conditions.push(sql`q.topic_id=${topicId}`);
    if (subjectId) conditions.push(sql`ch.subject_id=${subjectId}`);
    if (type) conditions.push(sql`q.question_type=${type}`);
    if (q) conditions.push(sql`q.prompt ILIKE ${"%" + q.replace(/[\\%_]/g, "\\$&") + "%"}`);
    const where = sql.join(conditions, sql` AND `);
    const result = await withTenant(auth.tenantId, (trx) => sql<any>`
      SELECT q.id, q.question_code, q.question_type, q.difficulty, q.prompt, q.options,
             q.explanation, q.marks, q.status, q.version, q.topic_id,
             t.name AS topic_name, ch.name AS chapter_name, s.name AS subject_name,
             q.created_at, q.updated_at, q.published_at
      FROM question_bank q
      LEFT JOIN syllabus_topics t ON t.tenant_id=q.tenant_id AND t.id=q.topic_id
      LEFT JOIN syllabus_chapters ch ON ch.tenant_id=t.tenant_id AND ch.id=t.chapter_id
      LEFT JOIN academic_subjects s ON s.tenant_id=ch.tenant_id AND s.id=ch.subject_id
      WHERE ${where}
      ORDER BY q.updated_at DESC LIMIT 500
    `.execute(trx));
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: result.rows });
  } catch (error) { next(error); }
});

questionBankRouter.post("/questions", requirePermission("question_bank.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const topicId = uuid(request.body?.topicId, "Topic");
    const questionCode = (text(request.body?.questionCode, "Question code", 48) || ("Q-" + randomUUID().slice(0, 8))).toUpperCase();
    const type = text(request.body?.questionType, "Question type", 24, true)!;
    if (!["single_choice", "multiple_choice", "true_false", "short_answer", "long_answer"].includes(type)) {
      throw new ApiError(400, "INVALID_QUESTION_TYPE", "Question type is not supported.");
    }
    const difficulty = text(request.body?.difficulty, "Difficulty", 12) || "medium";
    if (!["easy", "medium", "hard"].includes(difficulty)) throw new ApiError(400, "INVALID_DIFFICULTY", "Difficulty must be easy, medium or hard.");
    const prompt = text(request.body?.prompt, "Question prompt", 12000, true)!;
    const objective = ["single_choice", "multiple_choice", "true_false"].includes(type);
    const options = type === "true_false" ? [{ id: "true", text: "True" }, { id: "false", text: "False" }]
      : objective ? optionsValue(request.body?.options) : [];
    if (objective) validateAnswerKey(type, options, request.body?.answerKey);
    const marks = positiveNumber(request.body?.marks, "Marks", 1);
    const explanation = text(request.body?.explanation, "Explanation", 4000);
    const answerKey = objective ? request.body.answerKey : request.body?.answerKey ?? null;
    const result = await withTenant(auth.tenantId, async (trx) => {
      if (topicId) {
        const topic = await sql`SELECT 1 FROM syllabus_topics WHERE tenant_id=${auth.tenantId} AND id=${topicId} AND is_active=true`.execute(trx);
        if (!topic.rows.length) throw new ApiError(400, "TOPIC_UNAVAILABLE", "The selected syllabus topic is unavailable.");
      }
      return sql<any>`
        INSERT INTO question_bank (
          tenant_id, topic_id, question_code, question_type, difficulty, prompt,
          options, answer_key, explanation, marks, created_by_membership_id, updated_by_membership_id
        ) VALUES (
          ${auth.tenantId}, ${topicId}, ${questionCode}, ${type}, ${difficulty},
          ${prompt}, ${JSON.stringify(options)}::jsonb, ${answerKey === null ? null : JSON.stringify(answerKey)}::jsonb,
          ${explanation}, ${marks}, ${auth.membershipId}, ${auth.membershipId}
        )
        RETURNING id, question_code, question_type, difficulty, prompt, options, explanation, marks, status, version, topic_id
      `.execute(trx);
    });
    response.status(201).json({ question: result.rows[0] });
  } catch (error) { next(error); }
});

questionBankRouter.patch("/questions/:id/status", requirePermission("question_bank.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const id = uuid(request.params.id, "Question", true)!;
    const status = text(request.body?.status, "Status", 16, true)!;
    if (!["draft", "review", "published", "archived"].includes(status)) throw new ApiError(400, "INVALID_STATUS", "Question status is invalid.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const current = await sql<any>`SELECT id, status, question_type, answer_key FROM question_bank WHERE tenant_id=${auth.tenantId} AND id=${id} FOR UPDATE`.execute(trx);
      if (!current.rows[0]) throw new ApiError(404, "QUESTION_NOT_FOUND", "Question was not found.");
      const previous = current.rows[0].status;
      const allowed = (previous === "draft" && ["review", "archived"].includes(status))
        || (previous === "review" && ["draft", "published", "archived"].includes(status))
        || (previous === "published" && status === "archived");
      if (!allowed && previous !== status) throw new ApiError(409, "INVALID_STATUS_TRANSITION", "The requested question status transition is not allowed.");
      if (status === "published" && !current.rows[0].answer_key && ["single_choice", "multiple_choice", "true_false"].includes(current.rows[0].question_type)) {
        throw new ApiError(409, "ANSWER_KEY_REQUIRED", "An objective question needs an answer key before publication.");
      }
      const updated = await sql<any>`
        UPDATE question_bank
        SET status=${status}, published_at=CASE WHEN ${status}='published' THEN coalesce(published_at,now()) ELSE published_at END,
            updated_at=now(), updated_by_membership_id=${auth.membershipId}
        WHERE tenant_id=${auth.tenantId} AND id=${id}
        RETURNING id, question_code, status, version, published_at
      `.execute(trx);
      return updated.rows[0];
    });
    response.json({ question: result });
  } catch (error) { next(error); }
});

questionBankRouter.post("/questions/:id/versions", requirePermission("question_bank.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const id = uuid(request.params.id, "Question", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const currentRows = await sql<any>`SELECT * FROM question_bank WHERE tenant_id=${auth.tenantId} AND id=${id} FOR UPDATE`.execute(trx);
      const current = currentRows.rows[0];
      if (!current) throw new ApiError(404, "QUESTION_NOT_FOUND", "Question was not found.");
      const prompt = request.body?.prompt === undefined ? current.prompt : text(request.body.prompt, "Question prompt", 12000, true);
      const explanation = request.body?.explanation === undefined ? current.explanation : text(request.body.explanation, "Explanation", 4000);
      const marks = request.body?.marks === undefined ? Number(current.marks) : positiveNumber(request.body.marks, "Marks");
      const difficulty = request.body?.difficulty === undefined ? current.difficulty : text(request.body.difficulty, "Difficulty", 12, true);
      if (!["easy", "medium", "hard"].includes(difficulty)) throw new ApiError(400, "INVALID_DIFFICULTY", "Difficulty must be easy, medium or hard.");
      const insert = await sql<any>`
        INSERT INTO question_bank (
          tenant_id, topic_id, question_code, question_type, difficulty, prompt, options,
          answer_key, explanation, marks, status, version, created_by_membership_id, updated_by_membership_id
        ) VALUES (
          ${auth.tenantId}, ${current.topic_id}, ${current.question_code}, ${current.question_type},
          ${difficulty}, ${prompt}, ${JSON.stringify(current.options)}::jsonb,
          ${current.answer_key === null ? null : JSON.stringify(current.answer_key)}::jsonb,
          ${explanation}, ${marks}, 'draft', ${Number(current.version) + 1},
          ${auth.membershipId}, ${auth.membershipId}
        )
        RETURNING id, question_code, question_type, difficulty, prompt, options, explanation, marks, status, version, topic_id
      `.execute(trx);
      return insert.rows[0];
    });
    response.status(201).json({ question: result });
  } catch (error) { next(error); }
});
