import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../lib/api";
import "./student-exams.css";

type Paper = {
  id: string; paper_code: string; title: string; subject_name: string;
  duration_minutes: number; starts_at: string; ends_at: string;
  instructions: string | null; total_marks: number; question_count: number;
  status: string; batch_name: string; attempt_id: string | null; attempt_status: string | null;
  deadline_at: string | null; submitted_at: string | null;
};
type QuestionOption = { id: string; text: string };
type QuestionSnapshot = {
  questionCode: string; questionType: string; prompt: string;
  options: QuestionOption[]; explanation?: string | null; difficulty: string;
};
type AttemptQuestion = {
  paper_question_id: string; position: number; question_snapshot: QuestionSnapshot;
  marks: number; answer_value: unknown; revision: number | null;
};
type Attempt = {
  id: string; paper_id: string; status: string; started_at: string;
  deadline_at: string; total_marks: number; submitted_at: string | null;
  title: string; paper_code: string;
};
type AttemptPayload = { attempt: Attempt; questions: AttemptQuestion[] };
type ExamResult = {
  id: string; status: string; submitted_at: string; total_marks: number;
  score: number | null; correct_count: number | null; incorrect_count: number | null;
  unanswered_count: number | null; graded_at: string | null; title: string; paper_code: string;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
function timerText(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":");
}

export default function StudentExamPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [studentName, setStudentName] = useState("");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<AttemptQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submissionStarted = useRef(false);

  async function loadPapers() {
    setLoading(true); setError("");
    try {
      const data = await apiRequest<{ student: { full_name: string }; items: Paper[] }>("/student/exams");
      setStudentName(data.student.full_name);
      setPapers(data.items);
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadPapers(); }, []);

  async function loadAttempt(attemptId: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      const data = await apiRequest<AttemptPayload>(`/student/attempts/${attemptId}`);
      setAttempt(data.attempt);
      setQuestions(data.questions);
      const initial: Record<string, unknown> = {};
      for (const question of data.questions) initial[question.paper_question_id] = question.answer_value;
      setAnswers(initial);
      setActiveIndex(0);
      setResult(null);
      submissionStarted.current = false;
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }

  async function startExam(paper: Paper) {
    setSaving(true); setError(""); setNotice("");
    try {
      let attemptId = paper.attempt_id;
      if (paper.attempt_status && paper.attempt_status !== "in_progress") {
        const data = await apiRequest<{ result: ExamResult }>(`/student/attempts/${paper.attempt_id}/result`);
        setResult(data.result);
        return;
      }
      if (!attemptId) {
        const started = await apiRequest<{ attempt: Attempt }>("/student/papers/" + paper.id + "/attempts", {
          method: "POST", body: "{}"
        });
        attemptId = started.attempt.id;
      }
      await loadAttempt(attemptId);
    } catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }

  async function saveOne(questionId: string, value: unknown) {
    if (!attempt || attempt.status !== "in_progress") return;
    try {
      await apiRequest(`/student/attempts/${attempt.id}/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers: [{ paperQuestionId: questionId, answerValue: value }] })
      });
      setLastSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  function changeAnswer(questionId: string, value: unknown, immediate = true) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    if (immediate) void saveOne(questionId, value);
  }

  async function submitAttempt() {
    if (!attempt || submissionStarted.current) return;
    submissionStarted.current = true;
    setSaving(true); setError("");
    try {
      const data = await apiRequest<{ result: ExamResult }>(`/student/attempts/${attempt.id}/submit`, {
        method: "POST", body: "{}"
      });
      setResult({
        id: data.result.id || attempt.id,
        status: data.result.status,
        submitted_at: data.result.submitted_at,
        total_marks: data.result.total_marks,
        score: data.result.score,
        correct_count: data.result.correct_count,
        incorrect_count: data.result.incorrect_count,
        unanswered_count: data.result.unanswered_count,
        graded_at: data.result.graded_at,
        title: attempt.title,
        paper_code: attempt.paper_code
      });
      setAttempt(null);
      await loadPapers();
    } catch (cause) {
      submissionStarted.current = false;
      setError(errorText(cause));
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress") return;
    const update = () => setRemaining(Math.max(0, Math.floor((new Date(attempt.deadline_at).getTime() - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [attempt]);

  useEffect(() => {
    if (attempt?.status === "in_progress" && remaining <= 0 && !submissionStarted.current) {
      void submitAttempt();
    }
  }, [remaining, attempt]);

  const currentQuestion = questions[activeIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.paper_question_id] : undefined;
  const answeredCount = questions.filter((question) => {
    const answer = answers[question.paper_question_id];
    return answer !== null && answer !== undefined && answer !== "" && !(Array.isArray(answer) && answer.length === 0);
  }).length;

  if (attempt && currentQuestion) {
    const snapshot = currentQuestion.question_snapshot;
    const objective = ["single_choice", "multiple_choice", "true_false"].includes(snapshot.questionType);
    return (
      <div className="student-exam-page">
        <div className="student-exam-topbar">
          <div><span className="directory-eyebrow">LIVE EXAM · {attempt.paper_code}</span><h2>{attempt.title}</h2><p>{studentName} · {answeredCount} of {questions.length} answered</p></div>
          <div className={remaining <= 300 ? "exam-timer warning" : "exam-timer"}><span>TIME LEFT</span><strong>{timerText(remaining)}</strong></div>
        </div>
        {error && <div className="directory-alert error" role="alert">{error}</div>}
        <div className="student-exam-layout">
          <section className="student-question-panel">
            <div className="student-question-head"><span>QUESTION {activeIndex + 1} / {questions.length}</span><span>{currentQuestion.marks} marks · {snapshot.difficulty}</span></div>
            <h3>{snapshot.prompt}</h3>
            {snapshot.questionType === "single_choice" && <div className="student-answer-options">
              {snapshot.options.map((option) => <label key={option.id} className={currentAnswer === option.id ? "student-answer-option selected" : "student-answer-option"}>
                <input type="radio" name={currentQuestion.paper_question_id} checked={currentAnswer === option.id} onChange={() => changeAnswer(currentQuestion.paper_question_id, option.id)} />
                <b>{option.id}</b><span>{option.text}</span>
              </label>)}
            </div>}
            {snapshot.questionType === "multiple_choice" && <div className="student-answer-options">
              {snapshot.options.map((option) => {
                const selected = Array.isArray(currentAnswer) ? currentAnswer.map(String) : [];
                return <label key={option.id} className={selected.includes(option.id) ? "student-answer-option selected" : "student-answer-option"}>
                  <input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => {
                    const next = event.target.checked ? [...selected, option.id] : selected.filter((item) => item !== option.id);
                    changeAnswer(currentQuestion.paper_question_id, next);
                  }} />
                  <b>{option.id}</b><span>{option.text}</span>
                </label>;
              })}
            </div>}
            {snapshot.questionType === "true_false" && <div className="student-answer-options">
              {[true, false].map((value) => <label key={String(value)} className={currentAnswer === value ? "student-answer-option selected" : "student-answer-option"}>
                <input type="radio" name={currentQuestion.paper_question_id} checked={currentAnswer === value} onChange={() => changeAnswer(currentQuestion.paper_question_id, value)} />
                <span>{value ? "True" : "False"}</span>
              </label>)}
            </div>}
            {(snapshot.questionType === "short_answer" || snapshot.questionType === "long_answer") && <label className="student-written-answer">
              Your answer
              <textarea rows={snapshot.questionType === "short_answer" ? 4 : 9} value={typeof currentAnswer === "string" ? currentAnswer : ""} onChange={(event) => changeAnswer(currentQuestion.paper_question_id, event.target.value, false)} onBlur={() => void saveOne(currentQuestion.paper_question_id, answers[currentQuestion.paper_question_id] ?? "")} placeholder="Write your answer here…" />
            </label>}
            <div className="student-question-footer">
              <span>{lastSavedAt ? "Last saved at " + lastSavedAt : "Answers save to the server as you progress."}</span>
              <div><button className="secondary-button" disabled={activeIndex === 0} onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}>Previous</button>
                {activeIndex < questions.length - 1
                  ? <button className="directory-primary" onClick={() => setActiveIndex((value) => Math.min(questions.length - 1, value + 1))}>Next question</button>
                  : <button className="directory-primary" disabled={saving} onClick={() => void submitAttempt()}>{saving ? "Submitting…" : "Submit exam"}</button>}
              </div>
            </div>
          </section>
          <aside className="student-question-nav">
            <strong>Question palette</strong>
            <div className="student-question-grid">
              {questions.map((question, index) => {
                const answer = answers[question.paper_question_id];
                const answered = answer !== null && answer !== undefined && answer !== "" && !(Array.isArray(answer) && answer.length === 0);
                return <button key={question.paper_question_id} className={(index === activeIndex ? "current " : "") + (answered ? "answered" : "")} onClick={() => setActiveIndex(index)}>{index + 1}</button>;
              })}
            </div>
            <div className="student-palette-legend"><span><i className="answered-dot" /> Answered</span><span><i /> Not answered</span></div>
            <p>Time is controlled by the exam server. The attempt closes at the server deadline.</p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="student-exam-page">
      <div className="directory-heading"><div><span className="directory-eyebrow">STUDENT EXAM PORTAL</span><h2>My Examinations</h2><p>Welcome, {studentName || "Student"}. Your assigned exams and submitted attempts appear here.</p></div><div className="directory-total"><strong>{papers.length}</strong><span>assigned exams</span></div></div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}
      {result && <section className="student-result-card">
        <div><span className="directory-eyebrow">EXAM SUBMISSION</span><h3>{result.title}</h3><p>{result.paper_code} · {result.status.replaceAll("_", " ")}</p></div>
        <div className="student-result-score"><strong>{result.score === null ? "Pending" : result.score + " / " + result.total_marks}</strong><span>{result.status === "graded" ? "Final score" : "Objective score · manual evaluation pending"}</span></div>
        <button className="secondary-button" onClick={() => setResult(null)}>Dismiss</button>
      </section>}
      {loading ? <div className="directory-empty">Loading assigned examinations…</div> : <div className="student-paper-grid">
        {papers.map((paper) => {
          const inProgress = paper.attempt_status === "in_progress";
          const done = Boolean(paper.attempt_status && !inProgress);
          return <article key={paper.id} className="student-paper-card">
            <div className="student-paper-card-top"><span className="student-paper-subject">{paper.subject_name}</span><span className={"directory-status " + (done ? "inactive" : "active")}>{paper.attempt_status?.replaceAll("_", " ") || paper.status}</span></div>
            <h3>{paper.title}</h3><p>{paper.paper_code} · {paper.batch_name}</p>
            <div className="student-paper-meta"><span>{paper.duration_minutes} min</span><span>{paper.question_count} questions</span><span>{paper.total_marks} marks</span></div>
            <div className="student-paper-window">Opens {new Date(paper.starts_at).toLocaleString("en-IN")}<br/>Closes {new Date(paper.ends_at).toLocaleString("en-IN")}</div>
            {done
              ? <button className="secondary-button" onClick={async () => {
                  try {
                    const data = await apiRequest<{ result: ExamResult }>(`/student/attempts/${paper.attempt_id}/result`);
                    setResult({ ...data.result, title: paper.title, paper_code: paper.paper_code });
                  } catch (cause) { setError(errorText(cause)); }
                }}>View result</button>
              : <button className="directory-primary" disabled={saving} onClick={() => void startExam(paper)}>{saving ? "Opening…" : inProgress ? "Resume exam" : "Start exam"}</button>}
          </article>;
        })}
        {!papers.length && <div className="directory-empty">No published exams are assigned to your batch yet.</div>}
      </div>}
    </div>
  );
}
