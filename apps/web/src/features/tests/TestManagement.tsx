import { useEffect, useMemo, useState } from "react";
import "./test-management.css";

type ExamQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  marks: number;
};

type ExamTest = {
  id: string;
  title: string;
  subject: string;
  className: string;
  startAt: string;
  durationMinutes: number;
  instructions: string;
  questions: ExamQuestion[];
  isPublished: boolean;
  createdAt: string;
};

type ExamAttempt = {
  id: string;
  testId: string;
  startedAt: string;
  answers: Record<string, number>;
  submittedAt?: string;
  score?: number;
  totalMarks: number;
  preview: boolean;
};

type FilterKey = "all" | "upcoming" | "live" | "completed" | "draft";

const TESTS_STORAGE_KEY = "coaching-pro.tests.v1";
const ATTEMPTS_STORAGE_KEY = "coaching-pro.exam-attempts.v1";

function readStored<T,>(key: string): T[] {
  try {
    const stored = window.localStorage.getItem(key);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function makeId(prefix: string): string {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function defaultStartTime(): string {
  return localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000));
}

function statusFor(test: ExamTest, now = Date.now()): FilterKey {
  if (!test.isPublished) return "draft";
  const start = new Date(test.startAt).getTime();
  if (!Number.isFinite(start) || now < start) return "upcoming";
  const end = start + Math.max(1, test.durationMinutes) * 60 * 1000;
  return now < end ? "live" : "completed";
}

function statusLabel(status: FilterKey): string {
  return ({ all: "All tests", upcoming: "Upcoming", live: "Live now", completed: "Completed", draft: "Draft" })[status];
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not scheduled" : date.toLocaleString([], {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function totalMarks(test: ExamTest): number {
  return test.questions.reduce((sum, question) => sum + question.marks, 0);
}

type Props = {
  onBack: () => void;
  onOpenPaperBuilder: () => void;
  searchQuery?: string;
};

export default function TestManagement({ onBack, onOpenPaperBuilder, searchQuery = "" }: Props) {
  const [tests, setTests] = useState<ExamTest[]>(() => readStored<ExamTest>(TESTS_STORAGE_KEY));
  const [attempts, setAttempts] = useState<ExamAttempt[]>(() => readStored<ExamAttempt>(ATTEMPTS_STORAGE_KEY));
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<"list" | "create" | "details" | "exam" | "results">("list");
  const [studentMode, setStudentMode] = useState(false);\n  const [studentClass, setStudentClass] = useState("Class 10");
  const [selectedTestId, setSelectedTestId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [currentAttemptId, setCurrentAttemptId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [now, setNow] = useState(Date.now());

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Mathematics");
  const [className, setClassName] = useState("Class 10");
  const [startAt, setStartAt] = useState(defaultStartTime);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [instructions, setInstructions] = useState("Read every question carefully. Select one correct option. You can review your answers before submitting.");
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [questionMarks, setQuestionMarks] = useState(1);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(TESTS_STORAGE_KEY, JSON.stringify(tests)); } catch { /* storage may be unavailable */ }
  }, [tests]);

  useEffect(() => {
    try { window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts)); } catch { /* storage may be unavailable */ }
  }, [attempts]);

  const selectedTest = tests.find((test) => test.id === selectedTestId);
  const currentTest = selectedTest;
  const selectedAttempt = attempts.find((attempt) => attempt.id === selectedAttemptId);
  const currentAttempt = attempts.find((attempt) => attempt.id === currentAttemptId);

  const counts = useMemo(() => ({
    all: tests.length,
    upcoming: tests.filter((test) => statusFor(test, now) === "upcoming").length,
    live: tests.filter((test) => statusFor(test, now) === "live").length,
    completed: tests.filter((test) => statusFor(test, now) === "completed").length,
    draft: tests.filter((test) => statusFor(test, now) === "draft").length
  }), [tests, now]);

  const visibleTests = useMemo(() => tests.filter((test) => {
    const status = statusFor(test, now);
    const matchesFilter = filter === "all" || status === filter;
    const search = searchQuery.trim().toLowerCase();
    const matchesSearch = !search || [test.title, test.subject, test.className].some((value) => value.toLowerCase().includes(search));
    return matchesFilter && matchesSearch;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [tests, filter, searchQuery, now]);

  const studentTests = useMemo(
    () => tests.filter((test) => test.isPublished && test.className === studentClass).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [tests, studentClass]
  );

  function resetForm() {
    setEditingId("");
    setTitle("");
    setSubject("Mathematics");
    setClassName("Class 10");
    setStartAt(defaultStartTime());
    setDurationMinutes(60);
    setInstructions("Read every question carefully. Select one correct option. You can review your answers before submitting.");
    setQuestions([]);
    setQuestionPrompt("");
    setOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setQuestionMarks(1);
    setFormError("");
  }

  function beginCreate(test?: ExamTest) {
    if (test && test.isPublished) return;
    resetForm();
    if (test) {
      setEditingId(test.id);
      setTitle(test.title);
      setSubject(test.subject);
      setClassName(test.className);
      setStartAt(localDateTimeValue(new Date(test.startAt)));
      setDurationMinutes(test.durationMinutes);
      setInstructions(test.instructions);
      setQuestions(test.questions);
    }
    setView("create");
  }

  function addQuestion() {
    const prompt = questionPrompt.trim();
    const cleanOptions = options.map((option) => option.trim());
    if (!prompt) { setFormError("Question text is required."); return; }
    if (cleanOptions.some((option) => !option)) { setFormError("Fill all four answer options."); return; }
    if (new Set(cleanOptions.map((option) => option.toLowerCase())).size !== cleanOptions.length) {
      setFormError("Answer options must be different.");
      return;
    }
    setQuestions((current) => [...current, {
      id: makeId("q"),
      prompt,
      options: cleanOptions,
      correctIndex,
      marks: Math.max(1, questionMarks)
    }]);
    setQuestionPrompt("");
    setOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setQuestionMarks(1);
    setFormError("");
  }

  function saveTest(publish: boolean) {
    if (!title.trim()) { setFormError("Enter a test name before saving."); return; }
    if (!subject.trim() || !className.trim()) { setFormError("Select a class and enter a subject."); return; }
    if (publish && questions.length === 0) { setFormError("Add at least one question before scheduling this test."); return; }
    const parsedStart = new Date(startAt);
    if (publish && (!startAt || Number.isNaN(parsedStart.getTime()))) { setFormError("Choose a valid exam date and time."); return; }
    const existing = tests.find((test) => test.id === editingId);
    const record: ExamTest = {
      id: editingId || makeId("test"),
      title: title.trim(),
      subject: subject.trim(),
      className: className.trim(),
      startAt: Number.isNaN(parsedStart.getTime()) ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : parsedStart.toISOString(),
      durationMinutes: Math.max(5, Math.min(300, durationMinutes)),
      instructions: instructions.trim(),
      questions,
      isPublished: publish || Boolean(existing?.isPublished),
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    setTests((current) => existing ? current.map((test) => test.id === editingId ? record : test) : [record, ...current]);
    setSelectedTestId(record.id);
    setView(publish ? "details" : "list");
    setFormError("");
  }

  function openDetails(test: ExamTest) {
    setSelectedTestId(test.id);
    setView("details");
  }

  function publishNow(test: ExamTest) {
    const updated = { ...test, isPublished: true, startAt: new Date().toISOString() };
    setTests((current) => current.map((item) => item.id === test.id ? updated : item));
    setSelectedTestId(test.id);
  }

  function deleteTest(test: ExamTest) {
    if (!window.confirm("Delete this test and its saved attempts? This cannot be undone.")) return;
    setTests((current) => current.filter((item) => item.id !== test.id));
    setAttempts((current) => current.filter((attempt) => attempt.testId !== test.id));
    setSelectedTestId("");
    setView("list");
  }

  function startExam(test: ExamTest, preview = false, resume?: ExamAttempt) {
    if (!preview && statusFor(test) !== "live") return;
    const attempt = resume || {
      id: makeId("attempt"),
      testId: test.id,
      startedAt: new Date().toISOString(),
      answers: {},
      totalMarks: totalMarks(test),
      preview
    };
    if (!resume) setAttempts((current) => [attempt, ...current]);
    setSelectedTestId(test.id);
    setCurrentAttemptId(attempt.id);
    setSelectedAttemptId(attempt.id);
    setAnswers(attempt.answers || {});
    setCurrentQuestion(0);
    const elapsed = resume ? Math.floor((Date.now() - new Date(resume.startedAt).getTime()) / 1000) : 0;
    setRemainingSeconds(Math.max(0, test.durationMinutes * 60 - elapsed));
    setView("exam");
  }

  function saveAnswer(questionId: string, optionIndex: number) {
    const nextAnswers = { ...answers, [questionId]: optionIndex };
    setAnswers(nextAnswers);
    setAttempts((current) => current.map((attempt) => attempt.id === currentAttemptId && !attempt.submittedAt
      ? { ...attempt, answers: nextAnswers }
      : attempt));
  }

  function finishAttempt() {
    if (!currentTest || !currentAttemptId) return;
    const existing = attempts.find((attempt) => attempt.id === currentAttemptId);
    if (existing?.submittedAt) { setSelectedAttemptId(existing.id); setView("results"); return; }
    const score = currentTest.questions.reduce((sum, question) => (
      sum + (answers[question.id] === question.correctIndex ? question.marks : 0)
    ), 0);
    setAttempts((current) => current.map((attempt) => attempt.id === currentAttemptId
      ? { ...attempt, answers, score, totalMarks: totalMarks(currentTest), submittedAt: new Date().toISOString() }
      : attempt));
    setSelectedAttemptId(currentAttemptId);
    setView("results");
  }

  useEffect(() => {
    if (view !== "exam") return;
    const interval = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [view, currentAttemptId]);

  useEffect(() => {
    if (view === "exam" && remainingSeconds === 0) finishAttempt();
  }, [remainingSeconds, view]);

  const activeQuestion = currentTest?.questions[currentQuestion];
  const answeredCount = currentTest ? currentTest.questions.filter((question) => answers[question.id] !== undefined).length : 0;

  if (view === "create") {
    return (
      <div className="tm-module">
        <div className="tm-page-head">
          <button className="tm-back" onClick={() => setView("list")}>← Back to tests</button>
          <div><span className="tm-eyebrow">ASSESSMENT SETUP</span><h1>{editingId ? "Edit draft test" : "Create a new test"}</h1><p>Enter exam details, add MCQ questions, then save a draft or publish the schedule.</p></div>
          <span className="tm-step-pill">01 · Details & questions</span>
        </div>
        <div className="tm-create-grid">
          <section className="tm-panel">
            <div className="tm-panel-title"><div><h2>Test information</h2><p>These details will be shown to students before they start.</p></div><span>01</span></div>
            <div className="tm-form-grid">
              <label className="tm-field tm-field-wide">Test name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Mathematics Weekly Test 01" /></label>
              <label className="tm-field">Class / Batch<select value={className} onChange={(event) => setClassName(event.target.value)}><option>Class 9</option><option>Class 10</option><option>Class 11</option><option>Class 12</option><option>JEE Foundation</option><option>NEET Foundation</option></select></label>
              <label className="tm-field">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Physics" /></label>
              <label className="tm-field">Exam date & time<input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} /></label>
              <label className="tm-field">Duration (minutes)<input type="number" min="5" max="300" value={durationMinutes} onChange={(event) => setDurationMinutes(Math.max(5, Math.min(300, Number(event.target.value) || 5)))} /></label>
              <label className="tm-field tm-field-wide">Student instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} /></label>
            </div>
          </section>
          <section className="tm-panel">
            <div className="tm-panel-title"><div><h2>Build question paper</h2><p>MCQ questions are scored automatically on submission.</p></div><span>02</span></div>
            <div className="tm-question-form">
              <label className="tm-field">Question text<textarea value={questionPrompt} onChange={(event) => setQuestionPrompt(event.target.value)} rows={3} placeholder="Type the question here..." /></label>
              <div className="tm-option-grid">{options.map((option, index) => (
                <label className="tm-field" key={index}><span>Option {String.fromCharCode(65 + index)}</span><input value={option} onChange={(event) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={"Enter option " + String.fromCharCode(65 + index)} /></label>
              ))}</div>
              <div className="tm-answer-row">
                <label className="tm-field">Correct answer<select value={correctIndex} onChange={(event) => setCorrectIndex(Number(event.target.value))}>{options.map((_, index) => <option value={index} key={index}>Option {String.fromCharCode(65 + index)}</option>)}</select></label>
                <label className="tm-field">Marks<input type="number" min="1" max="100" value={questionMarks} onChange={(event) => setQuestionMarks(Math.max(1, Number(event.target.value) || 1))} /></label>
                <button className="tm-button tm-button-soft" onClick={addQuestion}>＋ Add question</button>
              </div>
            </div>
            <div className="tm-added-heading"><strong>Questions added</strong><span>{questions.length} questions · {questions.reduce((sum, item) => sum + item.marks, 0)} marks</span></div>
            {questions.length === 0 ? <div className="tm-empty-small">No questions added yet. Add your first MCQ above.</div> : (
              <div className="tm-added-list">{questions.map((question, index) => (
                <div className="tm-added-question" key={question.id}><div><strong>Q{index + 1}. {question.prompt}</strong><small>Correct: {String.fromCharCode(65 + question.correctIndex)} · {question.marks} marks</small></div><button aria-label="Remove question" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}>×</button></div>
              ))}</div>
            )}
          </section>
        </div>
        {formError && <div className="tm-error" role="alert">{formError}</div>}
        <div className="tm-form-actions"><button className="tm-button tm-button-outline" onClick={() => saveTest(false)}>Save as draft</button><button className="tm-button tm-button-primary" onClick={() => saveTest(true)}>Publish & schedule →</button></div>
      </div>
    );
  }

  if (view === "details" && selectedTest) {
    const status = statusFor(selectedTest, now);
    const testAttempts = attempts.filter((attempt) => attempt.testId === selectedTest.id);
    return (
      <div className="tm-module">
        <div className="tm-page-head">
          <button className="tm-back" onClick={() => setView("list")}>← All tests</button>
          <div><span className="tm-eyebrow">TEST OVERVIEW</span><h1>{selectedTest.title}</h1><p>{selectedTest.className} · {selectedTest.subject} · {selectedTest.questions.length} questions</p></div>
          <span className={"tm-status tm-status-" + status}>{statusLabel(status)}</span>
        </div>
        <div className="tm-detail-stats">
          <div><span>Duration</span><strong>{selectedTest.durationMinutes} min</strong></div>
          <div><span>Total marks</span><strong>{totalMarks(selectedTest)}</strong></div>
          <div><span>Questions</span><strong>{selectedTest.questions.length}</strong></div>
          <div><span>Attempts</span><strong>{testAttempts.length}</strong></div>
        </div>
        <section className="tm-panel tm-detail-panel">
          <div className="tm-panel-title"><div><h2>Exam schedule</h2><p>Check the published start time and student instructions.</p></div></div>
          <div className="tm-schedule-row"><div><span>Scheduled start</span><strong>{formatDate(selectedTest.startAt)}</strong></div><div><span>Exam closes</span><strong>{formatDate(new Date(new Date(selectedTest.startAt).getTime() + selectedTest.durationMinutes * 60000).toISOString())}</strong></div></div>
          <div className="tm-instructions"><strong>Instructions for students</strong><p>{selectedTest.instructions || "No additional instructions."}</p></div>
        </section>
        <section className="tm-panel">
          <div className="tm-panel-title"><div><h2>Question paper</h2><p>Teacher preview including the correct answer for each MCQ.</p></div><button className="tm-button tm-button-soft" disabled={selectedTest.questions.length === 0} title={selectedTest.questions.length === 0 ? "Add at least one question before previewing." : "Open a timed student preview"} onClick={() => startExam(selectedTest, true)}>Preview as student ↗</button></div>
          <div className="tm-paper-questions">{selectedTest.questions.map((question, index) => (
            <article key={question.id}><div><strong>Q{index + 1}. {question.prompt}</strong><span>{question.marks} marks</span></div><div className="tm-paper-options">{question.options.map((option, optionIndex) => <span className={optionIndex === question.correctIndex ? "tm-correct-option" : ""} key={optionIndex}>{String.fromCharCode(65 + optionIndex)}. {option}</span>)}</div></article>
          ))}</div>
        </section>
        <section className="tm-panel tm-attempt-panel">
          <div className="tm-panel-title"><div><h2>Student submissions & results</h2><p>Track started attempts and open submitted scorecards.</p></div><span>{testAttempts.filter((attempt) => attempt.submittedAt).length} submitted</span></div>
          {testAttempts.length === 0 ? <div className="tm-empty-small">No student attempts yet. Launch the test and students can start from the Student Portal preview.</div> : (
            <div className="tm-attempt-list">{testAttempts.map((attempt) => {
              const submitted = Boolean(attempt.submittedAt);
              const percent = attempt.totalMarks ? Math.round(((attempt.score || 0) / attempt.totalMarks) * 100) : 0;
              return <div className="tm-attempt-row" key={attempt.id}>
                <div><strong>{attempt.preview ? "Teacher preview" : "Student attempt"}</strong><small>Started {formatDate(attempt.startedAt)}{attempt.submittedAt ? " · Submitted " + formatDate(attempt.submittedAt) : " · In progress"}</small></div>
                <span className={"tm-status tm-status-" + (submitted ? "completed" : "live")}>{submitted ? "Submitted" : "In progress"}</span>
                <strong className="tm-attempt-score">{submitted ? (attempt.score || 0) + "/" + attempt.totalMarks + " · " + percent + "%" : "—"}</strong>
                <button className="tm-table-action" disabled={!submitted} onClick={() => { setSelectedAttemptId(attempt.id); setView("results"); }}>View result →</button>
              </div>;
            })}</div>
          )}
        </section>
        <div className="tm-detail-actions">
          {status === "draft" && <><button className="tm-button tm-button-outline" onClick={() => beginCreate(selectedTest)}>Edit draft</button><button className="tm-button tm-button-primary" onClick={() => {
            const parsed = new Date(selectedTest.startAt).getTime();
            if (!Number.isFinite(parsed) || parsed <= Date.now()) { setTests((current) => current.map((item) => item.id === selectedTest.id ? { ...item, startAt: new Date(Date.now() + 60000).toISOString(), isPublished: true } : item)); }
            else setTests((current) => current.map((item) => item.id === selectedTest.id ? { ...item, isPublished: true } : item));
          }}>Publish test →</button></>}
          {status === "upcoming" && <button className="tm-button tm-button-primary" onClick={() => publishNow(selectedTest)}>Launch test now →</button>}
          {status === "live" && <button className="tm-button tm-button-primary" onClick={() => { setStudentMode(true); setView("list"); }}>Open student portal ↗</button>}
          <button className="tm-button tm-button-danger" onClick={() => deleteTest(selectedTest)}>Delete test</button>
        </div>
        <p className="tm-storage-note">Saved in this browser. Student attempts and results on another device require a connected server and database.</p>
      </div>
    );
  }

  if (view === "exam" && currentTest && activeQuestion) {
    const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, "0");
    const seconds = (remainingSeconds % 60).toString().padStart(2, "0");
    return (
      <div className="tm-module tm-exam-mode">
        <div className="tm-exam-top"><div><span className="tm-eyebrow">{currentAttempt?.preview ? "STUDENT PREVIEW" : "ONLINE EXAM"}</span><h1>{currentTest.title}</h1><p>{currentTest.className} · {currentTest.subject}</p></div><div className={"tm-timer" + (remainingSeconds < 300 ? " tm-timer-warning" : "")}><span>TIME LEFT</span><strong>{minutes}:{seconds}</strong></div></div>
        <div className="tm-exam-layout">
          <section className="tm-panel tm-exam-question">
            <div className="tm-question-number">QUESTION {currentQuestion + 1} OF {currentTest.questions.length}<span>{activeQuestion.marks} marks</span></div>
            <h2>{activeQuestion.prompt}</h2>
            <div className="tm-exam-options">{activeQuestion.options.map((option, index) => (
              <button key={index} className={answers[activeQuestion.id] === index ? "tm-exam-option selected" : "tm-exam-option"} onClick={() => saveAnswer(activeQuestion.id, index)}>
                <span>{String.fromCharCode(65 + index)}</span>{option}{answers[activeQuestion.id] === index && <b>✓</b>}
              </button>
            ))}</div>
            <div className="tm-exam-nav"><button className="tm-button tm-button-outline" disabled={currentQuestion === 0} onClick={() => setCurrentQuestion((value) => Math.max(0, value - 1))}>← Previous</button><span>{answeredCount} of {currentTest.questions.length} answered</span><button className="tm-button tm-button-primary" onClick={() => setCurrentQuestion((value) => Math.min(currentTest.questions.length - 1, value + 1))}>{currentQuestion === currentTest.questions.length - 1 ? "Review answers" : "Next question →"}</button></div>
          </section>
          <aside className="tm-panel tm-question-palette"><h3>Question palette</h3><p>Select a number to move to that question.</p><div>{currentTest.questions.map((question, index) => <button key={question.id} className={(currentQuestion === index ? "current " : "") + (answers[question.id] !== undefined ? "answered" : "")} onClick={() => setCurrentQuestion(index)}>{index + 1}</button>)}</div><div className="tm-palette-legend"><span><i className="answered-dot"/>Answered</span><span><i/>Not answered</span></div><button className="tm-button tm-button-primary tm-submit-exam" onClick={() => { if (window.confirm("Submit your test now? You cannot change answers after submission.")) finishAttempt(); }}>Submit test</button></aside>
        </div>
        <p className="tm-storage-note">Answers are autosaved in this browser during the attempt. Do not close this tab until submission is complete.</p>
      </div>
    );
  }

  if (view === "results" && selectedAttempt && currentTest) {
    const score = selectedAttempt.score ?? 0;
    const percentage = selectedAttempt.totalMarks ? Math.round(score / selectedAttempt.totalMarks * 100) : 0;
    return (
      <div className="tm-module">
        <div className="tm-page-head"><button className="tm-back" onClick={() => { setView("list"); setStudentMode(false); }}>← Back to tests</button><div><span className="tm-eyebrow">ASSESSMENT RESULT</span><h1>Test submitted successfully</h1><p>{currentTest.title} · {currentTest.className}</p></div><span className="tm-status tm-status-completed">Submitted</span></div>
        <div className="tm-result-hero"><div className="tm-score-ring"><strong>{percentage}%</strong><span>Score</span></div><div><h2>{score} <small>/ {selectedAttempt.totalMarks} marks</small></h2><p>{currentTest.questions.filter((question) => selectedAttempt.answers[question.id] === question.correctIndex).length} correct · {currentTest.questions.filter((question) => selectedAttempt.answers[question.id] !== undefined && selectedAttempt.answers[question.id] !== question.correctIndex).length} incorrect · {currentTest.questions.filter((question) => selectedAttempt.answers[question.id] === undefined).length} unanswered</p><span>{selectedAttempt.preview ? "Preview attempt — not a published student result" : "Submitted " + formatDate(selectedAttempt.submittedAt || "")}</span></div></div>
        <section className="tm-panel"><div className="tm-panel-title"><div><h2>Answer review</h2><p>Correct answers and your submitted choices.</p></div></div><div className="tm-review-list">{currentTest.questions.map((question, index) => {
          const answer = selectedAttempt.answers[question.id];
          const correct = answer === question.correctIndex;
          return <article key={question.id}><strong>Q{index + 1}. {question.prompt}</strong><span className={correct ? "tm-review-correct" : "tm-review-wrong"}>{answer === undefined ? "Not answered" : "Your answer: " + question.options[answer]}</span><small>Correct answer: {question.options[question.correctIndex]}</small></article>;
        })}</div></section>
        <div className="tm-detail-actions"><button className="tm-button tm-button-primary" onClick={() => { setView("list"); setStudentMode(false); }}>Done</button></div>
      </div>
    );
  }

  const filters: FilterKey[] = ["all", "upcoming", "live", "completed", "draft"];

  return (
    <div className="tm-module">
      <div className="tm-page-head">
        <div><span className="tm-eyebrow">{studentMode ? "STUDENT WORKSPACE" : "ASSESSMENT MANAGEMENT"}</span><h1>{studentMode ? "My Tests & Exams" : "Tests & Exams"}</h1><p>{studentMode ? "Open a live test, continue an attempt or review a scheduled assessment." : "Create question papers, schedule exams and monitor student submissions."}</p></div>
        <div className="tm-head-actions">
          <button className="tm-button tm-button-outline" onClick={() => setStudentMode((value) => !value)}>{studentMode ? "↩ Teacher / Admin" : "◉ Student portal preview"}</button>
          {!studentMode && <button className="tm-button tm-button-primary" onClick={() => beginCreate()}>＋ Create test</button>}
        </div>
      </div>

      {studentMode ? (
        <>
          <div className="tm-student-banner"><div><strong>Student portal preview</strong><p>This preview uses the tests saved in this browser. A real student login and batch assignment will be connected through the backend phase.</p></div><span>STUDENT VIEW</span></div>
          <div className="tm-student-class-filter"><label>My class / batch<select value={studentClass} onChange={(event) => setStudentClass(event.target.value)}><option>Class 9</option><option>Class 10</option><option>Class 11</option><option>Class 12</option><option>JEE Foundation</option><option>NEET Foundation</option></select></label><span>Only tests published for this class are shown.</span></div>
          <div className="tm-section-heading"><div><h2>Available assessments</h2><p>Only published tests are shown here.</p></div></div>
          {studentTests.length === 0 ? <div className="tm-empty-state"><div>▤</div><h3>No tests assigned yet</h3><p>When your teacher publishes a test, it will appear here.</p></div> : (
            <div className="tm-test-grid">{studentTests.map((test) => {
              const status = statusFor(test);
              const unfinished = attempts.find((attempt) => attempt.testId === test.id && !attempt.submittedAt);
              return <article className="tm-test-card" key={test.id}><div className="tm-test-card-top"><span className="tm-card-icon">▤</span><span className={"tm-status tm-status-" + status}>{statusLabel(status)}</span></div><h3>{test.title}</h3><p>{test.className} · {test.subject}</p><div className="tm-card-meta"><span>◷ {test.durationMinutes} min</span><span>▦ {test.questions.length} questions</span><span>◎ {totalMarks(test)} marks</span></div><div className="tm-card-footer"><span>{formatDate(test.startAt)}</span>{unfinished ? <button onClick={() => startExam(test, false, unfinished)}>Resume test →</button> : status === "live" ? <button onClick={() => startExam(test)}>Start test →</button> : <span className="tm-muted-action">{status === "upcoming" ? "Not started yet" : status === "completed" ? "Exam closed" : "Unavailable"}</span>}</div></article>;
            })}</div>
          )}
          <div className="tm-section-heading"><div><h2>My submissions</h2><p>Submitted tests and saved progress in this browser.</p></div></div>
          <div className="tm-panel tm-table-panel"><div className="tm-table-wrap"><table className="tm-table"><thead><tr><th>TEST</th><th>STARTED</th><th>STATUS</th><th>RESULT</th></tr></thead><tbody>{attempts.map((attempt) => {
            const test = tests.find((item) => item.id === attempt.testId);
            if (!test) return null;
            return <tr key={attempt.id}><td><strong>{test.title}</strong><small>{test.subject}</small></td><td>{formatDate(attempt.startedAt)}</td><td><span className={"tm-status tm-status-" + (attempt.submittedAt ? "completed" : "live")}>{attempt.submittedAt ? "Submitted" : "In progress"}</span></td><td>{attempt.submittedAt ? <button className="tm-table-action" onClick={() => { setSelectedTestId(test.id); setSelectedAttemptId(attempt.id); setView("results"); }}>View result</button> : <button className="tm-table-action" onClick={() => startExam(test, attempt.preview, attempt)}>Resume</button>}</td></tr>;
          })}{attempts.length === 0 && <tr><td colSpan={4} className="tm-table-empty">No attempts yet.</td></tr>}</tbody></table></div></div>
        </>
      ) : (
        <>
          <div className="tm-stats">
            <article><span className="tm-stat-icon purple">▤</span><div><strong>{counts.all}</strong><small>Total tests</small></div></article>
            <article><span className="tm-stat-icon blue">◷</span><div><strong>{counts.upcoming}</strong><small>Upcoming</small></div></article>
            <article><span className="tm-stat-icon green">●</span><div><strong>{counts.live}</strong><small>Live now</small></div></article>
            <article><span className="tm-stat-icon orange">✓</span><div><strong>{counts.completed}</strong><small>Completed</small></div></article>
          </div>
          <div className="tm-toolbar"><div className="tm-tabs">{filters.map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{statusLabel(key)}<span>{counts[key]}</span></button>)}</div><button className="tm-paper-link" onClick={onOpenPaperBuilder}>Open Paper Builder ↗</button></div>
          {visibleTests.length === 0 ? <div className="tm-empty-state"><div>▤</div><h3>{searchQuery ? "No matching tests found" : filter === "all" ? "No tests created yet" : "No " + statusLabel(filter).toLowerCase() + " tests"}</h3><p>{searchQuery ? "Try another test name, subject or class." : "Create a test, add questions and publish it to see it in this list."}</p>{filter === "all" && <button className="tm-button tm-button-primary" onClick={() => beginCreate()}>＋ Create your first test</button>}</div> : (
            <div className="tm-panel tm-table-panel"><div className="tm-table-wrap"><table className="tm-table"><thead><tr><th>TEST NAME</th><th>CLASS / BATCH</th><th>DATE & TIME</th><th>QUESTIONS</th><th>STATUS</th><th>ATTEMPTS</th><th></th></tr></thead><tbody>{visibleTests.map((test) => {
              const status = statusFor(test);
              const attemptCount = attempts.filter((attempt) => attempt.testId === test.id && attempt.submittedAt).length;
              return <tr key={test.id}><td><strong>{test.title}</strong><small>{test.subject} · {totalMarks(test)} marks · {test.durationMinutes} min</small></td><td>{test.className}</td><td>{formatDate(test.startAt)}</td><td>{test.questions.length}</td><td><span className={"tm-status tm-status-" + status}>{statusLabel(status)}</span></td><td>{attemptCount}</td><td><button className="tm-table-action" onClick={() => openDetails(test)}>Manage →</button></td></tr>;
            })}</tbody></table></div><div className="tm-table-foot">Showing {visibleTests.length} of {tests.length} saved tests <span>Autosaved in this browser</span></div></div>
          )}
          <div className="tm-feature-note"><span>ⓘ</span><p><strong>Current functionality:</strong> create MCQ tests, save drafts, schedule or launch tests, run a timed student preview, autosave answers and calculate results. Data is browser-local until the API and database are connected.</p></div>
        </>
      )}
      <div className="tm-bottom-link"><button onClick={onBack}>← Return to institute dashboard</button></div>
    </div>
  );
}
