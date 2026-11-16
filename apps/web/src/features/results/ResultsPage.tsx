import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import "./results-page.css";

type ResultRow = {
  attempt_id: string; status: string; started_at: string; submitted_at: string | null;
  total_marks: number; score: number | null; correct_count: number | null;
  incorrect_count: number | null; unanswered_count: number | null; graded_at: string | null;
  paper_id: string; paper_code: string; title: string; subject_name: string;
  batch_name: string; branch_name: string; student_id: string; student_number: string; student_name: string;
};
type ResultQuestion = {
  paper_question_id: string; position: number;
  question_snapshot: { questionType: string; prompt: string; questionCode: string };
  answer_snapshot: unknown; marks: number; answer_value: unknown;
  awarded_marks: number | null; feedback: string | null; graded_by: string | null;
};
type AttemptDetail = { attempt: ResultRow & { status: string; branch_id: string; objective_score: number }; questions: ResultQuestion[] };
type Props = { permissions: string[] };
const getError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const fmtDate = (value: string | null) => value ? new Date(value).toLocaleString("en-IN") : "—";

export default function ResultsPage({ permissions }: Props) {
  const canGrade = permissions.includes("results.manage");
  const [items, setItems] = useState<ResultRow[]>([]);
  const [selected, setSelected] = useState<AttemptDetail | null>(null);
  const [grades, setGrades] = useState<Record<string, { marks: string; feedback: string }>>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadResults() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const result = await apiRequest<{ items: ResultRow[] }>(`/results?${params.toString()}`);
      setItems(result.items);
      if (selected) {
        const updated = result.items.find((item) => item.attempt_id === selected.attempt.id);
        if (!updated) setSelected(null);
      }
    } catch (cause) { setError(getError(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadResults(); }, [statusFilter]);

  async function openAttempt(item: ResultRow) {
    setError(""); setNotice(""); setSaving(true);
    try {
      const detail = await apiRequest<AttemptDetail>(`/results/attempts/${item.attempt_id}`);
      setSelected(detail);
      const values: Record<string, { marks: string; feedback: string }> = {};
      for (const question of detail.questions) {
        if (["short_answer", "long_answer"].includes(question.question_snapshot.questionType)) {
          values[question.paper_question_id] = {
            marks: question.awarded_marks === null ? "0" : String(question.awarded_marks),
            feedback: question.feedback || ""
          };
        }
      }
      setGrades(values);
    } catch (cause) { setError(getError(cause)); }
    finally { setSaving(false); }
  }

  async function saveGrades() {
    if (!selected) return;
    const subjective = selected.questions.filter((question) => ["short_answer", "long_answer"].includes(question.question_snapshot.questionType));
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ result: { status: string; score: number; total_marks: number } }>(
        `/results/attempts/${selected.attempt.id}/grades`,
        {
          method: "PATCH",
          body: JSON.stringify({
            grades: subjective.map((question) => ({
              paperQuestionId: question.paper_question_id,
              awardedMarks: Number(grades[question.paper_question_id]?.marks || 0),
              feedback: grades[question.paper_question_id]?.feedback || null
            }))
          })
        }
      );
      setNotice(`Evaluation saved. Final score: ${result.result.score} / ${result.result.total_marks}`);
      await loadResults();
      const fresh = items.find((item) => item.attempt_id === selected.attempt.id) || {
        ...selected.attempt, status: result.result.status, score: result.result.score
      };
      await openAttempt(fresh);
    } catch (cause) { setError(getError(cause)); }
    finally { setSaving(false); }
  }

  const pendingCount = items.filter((item) => item.status === "awaiting_review" || item.status === "submitted" || item.status === "auto_submitted").length;
  const subjective = selected?.questions.filter((question) => ["short_answer", "long_answer"].includes(question.question_snapshot.questionType)) || [];

  return (
    <div className="results-page">
      <div className="directory-heading"><div><span className="directory-eyebrow">ASSESSMENT RESULTS</span><h2>Results & Evaluation</h2><p>Review submitted attempts, inspect answer snapshots and evaluate written responses.</p></div><div className="directory-total"><strong>{pendingCount}</strong><span>awaiting review</span></div></div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}
      <div className="results-toolbar">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All results</option><option value="awaiting_review">Awaiting review</option><option value="graded">Graded</option><option value="submitted">Submitted</option><option value="auto_submitted">Auto submitted</option></select>
        <span>{items.length} exam attempts</span>
      </div>
      <div className="results-layout">
        <section className="directory-table-card">
          <div className="results-card-head"><strong>Student attempts</strong><span>Most recent first</span></div>
          {loading ? <div className="directory-empty">Loading results…</div> : <div className="directory-table-scroll"><table><thead><tr><th>STUDENT / PAPER</th><th>SUBMITTED</th><th>SCORE</th><th>STATUS</th><th></th></tr></thead><tbody>
            {items.map((item) => <tr key={item.attempt_id} className={selected?.attempt.id === item.attempt_id ? "result-row-selected" : ""}>
              <td><strong>{item.student_name}</strong><small>{item.student_number} · {item.paper_code} · {item.title}</small></td>
              <td>{fmtDate(item.submitted_at)}</td><td>{item.score === null ? "Pending" : item.score + " / " + item.total_marks}</td>
              <td><span className={item.status === "graded" ? "directory-status active" : "directory-status inactive"}>{item.status.replaceAll("_", " ")}</span></td>
              <td><button className="directory-row-action" onClick={() => void openAttempt(item)}>Review</button></td>
            </tr>)}
          </tbody></table>{!items.length && <div className="directory-empty">No result records found.</div>}</div>}
        </section>

        <section className="directory-table-card results-detail">
          <div className="results-card-head"><strong>{selected ? "Attempt review" : "Review details"}</strong><span>{selected?.attempt.paper_code || "Select an attempt"}</span></div>
          {!selected ? <div className="directory-empty">Select a student attempt to inspect objective answers and evaluate written responses.</div> : <>
            <div className="results-student-meta"><strong>{selected.attempt.student_name}</strong><span>{selected.attempt.title} · {selected.attempt.status.replaceAll("_", " ")}</span><b>{selected.attempt.score ?? 0} / {selected.attempt.total_marks} marks</b></div>
            <div className="results-question-list">
              {selected.questions.map((question) => {
                const type = question.question_snapshot.questionType;
                const written = type === "short_answer" || type === "long_answer";
                return <article className="result-question" key={question.paper_question_id}>
                  <div className="result-question-title"><strong>Q{question.position}. {question.question_snapshot.prompt}</strong><span>{question.marks} marks · {type.replaceAll("_", " ")}</span></div>
                  <div className="result-answer-row"><b>Student answer</b><span>{question.answer_value === null || question.answer_value === undefined ? "Not answered" : Array.isArray(question.answer_value) ? question.answer_value.join(", ") : typeof question.answer_value === "object" ? JSON.stringify(question.answer_value) : String(question.answer_value)}</span></div>
                  {!written && <div className="result-answer-row"><b>Answer key</b><span>{question.answer_snapshot === null ? "Not configured" : Array.isArray(question.answer_snapshot) ? question.answer_snapshot.join(", ") : String(question.answer_snapshot)}</span></div>}
                  {written && <div className="result-grade-fields">
                    <label>Award marks<input type="number" min="0" max={Number(question.marks)} step="0.25" value={grades[question.paper_question_id]?.marks ?? "0"} disabled={!canGrade || selected.attempt.status === "graded"} onChange={(event) => setGrades((current) => ({ ...current, [question.paper_question_id]: { marks: event.target.value, feedback: current[question.paper_question_id]?.feedback || "" } }))} /></label>
                    <label>Feedback<textarea rows={2} value={grades[question.paper_question_id]?.feedback || ""} disabled={!canGrade || selected.attempt.status === "graded"} onChange={(event) => setGrades((current) => ({ ...current, [question.paper_question_id]: { marks: current[question.paper_question_id]?.marks || "0", feedback: event.target.value } }))} /></label>
                    {question.graded_by && <small>Last graded by {question.graded_by}</small>}
                  </div>}
                </article>;
              })}
            </div>
            {canGrade && subjective.length > 0 && selected.attempt.status !== "graded" && <div className="results-submit"><button className="directory-primary" disabled={saving} onClick={() => void saveGrades()}>{saving ? "Saving…" : "Save final evaluation"}</button></div>}
          </>}
        </section>
      </div>
    </div>
  );
}
