import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, assertBranch } from "./enquiry-service.js";

export const studentExamRouter = Router();
studentExamRouter.use(requireAuth);
studentExamRouter.use((request, response, next) => {
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
async function linkedStudent(trx: any, tenantId: string, membershipId: string) {
  const result = await sql<any>`
    SELECT l.student_id, l.branch_id, s.student_number, s.full_name
    FROM student_portal_links l
    JOIN students s ON s.tenant_id=l.tenant_id AND s.id=l.student_id
    WHERE l.tenant_id=${tenantId} AND l.membership_id=${membershipId}
    LIMIT 1
  `.execute(trx);
  if (!result.rows[0]) throw new ApiError(403, "STUDENT_ACCOUNT_NOT_LINKED", "This account is not linked to a student record.");
  return result.rows[0];
}
function canonicalAnswer(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => String(item)).sort());
  return JSON.stringify(value);
}

studentExamRouter.post("/students/:id/portal-account", requirePermission("users.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const studentId = uuid(request.params.id, "Student", true)!;
    const email = text(request.body?.email, "Student login email", 254, true)!.toLowerCase();
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "INVALID_EMAIL", "Enter a valid student login email.");
    if (password.length < 12 || password.length > 1024) throw new ApiError(400, "WEAK_PASSWORD", "Student password must contain at least 12 characters.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const studentRows = await sql<any>`
        SELECT s.id, s.student_number, s.full_name, a.branch_id
        FROM students s
        JOIN admissions a ON a.tenant_id=s.tenant_id AND a.student_id=s.id
        WHERE s.tenant_id=${auth.tenantId} AND s.id=${studentId}
        ORDER BY a.admitted_at DESC LIMIT 1
      `.execute(trx);
      const student = studentRows.rows[0];
      if (!student) throw new ApiError(404, "STUDENT_NOT_FOUND", "Student or admission was not found.");
      const existingLink = await sql`SELECT 1 FROM student_portal_links WHERE tenant_id=${auth.tenantId} AND student_id=${studentId}`.execute(trx);
      if (existingLink.rows.length) throw new ApiError(409, "PORTAL_ACCOUNT_EXISTS", "This student already has a portal account.");
      const duplicate = await sql`SELECT 1 FROM users WHERE email_normalized=${email}`.execute(trx);
      if (duplicate.rows.length) throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered. Use a new student login email.");
      const studentRole = await sql<any>`SELECT id FROM roles WHERE tenant_id=${auth.tenantId} AND key='student'`.execute(trx);
      if (!studentRole.rows[0]) throw new ApiError(500, "STUDENT_ROLE_MISSING", "Run the latest institute seed to create the Student role.");
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const user = await sql<any>`
        INSERT INTO users (email, email_normalized, full_name, password_hash)
        VALUES (${email}, ${email}, ${student.full_name}, ${passwordHash})
        RETURNING id
      `.execute(trx);
      const membership = await sql<any>`
        INSERT INTO memberships (tenant_id, user_id, status)
        VALUES (${auth.tenantId}, ${user.rows[0].id}, 'active')
        RETURNING id
      `.execute(trx);
      await sql`
        INSERT INTO membership_roles (tenant_id, membership_id, role_id)
        VALUES (${auth.tenantId}, ${membership.rows[0].id}, ${studentRole.rows[0].id})
      `.execute(trx);
      await sql`
        INSERT INTO membership_branch_access (tenant_id, membership_id, branch_id)
        VALUES (${auth.tenantId}, ${membership.rows[0].id}, ${student.branch_id})
      `.execute(trx);
      await sql`
        INSERT INTO student_portal_links (tenant_id, student_id, membership_id, branch_id, linked_by_membership_id)
        VALUES (${auth.tenantId}, ${studentId}, ${membership.rows[0].id}, ${student.branch_id}, ${auth.membershipId})
      `.execute(trx);
      return { email, studentNumber: student.student_number, membershipId: membership.rows[0].id };
    });
    response.status(201).json({ portalAccount: result });
  } catch (error) { next(error); }
});

studentExamRouter.get("/student/exams", requirePermission("student.exams.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const result = await withTenant(auth.tenantId, async (trx) => {
      const student = await linkedStudent(trx, auth.tenantId, auth.membershipId);
      const rows = await sql<any>`
        SELECT p.id, p.paper_code, p.title, p.subject_name, p.duration_minutes,
               p.starts_at, p.ends_at, p.instructions, p.total_marks, p.question_count,
               p.status, ba.name AS batch_name,
               ea.id AS attempt_id, ea.status AS attempt_status, ea.deadline_at,
               ea.submitted_at
        FROM exam_papers p
        JOIN batches ba ON ba.tenant_id=p.tenant_id AND ba.id=p.batch_id
        JOIN admissions a ON a.tenant_id=p.tenant_id AND a.batch_id=p.batch_id
          AND a.student_id=${student.student_id}
        LEFT JOIN exam_attempts ea ON ea.tenant_id=p.tenant_id AND ea.paper_id=p.id AND ea.student_id=${student.student_id}
        WHERE p.tenant_id=${auth.tenantId} AND p.status='published'
        GROUP BY p.id, ba.name, ea.id
        ORDER BY p.starts_at DESC
        LIMIT 200
      `.execute(trx);
      return { student, items: rows.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

studentExamRouter.post("/student/papers/:id/attempts", requirePermission("student.exams.attempt"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const paperId = uuid(request.params.id, "Paper", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const student = await linkedStudent(trx, auth.tenantId, auth.membershipId);
      const paperRows = await sql<any>`
        SELECT p.* FROM exam_papers p
        WHERE p.tenant_id=${auth.tenantId} AND p.id=${paperId}
        FOR SHARE
      `.execute(trx);
      const paper = paperRows.rows[0];
      if (!paper || paper.status !== "published") throw new ApiError(404, "PAPER_NOT_AVAILABLE", "This examination is not available.");
      const enrolment = await sql`
        SELECT 1 FROM admissions
        WHERE tenant_id=${auth.tenantId} AND student_id=${student.student_id} AND batch_id=${paper.batch_id}
      `.execute(trx);
      if (!enrolment.rows.length) throw new ApiError(403, "EXAM_NOT_ASSIGNED", "This examination is not assigned to your batch.");
      const clock = await sql<any>`SELECT now() AS server_now`.execute(trx);
      const now = new Date(clock.rows[0].server_now);
      if (now < new Date(paper.starts_at)) throw new ApiError(409, "EXAM_NOT_STARTED", "The exam start window has not opened.");
      if (now >= new Date(paper.ends_at)) throw new ApiError(409, "EXAM_WINDOW_CLOSED", "The exam window has ended.");
      const existing = await sql<any>`
        SELECT * FROM exam_attempts
        WHERE tenant_id=${auth.tenantId} AND paper_id=${paperId} AND student_id=${student.student_id}
        FOR UPDATE
      `.execute(trx);
      if (existing.rows[0]) {
        const attempt = existing.rows[0];
        if (attempt.status === "in_progress" && new Date(attempt.deadline_at) > now) return { attempt, alreadyStarted: true };
        throw new ApiError(409, "ATTEMPT_ALREADY_USED", "An attempt already exists for this examination.");
      }
      const deadline = new Date(Math.min(
        now.getTime() + Number(paper.duration_minutes) * 60_000,
        new Date(paper.ends_at).getTime()
      ));
      const inserted = await sql<any>`
        INSERT INTO exam_attempts
          (tenant_id, paper_id, student_id, paper_version, deadline_at, total_marks)
        VALUES
          (${auth.tenantId}, ${paperId}, ${student.student_id}, ${paper.version}, ${deadline.toISOString()}, ${paper.total_marks})
        RETURNING *
      `.execute(trx);
      await sql`
        INSERT INTO exam_attempt_events (tenant_id, attempt_id, event_type, safe_metadata)
        VALUES (${auth.tenantId}, ${inserted.rows[0].id}, 'started', ${JSON.stringify({ paperCode: paper.paper_code, paperVersion: paper.version })}::jsonb)
      `.execute(trx);
      return { attempt: inserted.rows[0], alreadyStarted: false };
    });
    response.status(result.alreadyStarted ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

studentExamRouter.get("/student/attempts/:id", requirePermission("student.exams.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const attemptId = uuid(request.params.id, "Attempt", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const student = await linkedStudent(trx, auth.tenantId, auth.membershipId);
      const attempts = await sql<any>`
        SELECT ea.*, p.title, p.paper_code, p.subject_name, p.instructions,
               p.duration_minutes, p.starts_at, p.ends_at
        FROM exam_attempts ea JOIN exam_papers p ON p.tenant_id=ea.tenant_id AND p.id=ea.paper_id
        WHERE ea.tenant_id=${auth.tenantId} AND ea.id=${attemptId} AND ea.student_id=${student.student_id}
      `.execute(trx);
      const attempt = attempts.rows[0];
      if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Exam attempt was not found.");
      const questions = await sql<any>`
        SELECT pq.id AS paper_question_id, pq.position, pq.question_snapshot, pq.marks,
               aa.answer_value, aa.revision, aa.saved_at
        FROM exam_paper_questions pq
        LEFT JOIN exam_attempt_answers aa ON aa.tenant_id=pq.tenant_id
          AND aa.paper_question_id=pq.id AND aa.attempt_id=${attemptId}
        WHERE pq.tenant_id=${auth.tenantId} AND pq.paper_id=${attempt.paper_id}
        ORDER BY pq.position
      `.execute(trx);
      return { attempt, questions: questions.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

studentExamRouter.put("/student/attempts/:id/answers", requirePermission("student.exams.attempt"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const attemptId = uuid(request.params.id, "Attempt", true)!;
    const input = request.body?.answers;
    if (!Array.isArray(input) || input.length < 1 || input.length > 200) throw new ApiError(400, "INVALID_ANSWERS", "Provide between 1 and 200 answers to save.");
    const answers = input.map((item: any) => ({
      paperQuestionId: uuid(item?.paperQuestionId, "Paper question ID", true)!,
      answerValue: item?.answerValue === undefined ? null : item.answerValue
    }));
    if (new Set(answers.map((item) => item.paperQuestionId)).size !== answers.length) throw new ApiError(400, "DUPLICATE_ANSWER", "A question can appear only once in an answer save.");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const student = await linkedStudent(trx, auth.tenantId, auth.membershipId);
      const attempts = await sql<any>`
        SELECT * FROM exam_attempts
        WHERE tenant_id=${auth.tenantId} AND id=${attemptId} AND student_id=${student.student_id}
        FOR UPDATE
      `.execute(trx);
      const attempt = attempts.rows[0];
      if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Exam attempt was not found.");
      if (attempt.status !== "in_progress") throw new ApiError(409, "ATTEMPT_CLOSED", "This attempt no longer accepts answers.");
      const clock = await sql<any>`SELECT now() AS server_now`.execute(trx);
      if (new Date(clock.rows[0].server_now) >= new Date(attempt.deadline_at)) throw new ApiError(409, "DEADLINE_REACHED", "The exam deadline has passed. Submit the attempt.");
      const questionIds = answers.map((item) => item.paperQuestionId);
      const allowed = await sql<any>`
        SELECT id FROM exam_paper_questions
        WHERE tenant_id=${auth.tenantId} AND paper_id=${attempt.paper_id}
          AND id=ANY(${questionIds}::uuid[])
      `.execute(trx);
      if (allowed.rows.length !== answers.length) throw new ApiError(400, "QUESTION_NOT_IN_PAPER", "An answer references a question outside this exam.");
      for (const item of answers) {
        await sql`
          INSERT INTO exam_attempt_answers (tenant_id, attempt_id, paper_question_id, answer_value)
          VALUES (${auth.tenantId}, ${attemptId}, ${item.paperQuestionId}, ${item.answerValue === null ? null : JSON.stringify(item.answerValue)}::jsonb)
          ON CONFLICT (tenant_id, attempt_id, paper_question_id)
          DO UPDATE SET answer_value=EXCLUDED.answer_value,
            revision=exam_attempt_answers.revision+1, saved_at=now()
        `.execute(trx);
      }
      await sql`
        INSERT INTO exam_attempt_events (tenant_id, attempt_id, event_type, safe_metadata)
        VALUES (${auth.tenantId}, ${attemptId}, 'answer_saved', ${JSON.stringify({ count: answers.length })}::jsonb)
      `.execute(trx);
      return { saved: answers.length, savedAt: clock.rows[0].server_now, deadlineAt: attempt.deadline_at };
    });
    response.json(result);
  } catch (error) { next(error); }
});

studentExamRouter.post("/student/attempts/:id/submit", requirePermission("student.exams.attempt"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const attemptId = uuid(request.params.id, "Attempt", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const student = await linkedStudent(trx, auth.tenantId, auth.membershipId);
      const attempts = await sql<any>`
        SELECT * FROM exam_attempts
        WHERE tenant_id=${auth.tenantId} AND id=${attemptId} AND student_id=${student.student_id}
        FOR UPDATE
      `.execute(trx);
      const attempt = attempts.rows[0];
      if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Exam attempt was not found.");
      if (attempt.status !== "in_progress") throw new ApiError(409, "ATTEMPT_ALREADY_SUBMITTED", "This exam attempt has already been submitted.");
      const clock = await sql<any>`SELECT now() AS server_now`.execute(trx);
      const deadlinePassed = new Date(clock.rows[0].server_now) >= new Date(attempt.deadline_at);
      const questions = await sql<any>`
        SELECT pq.id, pq.question_snapshot, pq.answer_snapshot, pq.marks, aa.answer_value
        FROM exam_paper_questions pq
        LEFT JOIN exam_attempt_answers aa ON aa.tenant_id=pq.tenant_id
          AND aa.paper_question_id=pq.id AND aa.attempt_id=${attemptId}
        WHERE pq.tenant_id=${auth.tenantId} AND pq.paper_id=${attempt.paper_id}
        ORDER BY pq.position
      `.execute(trx);
      let objectiveScore = 0;
      let correct = 0;
      let incorrect = 0;
      let unanswered = 0;
      let subjectiveCount = 0;
      for (const question of questions.rows) {
        const type = question.question_snapshot?.questionType;
        const answer = question.answer_value;
        if (type === "short_answer" || type === "long_answer") {
          subjectiveCount++;
          if (answer === null || answer === undefined) unanswered++;
          continue;
        }
        if (answer === null || answer === undefined) { unanswered++; continue; }
        const isCorrect = canonicalAnswer(answer) === canonicalAnswer(question.answer_snapshot);
        if (isCorrect) { correct++; objectiveScore += Number(question.marks); }
        else incorrect++;
      }
      const finalStatus = subjectiveCount > 0 ? "awaiting_review" : "graded";
      const updated = await sql<any>`
        UPDATE exam_attempts
        SET status=${finalStatus}, submitted_at=${clock.rows[0].server_now},
            submit_reason=${deadlinePassed ? "deadline" : "manual"},
            score=${objectiveScore}, correct_count=${correct},
            incorrect_count=${incorrect}, unanswered_count=${unanswered},
            graded_at=CASE WHEN ${finalStatus}='graded' THEN now() ELSE NULL END,
            updated_at=now()
        WHERE tenant_id=${auth.tenantId} AND id=${attemptId}
        RETURNING id, status, submitted_at, submit_reason, total_marks, score,
                  correct_count, incorrect_count, unanswered_count, deadline_at
      `.execute(trx);
      await sql`
        INSERT INTO exam_attempt_events (tenant_id, attempt_id, event_type, safe_metadata)
        VALUES (${auth.tenantId}, ${attemptId}, ${deadlinePassed ? "auto_submitted" : "submitted"},
          ${JSON.stringify({ objectiveScore, correct, incorrect, unanswered, subjectiveCount })}::jsonb)
      `.execute(trx);
      return updated.rows[0];
    });
    response.json({ result });
  } catch (error) { next(error); }
});

studentExamRouter.get("/student/attempts/:id/result", requirePermission("student.exams.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const attemptId = uuid(request.params.id, "Attempt", true)!;
    const result = await withTenant(auth.tenantId, async (trx) => {
      const student = await linkedStudent(trx, auth.tenantId, auth.membershipId);
      const rows = await sql<any>`
        SELECT ea.id, ea.status, ea.submitted_at, ea.total_marks, ea.score,
               ea.correct_count, ea.incorrect_count, ea.unanswered_count,
               ea.graded_at, p.title, p.paper_code
        FROM exam_attempts ea JOIN exam_papers p ON p.tenant_id=ea.tenant_id AND p.id=ea.paper_id
        WHERE ea.tenant_id=${auth.tenantId} AND ea.id=${attemptId} AND ea.student_id=${student.student_id}
      `.execute(trx);
      const attempt = rows.rows[0];
      if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Exam attempt was not found.");
      if (attempt.status === "in_progress") throw new ApiError(409, "RESULT_NOT_READY", "Submit the exam before viewing results.");
      return attempt;
    });
    response.setHeader("Cache-Control", "no-store");
    response.json({ result });
  } catch (error) { next(error); }
});
