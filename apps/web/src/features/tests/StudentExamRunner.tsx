import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDemoAttempt,
  getDemoAttempt,
  saveDemoAttemptAnswers,
  submitDemoAttempt,
  type DemoAttempt,
  type DemoPaper,
} from "../papers/demo-paper-store";
import "./student-exams.css";

type Props = {
  paper: DemoPaper;
  onClose: () => void;
};

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

function isAttemptComplete(attempt: DemoAttempt | null): boolean {
  return Boolean(attempt && attempt.status !== "in_progress");
}

export default function StudentExamRunner({ paper, onClose }: Props) {
  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [attempt, setAttempt] = useState<DemoAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitLock = useRef(false);

  const isObjective = paper.paperType === "objective";
  const questions = useMemo(
    () => isObjective ? paper.questions || [] : paper.writtenQuestions || [],
    [isObjective, paper.questions, paper.writtenQuestions]
  );

  const answeredCount = useMemo(() => questions.reduce((count, _question, index) => {
    const value = answers[String(index)];
    return count + (typeof value === "string" ? (value.trim() ? 1 : 0) : value === undefined ? 0 : 1);
  }, 0), [answers, questions]);

  const startAttempt = useCallback(() => {
    if (!studentName.trim() || !rollNumber.trim()) {
      setError("Enter your full name and roll number before starting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const started = createDemoAttempt(paper, studentName, rollNumber);
      setAttempt(started);
      setAnswers({});
      setQuestionIndex(0);
      setRemainingSeconds(Math.max(0, Math.floor((Date.parse(started.expiresAt) - Date.now()) / 1000)));
      submitLock.current = false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start this demo exam.");
    } finally {
      setBusy(false);
    }
  }, [paper, studentName, rollNumber]);

  const submitExam = useCallback(() => {
    if (!attempt || submitLock.current || attempt.status !== "in_progress") return;
    submitLock.current = true;
    setBusy(true);
    setError("");
    try {
      const submitted = submitDemoAttempt(attempt.attemptId);
      if (!submitted) throw new Error("Submission record was not found. Please return to the exam list.");
      setAttempt(submitted);
    } catch (cause) {
      submitLock.current = false;
      setError(cause instanceof Error ? cause.message : "The exam could not be submitted. Please retry.");
    } finally {
      setBusy(false);
    }
  }, [attempt]);

  useEffect(() => {
    if (!attempt || isAttemptComplete(attempt)) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.floor((Date.parse(attempt.expiresAt) - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        submitExam();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, submitExam]);

  useEffect(() => {
    if (!attempt || attempt.status !== "awaiting_marking") return;
    const refresh = window.setInterval(() => {
      const latest = getDemoAttempt(attempt.attemptId);
      if (latest && latest.status !== attempt.status) setAttempt(latest);
    }, 2000);
    return () => window.clearInterval(refresh);
  }, [attempt]);

  function updateAnswer(value: number | string) {
    if (!attempt) return;
    const next = { ...answers, [String(questionIndex)]: value };
    setAnswers(next);
    saveDemoAttemptAnswers(attempt.attemptId, next);
  }

  const question = questions[questionIndex];
  const isComplete = isAttemptComplete(attempt);

  if (attempt && isComplete) {
    const written = paper.paperType === "written";
    const pending = attempt.status === "awaiting_marking";
    return (
      <section className="student-runner">
        <div className="student-runner-header">
          <div>
            <span className="student-exams-eyebrow">EXAM SUBMISSION</span>
            <h1>Submission received</h1>
            <p>{paper.title} · {studentName} · Roll {rollNumber}</p>
          </div>
          <span className="student-exam-status is-published">Submitted</span>
        </div>
        <div className="student-runner-result">
          {pending ? (
            <>
              <span className="student-runner-result-kicker">WRITTEN PAPER</span>
              <h2>Awaiting teacher evaluation</h2>
              <p>Your answers are saved in this demo browser. Marks will appear after the teacher checks your answers in Paper Management.</p>
            </>
          ) : (
            <>
              <span className="student-runner-result-kicker">{written ? "WRITTEN PAPER RESULT" : "OBJECTIVE PAPER RESULT"}</span>
              <h2>{attempt.score ?? 0} <small>/ {attempt.totalMarks} marks</small></h2>
              {!written && <p>{attempt.correctCount ?? 0} correct · {attempt.incorrectCount ?? 0} incorrect · {attempt.unansweredCount ?? 0} unanswered</p>}
              {written && <p>Your written answers have been checked and marks have been published.</p>}
            </>
          )}
          <p className="student-runner-receipt">Submission ID: {attempt.attemptId}</p>
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
          <div>
            <span className="student-exams-eyebrow">EXAM INSTRUCTIONS · DEMO MODE</span>
            <h1>{paper.title}</h1>
            <p>{paper.subject} · {paper.className} · {paper.durationMinutes} minutes · 100 marks</p>
          </div>
          <span className="student-exam-status is-published">Published</span>
        </div>
        {paper.instructions && <p className="student-runner-instructions">{paper.instructions}</p>}
        <div className="student-runner-identity">
          <h2>Student details</h2>
          <label>Full name<input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="Enter your full name" autoComplete="name" /></label>
          <label>Roll number<input value={rollNumber} onChange={(event) => setRollNumber(event.target.value)} placeholder="Enter your roll number" /></label>
          <p>Demo mode: student details and answers are stored only in this browser. No student account or external API is required.</p>
          <button className="student-exam-open" type="button" disabled={busy} onClick={startAttempt}>{busy ? "Starting exam..." : "Start Exam →"}</button>
        </div>
        {error && <p className="student-exam-connection-note" role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="student-runner">
      <div className="student-runner-header">
        <div>
          <span className="student-exams-eyebrow">{isObjective ? "OBJECTIVE EXAM" : "WRITTEN EXAM"}</span>
          <h1>{paper.title}</h1>
          <p>{studentName} · Roll {rollNumber} · {answeredCount}/{questions.length} answered</p>
        </div>
        <div className={remainingSeconds <= 300 ? "student-runner-timer is-warning" : "student-runner-timer"}>
          <span>TIME LEFT</span><strong>{formatRemaining(remainingSeconds)}</strong>
        </div>
      </div>
      {paper.instructions && <p className="student-runner-instructions">{paper.instructions}</p>}
      <div className="student-runner-layout">
        <article className="student-runner-question">
          <div className="student-runner-question-meta">
            <span>QUESTION {questionIndex + 1} OF {questions.length}</span>
            <span>{isObjective ? 2 : paper.writtenQuestions?.[questionIndex]?.marks} MARKS</span>
          </div>
          <h2>{question?.prompt}</h2>
          {isObjective ? (
            <div className="student-runner-options">
              {(paper.questions?.[questionIndex]?.options || []).map((option, index) => (
                <button
                  type="button"
                  key={index}
                  className={answers[String(questionIndex)] === index ? "is-selected" : ""}
                  onClick={() => updateAnswer(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>{option}
                </button>
              ))}
            </div>
          ) : (
            <label className="student-runner-answer">Your answer
              <textarea
                rows={8}
                value={String(answers[String(questionIndex)] ?? "")}
                onChange={(event) => updateAnswer(event.target.value)}
                placeholder="Write your answer here..."
              />
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
            return (
              <button
                type="button"
                key={index}
                className={(index === questionIndex ? "is-current " : "") + (answered ? "is-answered" : "")}
                onClick={() => setQuestionIndex(index)}
              >
                {index + 1}
              </button>
            );
          })}</div>
          <button className="student-runner-submit" type="button" disabled={busy} onClick={() => {
            const unanswered = questions.length - answeredCount;
            if (window.confirm("Submit this paper now? " + unanswered + " question(s) are unanswered.")) submitExam();
          }}>
            {busy ? "Submitting..." : "Submit Exam"}
          </button>
        </aside>
      </div>
      {error && <p className="student-exam-connection-note" role="alert">{error}</p>}
    </section>
  );
}
