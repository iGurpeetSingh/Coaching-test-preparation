import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./student-exams.css";

type PaperType = "objective" | "written";
type ObjectiveQuestion = { prompt: string; options: string[]; marks?: number };
type WrittenQuestion = { prompt: string; marks: number };
export type ExamPaper = {
  paperType: PaperType;
  title: string;
  subject: string;
  className: string;
  startAt: string;
  durationMinutes: number;
  instructions?: string;
  questions?: ObjectiveQuestion[];
  writtenQuestions?: WrittenQuestion[];
};

type StartedAttempt = {
  attemptId: string;
  receiptToken: string;
  expiresAt: string;
  paper: ExamPaper;
};

type AttemptResult = {
  attemptId: string;
  title: string;
  status: "evaluated" | "awaiting_marking" | "graded" | string;
  score: number | null;
  totalMarks: number;
  correctCount?: number;
  incorrectCount?: number;
  unansweredCount?: number;
};

type Props = {
  paper: ExamPaper;
  apiBaseUrl: string;
  onClose: () => void;
};

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export default function StudentExamRunner({ paper, apiBaseUrl, onClose }: Props) {
  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [attempt, setAttempt] = useState<StartedAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);

  const questions = useMemo(() => (
    paper.paperType === "objective"
      ? (paper.questions || [])
      : (paper.writtenQuestions || [])
  ), [paper]);

  const answeredCount = useMemo(() => questions.reduce((count, _question, index) => {
    const value = answers[String(index)];
    return count + (typeof value === "string" ? (value.trim() ? 1 : 0) : (value === undefined ? 0 : 1));
  }, 0), [answers, questions]);

  const startAttempt = useCallback(async () => {
    if (!studentName.trim() || !rollNumber.trim()) {
      setError("Enter your full name and roll number before starting.");
      return;
    }
    if (!apiBaseUrl) {
      setError("The exam service is not configured yet.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/exams/${paper.paperType}/attempts/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ studentName: studentName.trim(), rollNumber: rollNumber.trim() }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Could not start exam (HTTP ${response.status}).`);
      const started = data as StartedAttempt;
      setAttempt(started);
      setAnswers({});
      setQuestionIndex(0);
      setResult(null);
      setRemainingSeconds(Math.max(0, Math.floor((Date.parse(started.expiresAt) - Date.now()) / 1000)));
      submitLock.current = false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to the exam service.");
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl, paper.paperType, studentName, rollNumber]);

  const submitExam = useCallback(async () => {
    if (!attempt || submitLock.current || result) return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/exams/${paper.paperType}/attempts/${attempt.attemptId}/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Exam-Receipt-Token": attempt.receiptToken,
          },
          body: JSON.stringify({ answers }),
          cache: "no-store",
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Submission failed (HTTP ${response.status}).`);
      setResult(data as AttemptResult);
    } catch (cause) {
      submitLock.current = false;
      setError(cause instanceof Error ? cause.message : "The exam could not be submitted. Please retry.");
    } finally {
      setBusy(false);
    }
  }, [apiBaseUrl, answers, attempt, paper.paperType, result]);

  useEffect(() => {
    if (!attempt || result) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((Date.parse(attempt.expiresAt) - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        void submitExam();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, result, submitExam]);

  const question = questions[questionIndex];
  const isObjective = paper.paperType === "objective";

  if (result) {
    const isWrittenPending = result.status === "awaiting_marking";
    return (
      <section className="student-runner">
        <div className="student-runner-header">
          <div><span className="student-exams-eyebrow">EXAM SUBMISSION</span><h1>Submission received</h1><p>{result.title} · {studentName} · Roll {rollNumber}</p></div>
          <span className="student-exam-status is-published">Submitted</span>
        </div>
        <div className="student-runner-result">
          {isWrittenPending ? (
            <>
              <span className="student-runner-result-kicker">WRITTEN PAPER</span>
              <h2>Awaiting teacher evaluation</h2>
              <p>Your answers have been saved. The marks will be available after the teacher checks your answers.</p>
            </>
          ) : (
            <>
              <span className="student-runner-result-kicker">OBJECTIVE PAPER RESULT</span>
              <h2>{result.score ?? 0} <small>/ {result.totalMarks} marks</small></h2>
              <p>{result.correctCount ?? 0} correct · {result.incorrectCount ?? 0} incorrect · {result.unansweredCount ?? 0} unanswered</p>
            </>
          )}
          <p className="student-runner-receipt">Submission ID: {result.attemptId}</p>
        </div>
        <button className="student-exam-open" type="button" onClick={onClose}>Back to exams</button>
      </section>
    );
  }

  if (!attempt) {
    return (
      <section className="student-runner">
        <button type="button" className="student-runner-back" onClick={onClose}>← Back to exam list</button>
        <div className="student-runner-header">
          <div><span className="student-exams-eyebrow">EXAM INSTRUCTIONS</span><h1>{paper.title}</h1><p>{paper.subject} · {paper.className} · {paper.durationMinutes} minutes · 100 marks</p></div>
          <span className="student-exam-status is-published">Published</span>
        </div>
        {paper.instructions && <p className="student-runner-instructions">{paper.instructions}</p>}
        <div className="student-runner-identity">
          <h2>Student details</h2>
          <label>Full name<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Enter your full name" autoComplete="name" /></label>
          <label>Roll number<input value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} placeholder="Enter your roll number" /></label>
          <p>Your identity is currently self-entered because this Coaching project does not yet contain an active student sign-in/session API.</p>
          <button className="student-exam-open" type="button" disabled={busy} onClick={() => void startAttempt()}>{busy ? "Starting exam..." : "Start Exam →"}</button>
        </div>
        {error && <p className="student-exam-connection-note" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="student-runner">
      <div className="student-runner-header">
        <div><span className="student-exams-eyebrow">{isObjective ? "OBJECTIVE EXAM" : "WRITTEN EXAM"}</span><h1>{attempt.paper.title}</h1><p>{studentName} · Roll {rollNumber} · {answeredCount}/{questions.length} answered</p></div>
        <div className={remainingSeconds <= 300 ? "student-runner-timer is-warning" : "student-runner-timer"}><span>TIME LEFT</span><strong>{formatRemaining(remainingSeconds)}</strong></div>
      </div>
      {attempt.paper.instructions && <p className="student-runner-instructions">{attempt.paper.instructions}</p>}
      <div className="student-runner-layout">
        <article className="student-runner-question">
          <div className="student-runner-question-meta"><span>QUESTION {questionIndex + 1} OF {questions.length}</span><span>{isObjective ? (question as ObjectiveQuestion)?.marks ?? 2 : (question as WrittenQuestion)?.marks} MARKS</span></div>
          <h2>{question?.prompt}</h2>
          {isObjective ? (
            <div className="student-runner-options">
              {((question as ObjectiveQuestion)?.options || []).map((option, index) => (
                <button type="button" key={index} className={answers[String(questionIndex)] === index ? "is-selected" : ""} onClick={() => setAnswers((current) => ({ ...current, [String(questionIndex)]: index }))}>
                  <span>{String.fromCharCode(65 + index)}</span>{option}
                </button>
              ))}
            </div>
          ) : (
            <label className="student-runner-answer">Your answer
              <textarea rows={8} value={String(answers[String(questionIndex)] ?? "")} onChange={(event) => setAnswers((current) => ({ ...current, [String(questionIndex)]: event.target.value }))} placeholder="Write your answer here..." />
            </label>
          )}
          <div className="student-runner-navigation">
            <button type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}>← Previous</button>
            <span>{answeredCount} of {questions.length} answered</span>
            <button type="button" disabled={questionIndex >= questions.length - 1} onClick={() => setQuestionIndex((value) => Math.min(questions.length - 1, value + 1))}>Next →</button>
          </div>
        </article>
        <aside className="student-runner-palette">
          <h3>Question palette</h3>
          <p>Select a question to navigate.</p>
          <div>{questions.map((_item, index) => {
            const answer = answers[String(index)];
            const answered = typeof answer === "string" ? Boolean(answer.trim()) : answer !== undefined;
            return <button type="button" key={index} className={(index === questionIndex ? "is-current " : "") + (answered ? "is-answered" : "")} onClick={() => setQuestionIndex(index)}>{index + 1}</button>;
          })}</div>
          <button className="student-runner-submit" type="button" disabled={busy} onClick={() => {
            const unanswered = questions.length - answeredCount;
            if (window.confirm(`Submit this paper now? ${unanswered} question(s) are unanswered.`)) void submitExam();
          }}>{busy ? "Submitting..." : "Submit Exam"}</button>
        </aside>
      </div>
      {error && <p className="student-exam-connection-note" role="alert">{error}</p>}
    </section>
  );
}
