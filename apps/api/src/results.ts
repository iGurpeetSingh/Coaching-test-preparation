import { Router } from "express";
import { sql } from "kysely";
import { requireAuth, requireCsrf, requirePermission } from "./auth.js";
import { withTenant } from "./db.js";
import { ApiError, actorOf, assertBranch } from "./enquiry-service.js";

export const resultsRouter = Router();
resultsRouter.use(requireAuth);
resultsRouter.use((request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  return requireCsrf(request, response, next);
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new ApiError(400, "VALIDATION_ERROR", label + " is invalid.");
  return value;
}
function text(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ApiError(400, "VALIDATION_ERROR", label + " must be text.");
  const result = value.trim();
  if (result.length > max) throw new ApiError(400, "VALIDATION_ERROR", label + " is too long.");
  return result || null;
}
function money(value: unknown, label: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 100000) throw new ApiError(400, "INVALID_MARKS", label + " must be a non-negative number.");
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

resultsRouter.get("/results", requirePermission("results.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const branchIds = request.accessibleBranchIds || [];
    const status = text(request.query.status, "Status", 24);
    if (status && !["submitted", "auto_submitted", "awaiting_review", "graded"].includes(status)) throw new ApiError(400, "INVALID_STATUS", "Result status is invalid.");
    const rows = await withTenant(auth.tenantId, (trx) => sql<any>`
      SELECT ea.id AS attempt_id, ea.status, ea.started_at, ea.submitted_at,
             ea.total_marks, ea.score, ea.correct_count, ea.incorrect_count,
             ea.unanswered_count, ea.graded_at,
             p.id AS paper_id, p.paper_code, p.title, p.subject_name,
             ba.name AS batch_name, b.name AS branch_name,
             st.id AS student_id, st.student_number, st.full_name AS student_name
      FROM exam_attempts ea
      JOIN exam_papers p ON p.tenant_id=ea.tenant_id AND p.id=ea.paper_id
      JOIN batches ba ON ba.tenant_id=p.tenant_id AND ba.id=p.batch_id
      JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id
      JOIN students st ON st.tenant_id=ea.tenant_id AND st.id=ea.student_id
      WHERE ea.tenant_id=${auth.tenantId}
        AND (${request.canAccessAllBranches === true} OR p.branch_id=ANY(${branchIds}::uuid[]))
        AND (${status}::text IS NULL OR ea.status=${status})
      ORDER BY ea.submitted_at DESC NULLS LAST, ea.started_at DESC
      LIMIT 500
    `.execute(trx));
    response.setHeader("Cache-Control", "no-store");
    response.json({ items: rows.rows });
  } catch (error) { next(error); }
});

resultsRouter.get("/results/attempts/:id", requirePermission("results.read"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const attemptId = uuid(request.params.id, "Attempt ID");
    const result = await withTenant(auth.tenantId, async (trx) => {
      const attempts = await sql<any>`
        SELECT ea.*, p.paper_code, p.title, p.subject_name, p.branch_id,
               st.student_number, st.full_name AS student_name, ba.name AS batch_name
        FROM exam_attempts ea
        JOIN exam_papers p ON p.tenant_id=ea.tenant_id AND p.id=ea.paper_id
        JOIN students st ON st.tenant_id=ea.tenant_id AND st.id=ea.student_id
        JOIN batches ba ON ba.tenant_id=p.tenant_id AND ba.id=p.batch_id
        WHERE ea.tenant_id=${auth.tenantId} AND ea.id=${attemptId}
      `.execute(trx);
      const attempt = attempts.rows[0];
      if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Exam attempt was not found.");
      assertBranch(request, attempt.branch_id);
      const questions = await sql<any>`
        SELECT pq.id AS paper_question_id, pq.position, pq.question_snapshot,
               pq.answer_snapshot, pq.marks, aa.answer_value, aa.saved_at,
               g.awarded_marks, g.feedback, g.graded_at, u.full_name AS graded_by
        FROM exam_paper_questions pq
        LEFT JOIN exam_attempt_answers aa ON aa.tenant_id=pq.tenant_id
          AND aa.paper_question_id=pq.id AND aa.attempt_id=${attemptId}
        LEFT JOIN exam_attempt_grades g ON g.tenant_id=pq.tenant_id
          AND g.paper_question_id=pq.id AND g.attempt_id=${attemptId}
        LEFT JOIN memberships gm ON gm.tenant_id=g.tenant_id AND gm.id=g.graded_by_membership_id
        LEFT JOIN users u ON u.id=gm.user_id
        WHERE pq.tenant_id=${auth.tenantId} AND pq.paper_id=${attempt.paper_id}
        ORDER BY pq.position
      `.execute(trx);
      return { attempt, questions: questions.rows };
    });
    response.setHeader("Cache-Control", "no-store");
    response.json(result);
  } catch (error) { next(error); }
});

resultsRouter.patch("/results/attempts/:id/grades", requirePermission("results.manage"), async (request, response, next) => {
  try {
    const auth = actorOf(request);
    const attemptId = uuid(request.params.id, "Attempt ID");
    const input = request.body?.grades;
    if (!Array.isArray(input) || input.length < 1 || input.length > 200) throw new ApiError(400, "INVALID_GRADES", "Provide marks for each subjective question.");
    const grades = input.map((item: any) => ({
      paperQuestionId: uuid(item?.paperQuestionId, "Paper question ID"),
      awardedMarks: money(item?.awardedMarks, "Awarded marks"),
      feedback: text(item?.feedback, "Feedback", 2000)
    }));
    if (new Set(grades.map((item) => item.paperQuestionId)).size !== grades.length) throw new ApiError(400, "DUPLICATE_GRADE", "A question can appear only once in a grading submission.");

    const result = await withTenant(auth.tenantId, async (trx) => {
      const attempts = await sql<any>`
        SELECT ea.*, p.branch_id
        FROM exam_attempts ea
        JOIN exam_papers p ON p.tenant_id=ea.tenant_id AND p.id=ea.paper_id
        WHERE ea.tenant_id=${auth.tenantId} AND ea.id=${attemptId}
        FOR UPDATE OF ea
      `.execute(trx);
      const attempt = attempts.rows[0];
      if (!attempt) throw new ApiError(404, "ATTEMPT_NOT_FOUND", "Exam attempt was not found.");
      assertBranch(request, attempt.branch_id);
      if (!["awaiting_review", "submitted", "auto_submitted"].includes(attempt.status)) {
        throw new ApiError(409, "ATTEMPT_NOT_READY_FOR_GRADING", "This attempt is not waiting for manual evaluation.");
      }
      const subjective = await sql<any>`
        SELECT pq.id, pq.marks, pq.question_snapshot
        FROM exam_paper_questions pq
        WHERE pq.tenant_id=${auth.tenantId} AND pq.paper_id=${attempt.paper_id}
          AND pq.question_snapshot->>'questionType' IN ('short_answer','long_answer')
      `.execute(trx);
      if (!subjective.rows.length) throw new ApiError(409, "NO_SUBJECTIVE_QUESTIONS", "This paper has no subjective questions to grade.");
      if (grades.length !== subjective.rows.length) throw new ApiError(400, "GRADES_INCOMPLETE", "Submit marks for every subjective question, including zero marks where appropriate.");
      let manualScore = 0;
      for (const grade of grades) {
        const question = subjective.rows.find((item: any) => item.id === grade.paperQuestionId);
        if (!question) throw new ApiError(400, "QUESTION_NOT_SUBJECTIVE", "Only subjective questions can receive manual marks.");
        if (grade.awardedMarks > Number(question.marks)) throw new ApiError(400, "MARKS_EXCEED_MAXIMUM", "Awarded marks cannot exceed the question maximum.");
        manualScore += grade.awardedMarks;
        await sql`
          INSERT INTO exam_attempt_grades
            (tenant_id, attempt_id, paper_question_id, awarded_marks, feedback, graded_by_membership_id)
          VALUES
            (${auth.tenantId}, ${attemptId}, ${grade.paperQuestionId}, ${grade.awardedMarks}, ${grade.feedback}, ${auth.membershipId})
          ON CONFLICT (tenant_id, attempt_id, paper_question_id)
          DO UPDATE SET awarded_marks=EXCLUDED.awarded_marks, feedback=EXCLUDED.feedback,
            graded_by_membership_id=EXCLUDED.graded_by_membership_id, graded_at=now()
        `.execute(trx);
      }
      const updated = await sql<any>`
        UPDATE exam_attempts
        SET status='graded', score=coalesce(score,0)+${manualScore},
            graded_at=now(), updated_at=now()
        WHERE tenant_id=${auth.tenantId} AND id=${attemptId}
        RETURNING id, status, total_marks, score, correct_count, incorrect_count,
                  unanswered_count, submitted_at, graded_at
      `.execute(trx);
      await sql`
        INSERT INTO exam_attempt_events (tenant_id, attempt_id, event_type, safe_metadata)
        VALUES (${auth.tenantId}, ${attemptId}, 'graded', ${JSON.stringify({ manualScore, questionCount: grades.length })}::jsonb)
      `.execute(trx);
      return updated.rows[0];
    });
    response.json({ result });
  } catch (error) { next(error); }
});
