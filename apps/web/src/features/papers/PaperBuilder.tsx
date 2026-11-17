import { useEffect, useMemo, useState } from "react";
import {
  DEMO_PAPER_EVENT,
  getDemoAttempts,
  getDemoPapers,
  gradeDemoWrittenAttempt,
  saveDemoPaper,
  setDemoPaperPublished,
  type DemoAttempt,
  type DemoPaper,
  type ObjectiveQuestion,
  type PaperType,
  type WrittenQuestion,
} from "./demo-paper-store";
import { DEMO_OBJECTIVE_QUESTIONS_TEXT, DEMO_WRITTEN_QUESTIONS_TEXT } from "./demo-question-bank";
import "./paper-builder.css";
import "./demo-paper.css";

type ParsedPaper = {
  questions?: ObjectiveQuestion[];
  writtenQuestions?: WrittenQuestion[];
  totalMarks: number;
};

type ObjectiveDraft = {
  prompt: string;
  options: Map<number, string>;
  correctIndex: number | null;
};

type WrittenDraft = {
  prompt: string;
  marks: number | null;
  containsOptions: boolean;
};

const QUESTION_PATTERN = /^(?:Q(?:uestion)?\\s*)?(\\d+)\\s*[.):\\-]\\s*(.+)$/i;
const OPTION_PATTERN = /^([A-D])\\s*[).:\\-]\\s*(.+)$/i;
const ANSWER_PATTERN = /^(?:answer|ans|correct\\s*option|उत्तर)\\s*[:=\\-]\\s*([A-D])\\s*$/i;
const MARKS_PATTERN = /^(?:marks?|अंक)\\s*[:=\\-]\\s*(\\d+)\\s*$/i;

function makeId(): string {
  return "paper_" + (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36));
}

function localDateTime(hoursFromNow = 1): string {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return localDateTime();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function parseObjective(raw: string): ObjectiveQuestion[] {
  const drafts: ObjectiveDraft[] = [];
  let current: ObjectiveDraft | null = null;

  const pushCurrent = () => {
    if (current && (current.options.size > 0 || current.correctIndex !== null)) drafts.push(current);
  };

  raw.split(/\\r?\\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const questionMatch = line.match(QUESTION_PATTERN);
    const optionMatch = line.match(OPTION_PATTERN);
    const answerMatch = line.match(ANSWER_PATTERN);

    if (questionMatch) {
      pushCurrent();
      current = { prompt: questionMatch[2].trim(), options: new Map(), correctIndex: null };
    } else if (optionMatch) {
      if (!current) throw new Error("An option was found before the first numbered question.");
      current.options.set(optionMatch[1].toUpperCase().charCodeAt(0) - 65, optionMatch[2].trim());
    } else if (answerMatch) {
      if (!current) throw new Error("An answer key was found before the first numbered question.");
      current.correctIndex = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
    } else if (current && current.options.size === 0) {
      current.prompt += " " + line;
    }
  });
  pushCurrent();

  if (drafts.length !== 50) {
    throw new Error("Objective Exam needs exactly 50 objective questions. Found " + drafts.length + ". Check that you pasted all 50 MCQs.");
  }

  return drafts.map((draft, index) => {
    if (!draft.prompt.trim()) throw new Error("Question " + (index + 1) + " has no question text.");
    if (draft.options.size !== 4 || [0, 1, 2, 3].some((key) => !draft.options.get(key))) {
      throw new Error("Question " + (index + 1) + " must include A), B), C) and D) options.");
    }
    if (draft.correctIndex === null) throw new Error("Question " + (index + 1) + " needs an Answer: A/B/C/D line.");
    return {
      id: "obj_" + String(index + 1).padStart(2, "0"),
      prompt: draft.prompt.trim(),
      options: [0, 1, 2, 3].map((key) => draft.options.get(key) || ""),
      correctIndex: draft.correctIndex,
      marks: 2 as const,
    };
  });
}

function parseWritten(raw: string): WrittenQuestion[] {
  const drafts: WrittenDraft[] = [];
  let current: WrittenDraft | null = null;

  const pushCurrent = () => {
    if (current) drafts.push(current);
  };

  raw.split(/\\r?\\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const questionMatch = line.match(QUESTION_PATTERN);
    const optionMatch = line.match(OPTION_PATTERN);
    const answerMatch = line.match(ANSWER_PATTERN);
    const marksMatch = line.match(MARKS_PATTERN);

    if (questionMatch) {
      pushCurrent();
      current = { prompt: questionMatch[2].trim(), marks: null, containsOptions: false };
    } else if (optionMatch || answerMatch) {
      if (current) current.containsOptions = true;
    } else if (marksMatch) {
      if (!current) throw new Error("A Marks line was found before the first numbered written question.");
      current.marks = Number(marksMatch[1]);
    } else if (current && !current.containsOptions) {
      current.prompt += " " + line;
    }
  });
  pushCurrent();

  // Ignore MCQ blocks when the same pasted text contains both Objective and Written sections.
  const writtenDrafts = drafts.filter((draft) => !draft.containsOptions);
  if (writtenDrafts.length === 0) throw new Error("No written questions found. Add numbered questions with Marks: 2, 4 or 6 lines.");

  let totalMarks = 0;
  const questions = writtenDrafts.map((draft, index) => {
    if (!draft.prompt.trim()) throw new Error("Written question " + (index + 1) + " has no question text.");
    if (draft.marks !== 2 && draft.marks !== 4 && draft.marks !== 6) {
      throw new Error("Written question " + (index + 1) + " must have Marks: 2, Marks: 4 or Marks: 6.");
    }
    totalMarks += draft.marks;
    return {
      id: "wrt_" + String(index + 1).padStart(2, "0"),
      prompt: draft.prompt.trim(),
      marks: draft.marks as 2 | 4 | 6,
    };
  });

  if (totalMarks !== 100) throw new Error("Written Exam must total exactly 100 marks. Current total: " + totalMarks + ".");
  return questions;
}

function parsePaper(paperType: PaperType, raw: string): ParsedPaper {
  if (!raw.trim()) throw new Error("Paste the question paper text first.");
  if (paperType === "objective") {
    const questions = parseObjective(raw);
    return { questions, totalMarks: questions.reduce((sum, question) => sum + question.marks, 0) };
  }
  const writtenQuestions = parseWritten(raw);
  return { writtenQuestions, totalMarks: writtenQuestions.reduce((sum, question) => sum + question.marks, 0) };
}

function serializePaper(paper: DemoPaper): string {
  if (paper.paperType === "objective") {
    return (paper.questions || []).map((question, index) => [
      (index + 1) + ". " + question.prompt,
      ...question.options.map((option, optionIndex) => String.fromCharCode(65 + optionIndex) + ") " + option),
      "Answer: " + String.fromCharCode(65 + question.correctIndex),
    ].join("\\n")).join("\\n\\n");
  }
  return (paper.writtenQuestions || []).map((question, index) =>
    (index + 1) + ". " + question.prompt + "\\nMarks: " + question.marks
  ).join("\\n\\n");
}

function WrittenAttemptCard({ attempt, onUpdated }: { attempt: DemoAttempt; onUpdated: () => void }) {
  const questions = attempt.paper.writtenQuestions || [];
  const [marks, setMarks] = useState<number[]>(
    attempt.marksByQuestion || questions.map(() => 0)
  );
  const [error, setError] = useState("");

  function saveMarks() {
    try {
      gradeDemoWrittenAttempt(attempt.attemptId, marks);
      setError("");
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save marks.");
    }
  }

  return (
    <article className="demo-attempt-card">
      <div className="demo-attempt-heading">
        <div><strong>{attempt.studentName}</strong><span>Roll {attempt.rollNumber} · {attempt.paper.title}</span></div>
        <span className={attempt.status === "graded" ? "demo-attempt-status is-done" : "demo-attempt-status"}>{attempt.status === "graded" ? "Graded" : "Awaiting marking"}</span>
      </div>
      <div className="demo-answer-list">
        {questions.map((question, index) => (
          <div className="demo-answer-row" key={question.id}>
            <div><strong>Q{index + 1}. {question.prompt}</strong><p>{String(attempt.answers[String(index)] || "No answer submitted")}</p></div>
            <label>Marks / {question.marks}
              <input
                type="number"
                min="0"
                max={question.marks}
                step="1"
                value={marks[index] ?? 0}
                disabled={attempt.status === "graded"}
                onChange={(event) => setMarks((current) => current.map((value, markIndex) => markIndex === index ? Number(event.target.value) : value))}
              />
            </label>
          </div>
        ))}
      </div>
      {attempt.status === "graded" ? (
        <p className="demo-attempt-score">Published result: {attempt.score}/100 marks</p>
      ) : (
        <button className="generate-button" type="button" onClick={saveMarks}>Save marks & publish result</button>
      )}
      {error && <p className="builder-message warning">{error}</p>}
    </article>
  );
}

export default function PaperBuilder({ onBack }: { onBack: () => void }) {
  const [paperType, setPaperType] = useState<PaperType>("objective");
  const [title, setTitle] = useState("Computer Basics Practice Test");
  const [subject, setSubject] = useState("Computer");
  const [className, setClassName] = useState("Practice Batch");
  const [duration, setDuration] = useState(60);
  const [startAtInput, setStartAtInput] = useState(localDateTime());
  const [instructions, setInstructions] = useState("Read all questions carefully. Select or write your answers before submitting.");
  const [objectiveRawText, setObjectiveRawText] = useState(DEMO_OBJECTIVE_QUESTIONS_TEXT);
  const [writtenRawText, setWrittenRawText] = useState(DEMO_WRITTEN_QUESTIONS_TEXT);
  const rawText = paperType === "objective" ? objectiveRawText : writtenRawText;
  const setRawText = (value: string) => {
    if (paperType === "objective") setObjectiveRawText(value);
    else setWrittenRawText(value);
  };
  const [parsed, setParsed] = useState<ParsedPaper | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedPapers, setSavedPapers] = useState<DemoPaper[]>([]);
  const [attempts, setAttempts] = useState<DemoAttempt[]>([]);

  const questionsCount = parsed?.questions?.length ?? parsed?.writtenQuestions?.length ?? 0;
  const previewQuestions = useMemo(
    () => paperType === "objective" ? parsed?.questions || [] : parsed?.writtenQuestions || [],
    [paperType, parsed]
  );

  function refreshStoredData() {
    setSavedPapers(getDemoPapers());
    setAttempts(getDemoAttempts());
  }

  useEffect(() => {
    refreshStoredData();
    window.addEventListener(DEMO_PAPER_EVENT, refreshStoredData);
    window.addEventListener("storage", refreshStoredData);
    return () => {
      window.removeEventListener(DEMO_PAPER_EVENT, refreshStoredData);
      window.removeEventListener("storage", refreshStoredData);
    };
  }, []);

  function resetParsed() {
    setParsed(null);
    setMessage("");
    setShowAnswers(false);
  }

  function loadPaper(paper: DemoPaper) {
    setEditingId(paper.id);
    setPaperType(paper.paperType);
    setTitle(paper.title);
    setSubject(paper.subject);
    setClassName(paper.className);
    setDuration(paper.durationMinutes);
    setStartAtInput(toLocalDateTime(paper.startAt));
    setInstructions(paper.instructions || "");
    if (paper.paperType === "objective") setObjectiveRawText(serializePaper(paper));
    else setWrittenRawText(serializePaper(paper));
    setParsed(parsePaper(paper.paperType, serializePaper(paper)));
    setShowAnswers(false);
    setMessage("Loaded saved paper " + paper.title + " for editing.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateDetails(): string | null {
    if (!title.trim()) return "Enter a paper title.";
    if (!subject.trim()) return "Enter a subject.";
    if (!className.trim()) return "Enter a class or batch.";
    if (!Number.isInteger(duration) || duration < 5 || duration > 300) return "Duration must be between 5 and 300 minutes.";
    if (!startAtInput || Number.isNaN(new Date(startAtInput).getTime())) return "Choose a valid exam date and time.";
    return null;
  }

  function previewPaper() {
    const detailError = validateDetails();
    if (detailError) {
      setMessage(detailError);
      setParsed(null);
      return;
    }
    try {
      const result = parsePaper(paperType, rawText);
      setParsed(result);
      setShowAnswers(false);
      setMessage(
        paperType === "objective"
          ? "Preview ready: 50 Objective questions · 100 marks. All four options and answer keys are valid."
          : "Preview ready: " + result.writtenQuestions?.length + " Written questions · 100 marks."
      );
    } catch (cause) {
      setParsed(null);
      setMessage(cause instanceof Error ? cause.message : "Could not parse the question paper.");
    }
  }

  function persistPaper(publish: boolean) {
    const detailError = validateDetails();
    if (detailError) {
      setMessage(detailError);
      return;
    }
    let result: ParsedPaper;
    try {
      result = parsePaper(paperType, rawText);
    } catch (cause) {
      setParsed(null);
      setMessage(cause instanceof Error ? cause.message : "Paper validation failed.");
      return;
    }
    const previous = editingId ? savedPapers.find((paper) => paper.id === editingId) : null;
    const saved = saveDemoPaper({
      id: editingId || makeId(),
      paperType,
      title: title.trim(),
      subject: subject.trim(),
      className: className.trim(),
      startAt: new Date(startAtInput).toISOString(),
      durationMinutes: duration,
      instructions: instructions.trim(),
      ...(result.questions ? { questions: result.questions } : {}),
      ...(result.writtenQuestions ? { writtenQuestions: result.writtenQuestions } : {}),
      published: publish,
      createdAt: previous?.createdAt,
      publishedAt: publish ? new Date().toISOString() : previous?.publishedAt,
    });
    setEditingId(saved.id);
    setParsed(result);
    setShowAnswers(false);
    setMessage(publish
      ? saved.title + " published in the local Paper demo. No external exam API was called."
      : saved.title + " saved as a draft in this browser.");
    refreshStoredData();
  }

  function togglePublished(paper: DemoPaper) {
    const updated = setDemoPaperPublished(paper.id, !paper.published);
    if (updated) {
      setMessage(updated.published ? updated.title + " published." : updated.title + " unpublished.");
      refreshStoredData();
    }
  }

  const activeAttempts = attempts.filter((attempt) => attempt.status === "evaluated" || attempt.status === "awaiting_marking" || attempt.status === "graded");

  return (
    <div className="paper-builder">
      <div className="builder-toolbar">
        <button className="back-link" onClick={onBack}>← Dashboard</button>
        <div className="builder-actions">
          <span className="draft-tag">DEMO PAPER WORKSPACE</span>
          <button className="secondary-button" type="button" disabled={!parsed} onClick={() => setShowAnswers((value) => !value)}>
            {showAnswers ? "Hide answer key" : "View answer key"}
          </button>
          <button className="print-button" type="button" disabled={!parsed} onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      <div className="builder-title">
        <div><div className="eyebrow">ASSESSMENT WORKFLOW / DEMO MODE</div><h1>Paper Management</h1><p>Create, preview, save and publish papers directly in this Coaching app.</p></div>
        <div className="step-chip"><span>1</span> Details <i>—</i><span>2</span> Questions <i>—</i><span>3</span> Publish</div>
      </div>

      <div className="demo-mode-banner">
        <strong>Local dummy-data mode · Paper API disabled</strong>
        Paper creation, preview, answer keys, draft saving and publishing use sample questions and this browser's local storage only. This screen makes no API requests. Data is not shared across browsers or devices.
      </div>

      <div className="builder-layout">
        <section className="builder-main">
          <div className="builder-card">
            <div className="card-heading">
              <div><h2>Paper details</h2><p>Choose the exam type and set the schedule.</p></div><span className="section-number">01</span>
            </div>
            <div className="mode-switch">
              <button type="button" className={paperType === "objective" ? "mode-option selected" : "mode-option"} onClick={() => { setPaperType("objective"); setEditingId(null); resetParsed(); }}>
                Objective Exam · 50 × 2
              </button>
              <button type="button" className={paperType === "written" ? "mode-option selected" : "mode-option"} onClick={() => { setPaperType("written"); setEditingId(null); resetParsed(); }}>
                Written Exam · 100 marks
              </button>
            </div>
            <div className="form-grid">
              <label className="field field-wide">Paper title<input value={title} onChange={(event) => { setTitle(event.target.value); resetParsed(); }} placeholder="e.g. Computer Basics Practice Test" /></label>
              <label className="field">Subject<input value={subject} onChange={(event) => { setSubject(event.target.value); resetParsed(); }} placeholder="e.g. Computer" /></label>
              <label className="field">Class / Batch<input value={className} onChange={(event) => { setClassName(event.target.value); resetParsed(); }} placeholder="e.g. Practice Batch" /></label>
              <label className="field">Exam date & time<input type="datetime-local" value={startAtInput} onChange={(event) => { setStartAtInput(event.target.value); resetParsed(); }} /></label>
              <label className="field">Duration (minutes)<input type="number" min="5" max="300" value={duration} onChange={(event) => { setDuration(Number(event.target.value)); resetParsed(); }} /></label>
              <label className="field field-wide">Student instructions<textarea rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
            </div>
          </div>

          <div className="builder-card">
            <div className="card-heading"><div><h2>Paste question paper text</h2><p>Paste the questions here. The parser separates Objective and Written questions even when both sections are present in the same text.</p></div><span className="section-number">02</span></div>
            <div className="demo-format-hint">
              {paperType === "objective"
                ? "Objective format: 1. Question text, A) Option, B) Option, C) Option, D) Option, Answer: B. Exactly 50 MCQs are required."
                : "Written format: 1. Question text, Marks: 2 / 4 / 6. Objective MCQ blocks in the same pasted text are ignored. Written total must equal 100 marks."}
            </div>
            <textarea
              className="demo-question-input"
              rows={18}
              value={rawText}
              onChange={(event) => { setRawText(event.target.value); resetParsed(); }}
              placeholder={paperType === "objective"
                ? "1. What does CPU stand for?\nA) Central Processing Unit\nB) Computer Personal Unit\nC) Central Program Utility\nD) Control Processing User\nAnswer: A\n\n... continue until question 50"
                : "1. Explain the function of an operating system.\nMarks: 6\n\n2. Define RAM.\nMarks: 2\n\n... continue until total marks are 100"}
              spellCheck={false}
            />
            <div className="demo-builder-actions">
              <button className="secondary-button" type="button" onClick={() => { setRawText(paperType === "objective" ? DEMO_OBJECTIVE_QUESTIONS_TEXT : DEMO_WRITTEN_QUESTIONS_TEXT); setEditingId(null); resetParsed(); setMessage("Sample questions loaded. Preview to validate the paper."); }}>Load sample questions</button>
              <button className="secondary-button" type="button" onClick={previewPaper}>Preview parsed paper</button>
              <button className="secondary-button" type="button" onClick={() => persistPaper(false)}>Save Draft</button>
              <button className="generate-button" type="button" onClick={() => persistPaper(true)}>Publish {paperType === "objective" ? "Objective" : "Written"} Exam</button>
              {editingId && <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setRawText(paperType === "objective" ? DEMO_OBJECTIVE_QUESTIONS_TEXT : DEMO_WRITTEN_QUESTIONS_TEXT); setParsed(null); setMessage("Ready for a new paper. Sample questions are loaded."); }}>New paper</button>}
            </div>
            {message && <div className={parsed ? "builder-message success" : "builder-message warning"} role="status">{message}</div>}
          </div>
        </section>

        <aside className="builder-side">
          <div className="summary-card">
            <div className="summary-heading"><span>▤</span><strong>Paper validation</strong></div>
            <div className="summary-line"><span>Exam type</span><strong>{paperType === "objective" ? "Objective" : "Written"}</strong></div>
            <div className="summary-line"><span>Required questions</span><strong>{paperType === "objective" ? "50" : "Variable"}</strong></div>
            <div className="summary-line"><span>Parsed questions</span><strong>{parsed ? questionsCount : "—"}</strong></div>
            <div className="summary-total"><span>Total marks</span><strong>{parsed ? parsed.totalMarks : "100"}</strong></div>
            <p>{paperType === "objective" ? "Every objective question carries 2 marks and needs four options plus a correct answer." : "Each written question must carry 2, 4 or 6 marks. The final total must be 100."}</p>
          </div>
          <div className="workflow-tip">
            <span>ⓘ</span><div><strong>Demo publishing</strong><p>Publish makes the current paper appear in Student Exams in this same browser. Unpublish hides it without deleting saved attempts.</p></div>
          </div>
        </aside>
      </div>

      <section className="paper-preview-section">
        <div className="preview-heading"><div><div className="eyebrow">PRINT LAYOUT</div><h2>Paper preview</h2><p>Teacher preview. The answer key is only shown when you select View answer key.</p></div><span className="preview-badge">A4 PREVIEW</span></div>
        <div className="print-paper">
          <div className="paper-brand"><div className="paper-logo">C</div><div><strong>COACHING PRO</strong><span>INSTITUTE PRACTICE PAPER</span></div></div>
          <div className="paper-title"><h2>{title || "Untitled Test"}</h2><p>{className} · {subject} · {paperType === "objective" ? "Objective Exam" : "Written Exam"}</p></div>
          <div className="paper-meta"><span>Time: {duration} minutes</span><span>Maximum marks: {parsed?.totalMarks ?? 100}</span><span>Questions: {parsed ? questionsCount : "—"}</span></div>
          <div className="student-lines"><span>Student name: __________________________</span><span>Roll no.: ______________</span></div>
          <div className="paper-instructions"><strong>General instructions</strong><p>{instructions || "Read all questions carefully."}</p></div>
          {!parsed ? (
            <div className="paper-empty">Paste the question text and select Preview parsed paper. Validated questions will appear here.</div>
          ) : paperType === "objective" ? (
            <div className="paper-questions">
              {(parsed.questions || []).map((question, index) => (
                <article key={question.id} className="paper-question">
                  <div className="paper-question-title"><strong>{index + 1}. {question.prompt}</strong><span>({question.marks} marks)</span></div>
                  <div className="paper-options">{question.options.map((option, optionIndex) => <span key={optionIndex}>{String.fromCharCode(65 + optionIndex)}. {option}</span>)}</div>
                  {showAnswers && <div className="answer-key">Answer: {String.fromCharCode(65 + question.correctIndex)}</div>}
                </article>
              ))}
            </div>
          ) : (
            <div className="paper-questions">
              {(parsed.writtenQuestions || []).map((question, index) => (
                <article key={question.id} className="paper-question">
                  <div className="paper-question-title"><strong>{index + 1}. {question.prompt}</strong><span>({question.marks} marks)</span></div>
                  {showAnswers && <div className="answer-key">Teacher marking guide: evaluate the written response against the question and award 0–{question.marks} marks.</div>}
                </article>
              ))}
            </div>
          )}
          <div className="paper-end">— End of question paper —</div>
        </div>
      </section>

      <section className="demo-saved-section">
        <div className="section-heading"><div><h2>Saved papers</h2><p>Draft and published papers stored in this browser.</p></div><span className="preview-badge">{savedPapers.length} PAPERS</span></div>
        {savedPapers.length === 0 ? <div className="demo-empty-card">No saved papers yet. Create your first Objective or Written paper above.</div> : (
          <div className="demo-saved-grid">
            {savedPapers.map((paper) => (
              <article className="demo-saved-card" key={paper.id}>
                <div className="demo-saved-top"><span>{paper.paperType === "objective" ? "OBJECTIVE" : "WRITTEN"}</span><b className={paper.published ? "is-published" : ""}>{paper.published ? "Published" : "Draft / Off"}</b></div>
                <h3>{paper.title}</h3>
                <p>{paper.subject} · {paper.className} · {paper.durationMinutes} min</p>
                <small>Scheduled: {new Date(paper.startAt).toLocaleString()}</small>
                <div className="demo-saved-actions">
                  <button type="button" className="secondary-button" onClick={() => loadPaper(paper)}>Edit / Load</button>
                  <button type="button" className="secondary-button" onClick={() => togglePublished(paper)}>{paper.published ? "Unpublish" : "Publish"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="demo-saved-section">
        <div className="section-heading"><div><h2>Student submissions & results</h2><p>Objective results are automatic. Written answers need teacher marking.</p></div><span className="preview-badge">{activeAttempts.length} SUBMISSIONS</span></div>
        {activeAttempts.length === 0 ? <div className="demo-empty-card">Student submissions will appear here after a demo exam is submitted.</div> : (
          <div className="demo-submissions-list">
            {activeAttempts.map((attempt) => attempt.paper.paperType === "written" && attempt.status === "awaiting_marking" ? (
              <WrittenAttemptCard key={attempt.attemptId} attempt={attempt} onUpdated={refreshStoredData} />
            ) : (
              <article className="demo-attempt-card" key={attempt.attemptId}>
                <div className="demo-attempt-heading">
                  <div><strong>{attempt.studentName}</strong><span>Roll {attempt.rollNumber} · {attempt.paper.title}</span></div>
                  <span className="demo-attempt-status is-done">{attempt.status === "graded" ? "Graded" : "Auto evaluated"}</span>
                </div>
                <p className="demo-attempt-score">
                  {attempt.score ?? "—"}/{attempt.totalMarks} marks
                  {attempt.paper.paperType === "objective" ? " · " + (attempt.correctCount ?? 0) + " correct · " + (attempt.incorrectCount ?? 0) + " incorrect · " + (attempt.unansweredCount ?? 0) + " unanswered" : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="prototype-disclaimer">Demo limitation: browser-local storage is not shared with another phone, computer or browser profile and can be cleared by the user. This is for same-browser workflow testing, not production student data.</p>
    </div>
  );
}
