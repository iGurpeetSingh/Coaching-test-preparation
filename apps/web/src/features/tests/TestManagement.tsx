import { useEffect, useMemo, useState } from "react";
import "./test-management.css";

type ExamQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  marks: number;
};

type WrittenQuestion = {
  id: string;
  prompt: string;
  marks: number;
  answerGuide?: string;
};

type PaperType = "objective" | "written";

type ParsedPaper = {
  title: string;
  subject: string;
  className: string;
  startAt: string;
  objectiveDuration: number;
  writtenDuration: number;
  objective: ExamQuestion[];
  written: WrittenQuestion[];
  warnings: string[];
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
  paperType?: PaperType;
  examGroupId?: string;
  writtenQuestions?: WrittenQuestion[];
  isPublished: boolean;
  createdAt: string;
};

type ExamAttempt = {
  id: string;
  testId: string;
  startedAt: string;
  answers: Record<string, number>;
  writtenAnswers?: Record<string, string>;
  manualMarks?: Record<string, number>;
  studentName?: string;
  rollNumber?: string;
  submittedAt?: string;
  gradedAt?: string;
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
  if (test.paperType === "written") {
    return (test.writtenQuestions || []).reduce((sum, question) => sum + question.marks, 0);
  }
  return test.questions.reduce((sum, question) => sum + question.marks, 0);
}

function questionCount(test: ExamTest): number {
  return test.paperType === "written" ? (test.writtenQuestions || []).length : test.questions.length;
}

function parseExamDate(value: string): Date | null {
  const trimmed = value.trim();
  const numeric = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(trimmed);
  if (numeric) {
    const date = new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePastedPaper(raw: string): ParsedPaper {
  const header = (label: string) => new RegExp("^\\s*" + label + "\\s*[:=-]\\s*(.+)$", "im").exec(raw)?.[1]?.trim() || "";
  const title = header("(?:Exam|(?:Exam\\s*)?(?:Title|Name|Paper))");
  const subject = header("Subject");
  const className = header("(?:Class|Batch)");
  const dateText = header("(?:Exam\\s*)?Date");
  const timeText = header("(?:Exam\\s*)?Time");
  const date = dateText ? parseExamDate(dateText) : new Date(Date.now() + 60 * 60 * 1000);
  const timeMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(timeText);
  if (date && timeMatch) {
    const suffix = timeMatch[3]?.toUpperCase();
    let hours = Number(timeMatch[1]);
    if (suffix) {
      hours %= 12;
      if (suffix === "PM") hours += 12;
    }
    date.setHours(hours, Number(timeMatch[2]), 0, 0);
  }
  const startAt = date ? localDateTimeValue(date) : defaultStartTime();

  const objectiveMarker = /(?:\[OBJECTIVE\]|\[MCQ\]|OBJECTIVE(?: QUESTIONS)?|MCQ(?: QUESTIONS)?|SECTION\s*A)/i;
  const writtenMarker = /(?:\[WRITTEN\]|\[SUBJECTIVE\]|WRITTEN(?: QUESTIONS)?|SUBJECTIVE(?: QUESTIONS)?|DESCRIPTIVE(?: QUESTIONS)?|SECTION\s*B)/i;
  const lines = raw.split(/\r?\n/);
  const markerIndexA = lines.findIndex((line) => objectiveMarker.test(line.trim()));
  const markerIndexB = lines.findIndex((line) => writtenMarker.test(line.trim()));
  let objectiveLines: string[] = [];
  let writtenLines: string[] = [];
  if (markerIndexA >= 0 || markerIndexB >= 0) {
    const ordered = [
      ...(markerIndexA >= 0 ? [{ type: "objective" as const, index: markerIndexA }] : []),
      ...(markerIndexB >= 0 ? [{ type: "written" as const, index: markerIndexB }] : [])
    ].sort((a, b) => a.index - b.index);
    ordered.forEach((section, index) => {
      const end = ordered[index + 1]?.index ?? lines.length;
      const block = lines.slice(section.index + 1, end);
      if (section.type === "objective") objectiveLines = block;
      else writtenLines = block;
    });
  } else {
    objectiveLines = lines;
  }

  const questionStart = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[.)-]\s*(.+)$/i;
  const optionStart = /^\s*([A-D])[).:-]\s*(.+)$/i;
  const answerStart = /^\s*(?:Answer|Ans|Correct(?:\s*Answer)?)\s*[:=-]\s*([A-D])\b/i;
  const objectiveDrafts: Array<{ number: number; prompt: string; options: string[]; answer: number }> = [];
  const answerKey = new Map<number, number>();
  let current: { number: number; prompt: string; options: string[]; answer: number } | null = null;
  let answerKeyMode = false;
  for (const line of objectiveLines) {
    const clean = line.trim();
    if (!clean) continue;
    if (/^answer\s*key\s*[:=-]?/i.test(clean)) { answerKeyMode = true; const inlineKey = clean.replace(/^answer\s*key\s*[:=-]?/i, ""); for (const match of inlineKey.matchAll(/(\d{1,3})\s*[-:.)]\s*([A-D])/gi)) answerKey.set(Number(match[1]), match[2].toUpperCase().charCodeAt(0) - 65); continue; }
    if (answerKeyMode) {
      for (const match of clean.matchAll(/(\d{1,3})\s*[-:.)]\s*([A-D])/gi)) answerKey.set(Number(match[1]), match[2].toUpperCase().charCodeAt(0) - 65);
      continue;
    }
    const questionMatch = questionStart.exec(clean);
    if (questionMatch) {
      if (current) objectiveDrafts.push(current);
      current = { number: Number(questionMatch[1]), prompt: questionMatch[2].trim(), options: [], answer: -1 };
      continue;
    }
    const optionMatch = optionStart.exec(clean);
    if (optionMatch && current) {
      const letterIndex = optionMatch[1].toUpperCase().charCodeAt(0) - 65;
      current.options[letterIndex] = optionMatch[2].trim();
      continue;
    }
    const answerMatch = answerStart.exec(clean);
    if (answerMatch && current) {
      current.answer = answerMatch[1].toUpperCase().charCodeAt(0) - 65;
      continue;
    }
    if (current && current.options.length === 0) current.prompt += " " + clean;
  }
  if (current) objectiveDrafts.push(current);
  const objective = objectiveDrafts.map((question) => ({
    id: makeId("mcq"),
    prompt: question.prompt,
    options: [0, 1, 2, 3].map((index) => question.options[index] || ""),
    correctIndex: question.answer >= 0 ? question.answer : (answerKey.get(question.number) ?? -1),
    marks: 2
  }));

  const written: WrittenQuestion[] = [];
  let writtenCurrent: WrittenQuestion | null = null;
  for (const line of writtenLines) {
    const clean = line.trim();
    if (!clean) continue;
    const match = /^\s*(?:Q(?:uestion)?\s*)?(\d{1,3})[.)-]\s*(.+)$/i.exec(clean);
    if (match) {
      if (writtenCurrent) written.push(writtenCurrent);
      const marksMatch = /(?:\(|\[)\s*(2|4|6)\s*(?:marks?|m)?\s*(?:\)|\])/i.exec(match[2]) || /\s[-–]\s*(2|4|6)\s*marks?\s*$/i.exec(match[2]);
      const marks = marksMatch ? Number(marksMatch[1]) : 0;
      const prompt = match[2].replace(/(?:\(|\[)\s*(2|4|6)\s*(?:marks?|m)?\s*(?:\)|\])/i, "").replace(/\s[-–]\s*(2|4|6)\s*marks?\s*$/i, "").trim();
      writtenCurrent = { id: makeId("written"), prompt, marks };
    } else if (writtenCurrent) {
      writtenCurrent.prompt += " " + clean;
    }
  }
  if (writtenCurrent) written.push(writtenCurrent);

  const warnings: string[] = [];
  if (!dateText) warnings.push("Exam Date header not found; default date is one hour from now.");
  else if (!date) warnings.push("Exam Date could not be read. Use DD-MM-YYYY.");
  if (!timeText) warnings.push("Exam Time header not found; default time is used.");
  if (!subject) warnings.push("Subject header not found; enter the subject before saving or publishing.");
  if (!className) warnings.push("Class / Batch header not found; enter the target class before saving or publishing.");
  if (objective.length !== 50) warnings.push("Objective section has " + objective.length + " questions; exactly 50 are required for a 100-mark paper.");
  if (objective.some((question) => question.options.some((option) => !option))) warnings.push("One or more objective questions are missing options.");
  if (objective.some((question) => question.correctIndex < 0)) warnings.push("Some objective answers are missing from the answer key.");
  const writtenTotal = written.reduce((sum, question) => sum + question.marks, 0);
  if (written.length === 0) warnings.push("No written questions were detected.");
  if (written.some((question) => question.marks !== 2 && question.marks !== 4 && question.marks !== 6)) warnings.push("Written questions must show marks as (2 marks), (4 marks) or (6 marks).");
  if (writtenTotal !== 100) warnings.push("Written question marks currently total " + writtenTotal + "; they must total 100.");
  return {
    title: title || (subject ? subject + " Exam" : "Imported Exam"),
    subject,
    className,
    startAt,
    objectiveDuration: Math.max(5, Number(header("Objective Duration")) || 60),
    writtenDuration: Math.max(5, Number(header("Written Duration")) || 150),
    objective,
    written,
    warnings
  };
}

type Props = {
  onBack: () => void;
  searchQuery?: string;
  showResultsInitially?: boolean;
};

export default function TestManagement({ onBack, searchQuery = "", showResultsInitially = false }: Props) {
  const [tests, setTests] = useState<ExamTest[]>(() => readStored<ExamTest>(TESTS_STORAGE_KEY));
  const [attempts, setAttempts] = useState<ExamAttempt[]>(() => readStored<ExamAttempt>(ATTEMPTS_STORAGE_KEY));
  const [filter, setFilter] = useState<FilterKey>("all");
  const [view, setView] = useState<"list" | "create" | "import" | "details" | "exam" | "results" | "grade" | "resultsCenter">(showResultsInitially ? "resultsCenter" : "list");
  const [studentMode, setStudentMode] = useState(false);
  const [studentClass, setStudentClass] = useState("Class 10");
  const [selectedTestId, setSelectedTestId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [selectedAttemptId, setSelectedAttemptId] = useState("");
  const [currentAttemptId, setCurrentAttemptId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pasteText, setPasteText] = useState("");
  const [parsedPaper, setParsedPaper] = useState<ParsedPaper | null>(null);
  const [importError, setImportError] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentRoll, setStudentRoll] = useState("");
  const [studentIdentityError, setStudentIdentityError] = useState("");
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [gradingMarks, setGradingMarks] = useState<Record<string, number>>({});

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
  const activeWrittenQuestion = currentTest?.writtenQuestions?.[currentQuestion];
  const examQuestionCount = currentTest ? questionCount(currentTest) : 0;
  const examQuestionAnsweredCount = currentTest
    ? currentTest.paperType === "written"
      ? (currentTest.writtenQuestions || []).filter((question) => Boolean(writtenAnswers[question.id]?.trim())).length
      : currentTest.questions.filter((question) => answers[question.id] !== undefined).length
    : 0;

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

  function handleParsePaper() {
    const parsed = parsePastedPaper(pasteText);
    if (!pasteText.trim()) { setImportError("Paste the full question paper first."); return; }
    if (parsed.objective.length === 0 && parsed.written.length === 0) {
      setParsedPaper(null);
      setImportError("No questions were detected. Use [OBJECTIVE] and [WRITTEN] section headings and numbered questions.");
      return;
    }
    setParsedPaper(parsed);
    setImportError("");
  }

  function saveImportedPapers() {
    if (!parsedPaper) return;
    const groupId = makeId("exam");
    if (!parsedPaper.title.trim() || !parsedPaper.subject.trim() || !parsedPaper.className.trim()) {
      setImportError("Enter the exam title, subject and class before saving the imported drafts.");
      return;
    }
    const parsedStart = new Date(parsedPaper.startAt);
    if (Number.isNaN(parsedStart.getTime())) {
      setImportError("Choose a valid exam date and time before saving the drafts.");
      return;
    }
    const base = {
      title: parsedPaper.title.trim(),
      subject: parsedPaper.subject.trim(),
      className: parsedPaper.className.trim(),
      startAt: parsedStart.toISOString(),
      instructions: "Read the instructions carefully. Do not refresh or close the exam while attempting.",
      isPublished: false,
      examGroupId: groupId,
      createdAt: new Date().toISOString()
    };
    const imported: ExamTest[] = [];
    if (parsedPaper.objective.length > 0) imported.push({
      ...base, id: makeId("objective"), paperType: "objective",
      title: base.title + " — Objective", durationMinutes: parsedPaper.objectiveDuration,
      questions: parsedPaper.objective
    });
    if (parsedPaper.written.length > 0) imported.push({
      ...base, id: makeId("written"), paperType: "written",
      title: base.title + " — Written", durationMinutes: parsedPaper.writtenDuration,
      questions: [], writtenQuestions: parsedPaper.written
    });
    setTests((current) => [...imported, ...current]);
    setPasteText("");
    setParsedPaper(null);
    setSelectedTestId(imported[0]?.id || "");
    setView(showResultsInitially ? "resultsCenter" : "list");
  }

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

  function publishValidation(test: ExamTest): string[] {
    const problems: string[] = [];
    if (!test.title.trim()) problems.push("Exam title is required.");
    if (!test.subject.trim()) problems.push("Subject is required.");
    if (!test.className.trim()) problems.push("Class / Batch is required.");
    if (test.paperType === "objective") {
      if (test.questions.length !== 50) problems.push("Objective paper must contain exactly 50 MCQs.");
      if (test.questions.some((question) => question.marks !== 2)) problems.push("Every objective question must be worth 2 marks.");
      if (test.questions.some((question) => question.options.length !== 4 || question.options.some((option) => !option.trim()))) problems.push("Every MCQ must have four complete options.");
      if (test.questions.some((question) => question.correctIndex < 0 || question.correctIndex > 3)) problems.push("Every MCQ must have a correct answer in the answer key.");
      if (totalMarks(test) !== 100) problems.push("Objective paper total must be 100 marks.");
    } else if (test.paperType === "written") {
      const written = test.writtenQuestions || [];
      if (written.length === 0) problems.push("Add written questions before publishing.");
      if (written.some((question) => ![2, 4, 6].includes(question.marks))) problems.push("Written questions must be worth 2, 4 or 6 marks.");
      if (totalMarks(test) !== 100) problems.push("Written paper total must be exactly 100 marks.");
    } else if (test.questions.length === 0) {
      problems.push("Add at least one question before publishing.");
    }
    return problems;
  }

  function publishTest(test: ExamTest) {
    const problems = publishValidation(test);
    if (problems.length) { setFormError(problems.join(" ")); return; }
    const parsedStart = new Date(test.startAt).getTime();
    if (!Number.isFinite(parsedStart)) { setFormError("Exam date and time are invalid. Edit the draft before publishing."); return; }
    setTests((current) => current.map((item) => item.id === test.id ? { ...item, isPublished: true } : item));
    setFormError("");
    setSelectedTestId(test.id);
  }

  function publishNow(test: ExamTest) {
    const problems = publishValidation(test);
    if (problems.length) { setFormError(problems.join(" ")); return; }
    const updated = { ...test, isPublished: true, startAt: new Date().toISOString() };
    setTests((current) => current.map((item) => item.id === test.id ? updated : item));
    setFormError("");
    setSelectedTestId(test.id);
  }

  function unpublishTest(test: ExamTest) {
    setTests((current) => current.map((item) => item.id === test.id ? { ...item, isPublished: false } : item));
    setFormError("");
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
    if (!preview && statusFor(test, now) !== "live") return;
    if (!preview && !resume && (!studentName.trim() || !studentRoll.trim())) {
      setStudentIdentityError("Enter your name and roll number before starting the exam.");
      setStudentMode(true);
      setView("list");
      return;
    }
    const attempt = resume || {
      id: makeId("attempt"),
      testId: test.id,
      startedAt: new Date().toISOString(),
      answers: {},
      writtenAnswers: {},
      studentName: preview ? "Teacher Preview" : studentName.trim(),
      rollNumber: preview ? "PREVIEW" : studentRoll.trim(),
      totalMarks: totalMarks(test),
      preview
    };
    if (!resume) setAttempts((current) => [attempt, ...current]);
    setSelectedTestId(test.id);
    setCurrentAttemptId(attempt.id);
    setSelectedAttemptId(attempt.id);
    setAnswers(attempt.answers || {});
    setWrittenAnswers(attempt.writtenAnswers || {});
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

  function saveWrittenAnswer(questionId: string, value: string) {
    const nextAnswers = { ...writtenAnswers, [questionId]: value };
    setWrittenAnswers(nextAnswers);
    setAttempts((current) => current.map((attempt) => attempt.id === currentAttemptId && !attempt.submittedAt
      ? { ...attempt, writtenAnswers: nextAnswers }
      : attempt));
  }

  function finishAttempt() {
    if (!currentTest || !currentAttemptId) return;
    const existing = attempts.find((attempt) => attempt.id === currentAttemptId);
    if (existing?.submittedAt) { setSelectedAttemptId(existing.id); setView("results"); return; }
    const isWritten = currentTest.paperType === "written";
    const score = isWritten ? undefined : currentTest.questions.reduce((sum, question) => (
      sum + (answers[question.id] === question.correctIndex ? question.marks : 0)
    ), 0);
    setAttempts((current) => current.map((attempt) => attempt.id === currentAttemptId
      ? { ...attempt, answers, writtenAnswers, ...(score === undefined ? {} : { score }), totalMarks: totalMarks(currentTest), submittedAt: new Date().toISOString() }
      : attempt));
    setSelectedAttemptId(currentAttemptId);
    setView("results");
  }

  function saveWrittenGrade(attempt: ExamAttempt, test: ExamTest) {
    const items = test.writtenQuestions || [];
    const hasInvalid = items.some((question) => {
      const mark = gradingMarks[question.id];
      return mark === undefined || !Number.isFinite(mark) || mark < 0 || mark > question.marks;
    });
    if (hasInvalid) { setFormError("Enter a valid mark for every written question, within its maximum marks."); return; }
    const score = items.reduce((sum, question) => sum + (gradingMarks[question.id] || 0), 0);
    setAttempts((current) => current.map((item) => item.id === attempt.id
      ? { ...item, manualMarks: gradingMarks, score, totalMarks: totalMarks(test), gradedAt: new Date().toISOString() }
      : item));
    setSelectedAttemptId(attempt.id);
    setFormError("");
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

  if (view === "import") {
    return (
      <div className="tm-module">
        <div className="tm-page-head">
          <button className="tm-back" onClick={() => { setView("list"); setParsedPaper(null); setImportError(""); }}>← Back to Exams</button>
          <div><span className="tm-eyebrow">PAPER IMPORT STUDIO</span><h1>Paste complete question paper</h1><p>Paste both sections together. The importer reads exam metadata, splits MCQ and written questions, and prepares two separate drafts.</p></div>
          <span className="tm-step-pill">One paste · Two exams</span>
        </div>
        <section className="tm-panel tm-import-panel">
          <div className="tm-panel-title"><div><h2>Question paper text</h2><p>Use clear section headings and a separate answer key for objective questions.</p></div><span>01</span></div>
          <textarea className="tm-paste-area" value={pasteText} onChange={(event) => { setPasteText(event.target.value); setParsedPaper(null); setImportError(""); }} placeholder={"Exam: Science Unit Test 01\nSubject: Science\nClass: Class 10\nDate: 20-11-2026\nTime: 10:00 AM\n\n[OBJECTIVE]\nQ1. Question text?\nA) Option one\nB) Option two\nC) Option three\nD) Option four\nAnswer: B\n... continue through Q50 ...\n\n[WRITTEN]\nQ1. Explain ... (2 marks)\nQ2. Describe ... (4 marks)\nQ3. Discuss ... (6 marks)\n... total written marks must equal 100 ..."} rows={14} />
          <div className="tm-import-tools"><span>Supported headers: Exam, Subject, Class, Date (DD-MM-YYYY), Time (HH:MM AM/PM)</span><button className="tm-button tm-button-primary" onClick={handleParsePaper}>Parse & Preview →</button></div>
          {importError && <div className="tm-error" role="alert">{importError}</div>}
        </section>
        {parsedPaper && (
          <>
            <section className="tm-panel tm-import-metadata">
              <div className="tm-panel-title"><div><h2>Confirm parsed exam details</h2><p>These fields are prefilled from the pasted paper. Correct anything the parser could not read.</p></div><span>Auto-filled</span></div>
              <div className="tm-import-metadata-grid">
                <label className="tm-field">Exam title<input value={parsedPaper.title} onChange={(event) => setParsedPaper((current) => current ? { ...current, title: event.target.value } : current)} /></label>
                <label className="tm-field">Subject<input value={parsedPaper.subject} onChange={(event) => setParsedPaper((current) => current ? { ...current, subject: event.target.value } : current)} placeholder="Enter subject" /></label>
                <label className="tm-field">Class / Batch<input value={parsedPaper.className} onChange={(event) => setParsedPaper((current) => current ? { ...current, className: event.target.value } : current)} placeholder="Enter class or batch" /></label>
                <label className="tm-field">Exam date & time<input type="datetime-local" value={parsedPaper.startAt} onChange={(event) => setParsedPaper((current) => current ? { ...current, startAt: event.target.value } : current)} /></label>
                <label className="tm-field">Objective duration (minutes)<input type="number" min="5" max="300" value={parsedPaper.objectiveDuration} onChange={(event) => setParsedPaper((current) => current ? { ...current, objectiveDuration: Math.max(5, Number(event.target.value) || 5) } : current)} /></label>
                <label className="tm-field">Written duration (minutes)<input type="number" min="5" max="300" value={parsedPaper.writtenDuration} onChange={(event) => setParsedPaper((current) => current ? { ...current, writtenDuration: Math.max(5, Number(event.target.value) || 5) } : current)} /></label>
              </div>
            </section>
            <div className="tm-import-two">
              <section className="tm-panel">
                <div className="tm-panel-title"><div><h2>Objective paper</h2><p>50 MCQs · 2 marks each · 100 marks</p></div><span>{parsedPaper.objective.length}/50</span></div>
                <div className="tm-import-progress"><i style={{ width: Math.min(100, parsedPaper.objective.length / 50 * 100) + "%" }} /></div>
                <div className="tm-import-list">{parsedPaper.objective.slice(0, 5).map((question, index) => <article key={question.id}><strong>Q{index + 1}. {question.prompt}</strong><small>{question.options.filter(Boolean).length}/4 options · {question.correctIndex >= 0 ? "Answer key found" : "Answer key missing"}</small></article>)}</div>
                {parsedPaper.objective.length > 5 && <p className="tm-import-more">+ {parsedPaper.objective.length - 5} more objective questions</p>}
              </section>
              <section className="tm-panel">
                <div className="tm-panel-title"><div><h2>Written paper</h2><p>Long answers · 2, 4 and 6 marks · 100 marks</p></div><span>{parsedPaper.written.reduce((sum, question) => sum + question.marks, 0)}/100</span></div>
                <div className="tm-import-progress"><i style={{ width: Math.min(100, parsedPaper.written.reduce((sum, question) => sum + question.marks, 0)) + "%" }} /></div>
                <div className="tm-import-list">{parsedPaper.written.slice(0, 5).map((question, index) => <article key={question.id}><strong>Q{index + 1}. {question.prompt}</strong><small>{question.marks || "Marks missing"} marks</small></article>)}</div>
                {parsedPaper.written.length > 5 && <p className="tm-import-more">+ {parsedPaper.written.length - 5} more written questions</p>}
              </section>
            </div>
            <section className="tm-panel tm-import-warnings">
              <h2>Import validation</h2>
              {parsedPaper.warnings.length === 0 ? <p className="tm-validation-good">Both papers meet the expected structure. Review the preview, then save the two drafts.</p> : <ul>{parsedPaper.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              <p className="tm-validation-note">Drafts can be saved for correction. Publishing will be blocked until the objective paper has 50 complete MCQs with an answer key and the written paper totals exactly 100 marks.</p>
            </section>
            <div className="tm-form-actions"><button className="tm-button tm-button-outline" onClick={() => { setParsedPaper(null); setImportError(""); }}>Edit pasted text</button><button className="tm-button tm-button-primary" onClick={saveImportedPapers}>Save Objective + Written drafts →</button></div>
          </>
        )}
      </div>
    );
  }

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
          <div><span className="tm-eyebrow">TEST OVERVIEW</span><h1>{selectedTest.title}</h1><p>{selectedTest.className} · {selectedTest.subject} · {selectedTest.paperType === "written" ? "Written paper" : "Objective paper"} · {questionCount(selectedTest)} questions</p></div>
          <span className={"tm-status tm-status-" + status}>{statusLabel(status)}</span>
        </div>
        <div className="tm-detail-stats">
          <div><span>Duration</span><strong>{selectedTest.durationMinutes} min</strong></div>
          <div><span>Total marks</span><strong>{totalMarks(selectedTest)}</strong></div>
          <div><span>Questions</span><strong>{questionCount(selectedTest)}</strong></div>
          <div><span>Attempts</span><strong>{testAttempts.length}</strong></div>
        </div>
        <section className="tm-panel tm-detail-panel">
          <div className="tm-panel-title"><div><h2>Exam schedule</h2><p>Check the published start time and student instructions.</p></div></div>
          <div className="tm-schedule-row"><div><span>Scheduled start</span><strong>{formatDate(selectedTest.startAt)}</strong></div><div><span>Exam closes</span><strong>{formatDate(new Date(new Date(selectedTest.startAt).getTime() + selectedTest.durationMinutes * 60000).toISOString())}</strong></div></div>
          <div className="tm-instructions"><strong>Instructions for students</strong><p>{selectedTest.instructions || "No additional instructions."}</p></div>
        </section>
        <section className="tm-panel tm-question-paper-panel">
          <div className="tm-panel-title"><div><h2>{selectedTest.paperType === "written" ? "Written question paper" : "Objective question paper"}</h2><p>{selectedTest.paperType === "written" ? "Descriptive answer paper. Teachers review and award marks after submission." : "Teacher preview includes the answer key. Printed student copies hide correct answers."}</p></div><div className="tm-paper-actions"><button className="tm-button tm-button-outline" disabled={questionCount(selectedTest) === 0} onClick={() => window.print()}>Print question paper</button><button className="tm-button tm-button-soft" disabled={questionCount(selectedTest) === 0} title={questionCount(selectedTest) === 0 ? "Add questions before previewing." : "Open timed student preview"} onClick={() => startExam(selectedTest, true)}>Preview as student ↗</button></div></div>
          <div className="tm-paper-print-header"><h1>{selectedTest.title}</h1><p>{selectedTest.className} · {selectedTest.subject} · {formatDate(selectedTest.startAt)} · {selectedTest.durationMinutes} minutes · Maximum marks: {totalMarks(selectedTest)}</p><div>Student name: ____________________________________  Roll no.: __________________</div><strong>Instructions</strong><p>{selectedTest.instructions || "Read every question carefully."}</p></div>
          <div className="tm-paper-questions">{selectedTest.paperType === "written"
            ? (selectedTest.writtenQuestions || []).map((question, index) => <article key={question.id}><div><strong>Q{index + 1}. {question.prompt}</strong><span>{question.marks} marks</span></div><div className="tm-written-answer-lines">{question.marks === 2 ? "Answer in 1–2 lines." : question.marks === 4 ? "Answer in 3–4 lines." : "Write a detailed answer."}</div></article>)
            : selectedTest.questions.map((question, index) => <article key={question.id}><div><strong>Q{index + 1}. {question.prompt}</strong><span>{question.marks} marks</span></div><div className="tm-paper-options">{question.options.map((option, optionIndex) => <span className={optionIndex === question.correctIndex ? "tm-correct-option" : ""} key={optionIndex}>{String.fromCharCode(65 + optionIndex)}. {option}</span>)}</div></article>)}
          </div>
        </section>
        <section className="tm-panel tm-attempt-panel">
          <div className="tm-panel-title"><div><h2>Student submissions & results</h2><p>Track started attempts and open submitted scorecards.</p></div><span>{testAttempts.filter((attempt) => attempt.submittedAt).length} submitted</span></div>
          {testAttempts.length === 0 ? <div className="tm-empty-small">No student attempts yet. Launch the test and students can start from the Student Portal preview.</div> : (
            <div className="tm-attempt-list">{testAttempts.map((attempt) => {
              const submitted = Boolean(attempt.submittedAt);
              const percent = attempt.totalMarks ? Math.round(((attempt.score || 0) / attempt.totalMarks) * 100) : 0;
              return <div className="tm-attempt-row" key={attempt.id}>
                <div><strong>{attempt.studentName || (attempt.preview ? "Teacher preview" : "Student attempt")} {attempt.rollNumber ? "· " + attempt.rollNumber : ""}</strong><small>Started {formatDate(attempt.startedAt)}{attempt.submittedAt ? " · Submitted " + formatDate(attempt.submittedAt) : " · In progress"}</small></div>
                <span className={"tm-status tm-status-" + (submitted ? (selectedTest.paperType === "written" && !attempt.gradedAt ? "upcoming" : "completed") : "live")}>{!submitted ? "In progress" : selectedTest.paperType === "written" && !attempt.gradedAt ? "Needs marking" : "Evaluated"}</span>
                <strong className="tm-attempt-score">{!submitted ? "—" : selectedTest.paperType === "written" && !attempt.gradedAt ? "Pending" : (attempt.score || 0) + "/" + attempt.totalMarks + " · " + percent + "%"}</strong>
                {submitted && selectedTest.paperType === "written" && !attempt.gradedAt
                  ? <button className="tm-table-action" onClick={() => { setSelectedAttemptId(attempt.id); setGradingMarks(attempt.manualMarks || {}); setView("grade"); }}>Review & grade →</button>
                  : <button className="tm-table-action" disabled={!submitted} onClick={() => { setSelectedAttemptId(attempt.id); setView("results"); }}>View result →</button>}
              </div>;
            })}</div>
          )}
        </section>
        <div className="tm-detail-actions">
          {!selectedTest.isPublished && selectedTest.paperType !== "objective" && selectedTest.paperType !== "written" && <button className="tm-button tm-button-outline" onClick={() => beginCreate(selectedTest)}>Edit draft</button>}
          {!selectedTest.isPublished && <button className="tm-button tm-button-primary" onClick={() => publishTest(selectedTest)}>Publish {selectedTest.paperType === "written" ? "Written" : selectedTest.paperType === "objective" ? "Objective" : ""} Exam →</button>}
          {selectedTest.isPublished && <button className="tm-button tm-button-danger" onClick={() => unpublishTest(selectedTest)}>Turn OFF / Unpublish this paper</button>}
          {status === "upcoming" && selectedTest.isPublished && <button className="tm-button tm-button-primary" onClick={() => publishNow(selectedTest)}>Launch now →</button>}
          {status === "live" && <button className="tm-button tm-button-primary" onClick={() => { setStudentMode(true); setView("list"); }}>Open student portal ↗</button>}
          <button className="tm-button tm-button-danger" onClick={() => deleteTest(selectedTest)}>Delete test</button>
        </div>
        {formError && <div className="tm-error" role="alert">{formError}</div>}
        <p className="tm-storage-note">Publishing and OFF controls apply independently to this paper. This preview stores records in this browser; multi-device student access needs the shared API/database deployment.</p>
      </div>
    );
  }

  if (view === "exam" && currentTest && (activeQuestion || activeWrittenQuestion)) {
    const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, "0");
    const seconds = (remainingSeconds % 60).toString().padStart(2, "0");
    return (
      <div className="tm-module tm-exam-mode">
        <div className="tm-exam-top"><div><span className="tm-eyebrow">{currentAttempt?.preview ? "STUDENT PREVIEW" : "ONLINE EXAM"}</span><h1>{currentTest.title}</h1><p>{currentTest.className} · {currentTest.subject}</p></div><div className={"tm-timer" + (remainingSeconds < 300 ? " tm-timer-warning" : "")}><span>TIME LEFT</span><strong>{minutes}:{seconds}</strong></div></div>
        <div className="tm-exam-layout">
          <section className="tm-panel tm-exam-question">
            <div className="tm-question-number">QUESTION {currentQuestion + 1} OF {examQuestionCount}<span>{currentTest.paperType === "written" ? activeWrittenQuestion?.marks : activeQuestion?.marks} marks</span></div>
            <h2>{currentTest.paperType === "written" ? activeWrittenQuestion?.prompt : activeQuestion?.prompt}</h2>
            {currentTest.paperType === "written" && activeWrittenQuestion ? (
              <div className="tm-written-response"><label>Write your answer<textarea rows={Math.max(5, activeWrittenQuestion.marks * 2)} value={writtenAnswers[activeWrittenQuestion.id] || ""} onChange={(event) => saveWrittenAnswer(activeWrittenQuestion.id, event.target.value)} placeholder="Type your answer here. Your response is saved automatically." /></label><small>{activeWrittenQuestion.marks} marks · Your answer will be reviewed by the teacher after submission.</small></div>
            ) : activeQuestion ? (
              <div className="tm-exam-options">{activeQuestion.options.map((option, index) => (
                <button key={index} className={answers[activeQuestion.id] === index ? "tm-exam-option selected" : "tm-exam-option"} onClick={() => saveAnswer(activeQuestion.id, index)}>
                  <span>{String.fromCharCode(65 + index)}</span>{option}{answers[activeQuestion.id] === index && <b>✓</b>}
                </button>
              ))}</div>
            ) : null}
            <div className="tm-exam-nav"><button className="tm-button tm-button-outline" disabled={currentQuestion === 0} onClick={() => setCurrentQuestion((value) => Math.max(0, value - 1))}>← Previous</button><span>{examQuestionAnsweredCount} of {examQuestionCount} answered</span><button className="tm-button tm-button-primary" onClick={() => setCurrentQuestion((value) => Math.min(examQuestionCount - 1, value + 1))}>{currentQuestion === examQuestionCount - 1 ? "Review answers" : "Next question →"}</button></div>
          </section>
          <aside className="tm-panel tm-question-palette"><h3>Question palette</h3><p>Select a number to move to that question.</p><div>{(currentTest.paperType === "written" ? currentTest.writtenQuestions || [] : currentTest.questions).map((question, index) => {
            const isAnswered = currentTest.paperType === "written" ? Boolean(writtenAnswers[question.id]?.trim()) : answers[question.id] !== undefined;
            return <button key={question.id} className={(currentQuestion === index ? "current " : "") + (isAnswered ? "answered" : "")} onClick={() => setCurrentQuestion(index)}>{index + 1}</button>;
          })}</div><div className="tm-palette-legend"><span><i className="answered-dot"/>Answered</span><span><i/>Not answered</span></div><button className="tm-button tm-button-primary tm-submit-exam" onClick={() => { if (window.confirm("Submit your test now? You cannot change answers after submission.")) finishAttempt(); }}>Submit test</button></aside>
        </div>
        <p className="tm-storage-note">{currentTest.paperType === "written" ? "Written responses are autosaved in this browser. Submitted answers will enter the teacher evaluation queue." : "Answers are autosaved in this browser. Objective marks are calculated automatically on submission."} Do not close this tab until submission is complete.</p>
      </div>
    );
  }

  if (view === "grade" && selectedAttempt && currentTest && currentTest.paperType === "written") {
    const written = currentTest.writtenQuestions || [];
    return (
      <div className="tm-module">
        <div className="tm-page-head"><button className="tm-back" onClick={() => setView("details")}>← Back to submissions</button><div><span className="tm-eyebrow">TEACHER EVALUATION</span><h1>Review written answer sheet</h1><p>{selectedAttempt.studentName || "Student"} · Roll no. {selectedAttempt.rollNumber || "—"} · {currentTest.title}</p></div><span className="tm-status tm-status-upcoming">Manual marking</span></div>
        <section className="tm-panel">
          <div className="tm-panel-title"><div><h2>Submitted written answers</h2><p>Read each response and award marks from zero up to the question maximum.</p></div><span>{written.length} questions</span></div>
          <div className="tm-grade-list">{written.map((question, index) => (
            <article key={question.id}>
              <div className="tm-grade-question"><strong>Q{index + 1}. {question.prompt}</strong><span>Maximum {question.marks} marks</span></div>
              <div className="tm-grade-answer">{selectedAttempt.writtenAnswers?.[question.id]?.trim() || "No answer submitted."}</div>
              <label className="tm-field tm-grade-mark">Awarded marks<input type="number" min="0" max={question.marks} step="0.5" value={gradingMarks[question.id] ?? ""} onChange={(event) => { const value = event.target.value === "" ? undefined : Number(event.target.value); setGradingMarks((current) => { const next = { ...current }; if (value === undefined) delete next[question.id]; else next[question.id] = value; return next; }); setAttempts((current) => current.map((item) => { if (item.id !== selectedAttempt.id) return item; const marks = { ...(item.manualMarks || {}) }; if (value === undefined) delete marks[question.id]; else marks[question.id] = value; return { ...item, manualMarks: marks }; })); }} placeholder={"0–" + question.marks} /></label>
            </article>
          ))}</div>
        </section>
        {formError && <div className="tm-error" role="alert">{formError}</div>}
        <div className="tm-form-actions"><button className="tm-button tm-button-outline" onClick={() => setView("details")}>Save later</button><button className="tm-button tm-button-primary" onClick={() => saveWrittenGrade(selectedAttempt, currentTest)}>Save marks & publish result →</button></div>
        <p className="tm-storage-note">Written marks are manually awarded by the teacher. This browser-only implementation does not use AI to decide final marks.</p>
      </div>
    );
  }

  if (view === "resultsCenter") {
    const submitted = attempts.filter((attempt) => Boolean(attempt.submittedAt) && !attempt.preview);
    const objectiveRows = submitted.filter((attempt) => tests.find((test) => test.id === attempt.testId)?.paperType !== "written").sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const writtenPending = submitted.filter((attempt) => {
      const test = tests.find((item) => item.id === attempt.testId);
      return test?.paperType === "written" && !attempt.gradedAt;
    });
    const writtenGraded = submitted.filter((attempt) => {
      const test = tests.find((item) => item.id === attempt.testId);
      return test?.paperType === "written" && Boolean(attempt.gradedAt);
    });
    const combined = new Map<string, { name: string; roll: string; objective?: number; written?: number; objectiveMax: number; writtenMax: number }>();
    for (const attempt of submitted) {
      const test = tests.find((item) => item.id === attempt.testId);
      if (!test?.examGroupId || !attempt.rollNumber) continue;
      const key = test.examGroupId + ":" + attempt.rollNumber.trim().toLowerCase();
      const row = combined.get(key) || { name: attempt.studentName || "Student", roll: attempt.rollNumber, objectiveMax: 100, writtenMax: 100 };
      if (test.paperType === "written") {
        if (row.written === undefined && attempt.gradedAt) row.written = attempt.score;
      } else if (row.objective === undefined && typeof attempt.score === "number") row.objective = attempt.score;
      combined.set(key, row);
    }
    return (
      <div className="tm-module">
        <div className="tm-page-head"><button className="tm-back" onClick={onBack}>← Dashboard</button><div><span className="tm-eyebrow">RESULTS & EVALUATION CENTER</span><h1>Results dashboard</h1><p>Bulk objective scores, written-paper marking queue and combined 200-mark scorecards.</p></div><span className="tm-step-pill">Auto + Teacher review</span></div>
        <div className="tm-stats tm-result-stats">
          <article><span className="tm-stat-icon purple">✓</span><div><strong>{objectiveRows.length}</strong><small>Objective evaluated</small></div></article>
          <article><span className="tm-stat-icon orange">✎</span><div><strong>{writtenPending.length}</strong><small>Written awaiting marking</small></div></article>
          <article><span className="tm-stat-icon green">✓</span><div><strong>{writtenGraded.length}</strong><small>Written evaluated</small></div></article>
          <article><span className="tm-stat-icon blue">▤</span><div><strong>{combined.size}</strong><small>Combined student records</small></div></article>
        </div>
        <section className="tm-panel tm-results-section">
          <div className="tm-panel-title"><div><h2>Objective results — automatic</h2><p>Every submitted MCQ is scored against the saved answer key. These rows do not need manual review.</p></div><span>{objectiveRows.length} ready</span></div>
          <div className="tm-table-wrap"><table className="tm-table"><thead><tr><th>RANK</th><th>STUDENT</th><th>ROLL NO.</th><th>EXAM</th><th>SCORE</th><th>PERCENTAGE</th><th>SUBMITTED</th></tr></thead><tbody>{objectiveRows.map((attempt, index) => {
            const test = tests.find((item) => item.id === attempt.testId);
            const score = attempt.score ?? 0;
            const percent = attempt.totalMarks ? Math.round(score / attempt.totalMarks * 100) : 0;
            return <tr key={attempt.id}><td>{index + 1}</td><td><strong>{attempt.studentName || "Student"}</strong></td><td>{attempt.rollNumber || "—"}</td><td>{test?.title || "Exam"}</td><td><strong>{score}/{attempt.totalMarks}</strong></td><td>{percent}%</td><td>{formatDate(attempt.submittedAt || "")}</td></tr>;
          })}{objectiveRows.length === 0 && <tr><td colSpan={7} className="tm-table-empty">Objective results will appear here as students submit.</td></tr>}</tbody></table></div>
        </section>
        <section className="tm-panel tm-results-section">
          <div className="tm-panel-title"><div><h2>Written evaluation queue</h2><p>Open submitted answer sheets and award marks question by question.</p></div><span>{writtenPending.length} pending</span></div>
          <div className="tm-table-wrap"><table className="tm-table"><thead><tr><th>STUDENT</th><th>ROLL NO.</th><th>EXAM</th><th>STATUS</th><th></th></tr></thead><tbody>{writtenPending.map((attempt) => {
            const test = tests.find((item) => item.id === attempt.testId);
            return <tr key={attempt.id}><td><strong>{attempt.studentName || "Student"}</strong></td><td>{attempt.rollNumber || "—"}</td><td>{test?.title || "Written Exam"}</td><td><span className="tm-status tm-status-upcoming">Needs marking</span></td><td><button className="tm-table-action" onClick={() => { setSelectedTestId(attempt.testId); setSelectedAttemptId(attempt.id); setGradingMarks(attempt.manualMarks || {}); setFormError(""); setView("grade"); }}>Review & grade →</button></td></tr>;
          })}{writtenPending.length === 0 && <tr><td colSpan={5} className="tm-table-empty">No written answer sheets waiting for evaluation.</td></tr>}</tbody></table></div>
        </section>
        <section className="tm-panel tm-results-section">
          <div className="tm-panel-title"><div><h2>Combined result — 200 marks</h2><p>Objective + teacher-graded written score for the same exam and roll number.</p></div></div>
          <div className="tm-table-wrap"><table className="tm-table"><thead><tr><th>STUDENT</th><th>ROLL NO.</th><th>OBJECTIVE / 100</th><th>WRITTEN / 100</th><th>TOTAL / 200</th><th>STATUS</th></tr></thead><tbody>{Array.from(combined.entries()).map(([key, row]) => {
            const complete = typeof row.objective === "number" && typeof row.written === "number";
            const total = (row.objective || 0) + (row.written || 0);
            return <tr key={key}><td><strong>{row.name}</strong></td><td>{row.roll}</td><td>{row.objective === undefined ? "Pending" : row.objective}</td><td>{row.written === undefined ? "Pending" : row.written}</td><td><strong>{complete ? total + "/200" : "—"}</strong></td><td><span className={"tm-status tm-status-" + (complete ? "completed" : "upcoming")}>{complete ? Math.round(total / 2) + "% Complete" : "Awaiting both papers"}</span></td></tr>;
          })}{combined.size === 0 && <tr><td colSpan={6} className="tm-table-empty">Combined scores appear when a student has attempted both papers in the same exam group.</td></tr>}</tbody></table></div>
        </section>
        <div className="tm-detail-actions"><button className="tm-button tm-button-outline" onClick={() => window.print()}>Print results summary</button><button className="tm-button tm-button-primary" onClick={() => { const rows = [["Student","Roll","Objective","Written","Total"], ...Array.from(combined.values()).map((row) => [row.name,row.roll,String(row.objective ?? ""),String(row.written ?? ""),typeof row.objective === "number" && typeof row.written === "number" ? String(row.objective + row.written) : ""])]; const csv = rows.map((row) => row.map((cell) => '"' + cell.replace(/"/g, '""') + '"').join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "exam-results.csv"; link.click(); URL.revokeObjectURL(url); }}>Export combined CSV ↓</button></div>
      </div>
    );
  }

  if (view === "results" && selectedAttempt && currentTest) {
    const isWrittenPending = currentTest.paperType === "written" && !selectedAttempt.gradedAt;
    const score = selectedAttempt.score ?? 0;
    const percentage = selectedAttempt.totalMarks ? Math.round(score / selectedAttempt.totalMarks * 100) : 0;
    return (
      <div className="tm-module">
        <div className="tm-page-head"><button className="tm-back" onClick={() => { setView("list"); }}>← Back to tests</button><div><span className="tm-eyebrow">ASSESSMENT RESULT</span><h1>Test submitted successfully</h1><p>{currentTest.title} · {currentTest.className}</p></div><span className="tm-status tm-status-completed">Submitted</span></div>
        <div className="tm-result-hero"><div className="tm-score-ring"><strong>{isWrittenPending ? "—" : percentage + "%"}</strong><span>{isWrittenPending ? "Pending" : "Score"}</span></div><div>{isWrittenPending ? <><h2>Awaiting teacher evaluation</h2><p>Your written answers have been submitted successfully. Marks will appear after the teacher reviews your answer sheet.</p></> : <><h2>{score} <small>/ {selectedAttempt.totalMarks} marks</small></h2><p>{currentTest.paperType === "written" ? "Teacher-reviewed descriptive answers" : currentTest.questions.filter((question) => selectedAttempt.answers[question.id] === question.correctIndex).length + " correct · " + currentTest.questions.filter((question) => selectedAttempt.answers[question.id] !== undefined && selectedAttempt.answers[question.id] !== question.correctIndex).length + " incorrect · " + currentTest.questions.filter((question) => selectedAttempt.answers[question.id] === undefined).length + " unanswered"}</p></>}<span>{selectedAttempt.preview ? "Preview attempt — not a published student result" : "Submitted " + formatDate(selectedAttempt.submittedAt || "")}</span></div></div>
        <section className="tm-panel"><div className="tm-panel-title"><div><h2>{currentTest.paperType === "written" ? "Submitted written answers" : "Objective answer review"}</h2><p>{currentTest.paperType === "written" ? "Your typed answers are saved. Teacher marks will be shown after evaluation." : "Your answers compared with the answer key."}</p></div></div><div className="tm-review-list">{currentTest.paperType === "written"
          ? (currentTest.writtenQuestions || []).map((question, index) => <article key={question.id}><strong>Q{index + 1}. {question.prompt} ({question.marks} marks)</strong><span>{selectedAttempt.writtenAnswers?.[question.id] || "Not answered"}</span><small>{isWrittenPending ? "Evaluation pending" : "Awarded marks: " + (selectedAttempt.manualMarks?.[question.id] ?? 0) + "/" + question.marks}</small></article>)
          : currentTest.questions.map((question, index) => {
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
          <button className="tm-button tm-button-outline" onClick={() => { setStudentMode((value) => !value); setView("list"); }}>{studentMode ? "↩ Teacher / Admin" : "◉ Student portal preview"}</button>
          {!studentMode && <>
            <button className="tm-button tm-button-outline" onClick={() => { setView("resultsCenter"); setFormError(""); }}>Results & Evaluation</button>
            
          </>}
        </div>
      </div>

      {studentMode ? (
        <>
          <div className="tm-student-banner"><div><strong>Student portal preview</strong><p>This preview uses the tests saved in this browser. A real student login and batch assignment will be connected through the backend phase.</p></div><span>STUDENT VIEW</span></div>
          <div className="tm-student-class-filter"><label>My class / batch<select value={studentClass} onChange={(event) => setStudentClass(event.target.value)}><option>Class 9</option><option>Class 10</option><option>Class 11</option><option>Class 12</option><option>JEE Foundation</option><option>NEET Foundation</option></select></label><span>Only tests published for this class are shown.</span></div>
          <div className="tm-student-identity"><label className="tm-field">Student name<input value={studentName} onChange={(event) => { setStudentName(event.target.value); setStudentIdentityError(""); }} placeholder="Enter your full name" /></label><label className="tm-field">Roll number<input value={studentRoll} onChange={(event) => { setStudentRoll(event.target.value); setStudentIdentityError(""); }} placeholder="Enter your roll number" /></label></div>
          {studentIdentityError && <div className="tm-error" role="alert">{studentIdentityError}</div>}
          <div className="tm-section-heading"><div><h2>Available assessments</h2><p>Only published tests are shown here.</p></div></div>
          {studentTests.length === 0 ? <div className="tm-empty-state"><div>▤</div><h3>No tests assigned yet</h3><p>When your teacher publishes a test, it will appear here.</p></div> : (
            <div className="tm-test-grid">{studentTests.map((test) => {
              const status = statusFor(test);
              const unfinished = attempts.find((attempt) => attempt.testId === test.id && !attempt.submittedAt);
              return <article className="tm-test-card" key={test.id}><div className="tm-test-card-top"><span className="tm-card-icon">▤</span><span className={"tm-status tm-status-" + status}>{status === "upcoming" ? "Coming Soon" : statusLabel(status)}</span></div><h3>{test.title}</h3><p>{test.className} · {test.subject} · {test.paperType === "written" ? "Written" : "Objective"}</p><div className="tm-card-meta"><span>◷ {test.durationMinutes} min</span><span>▦ {questionCount(test)} questions</span><span>◎ {totalMarks(test)} marks</span></div><div className="tm-card-footer"><span>{formatDate(test.startAt)}</span>{unfinished ? <button onClick={() => startExam(test, false, unfinished)}>Resume test →</button> : status === "live" ? <button onClick={() => startExam(test)}>Start test →</button> : <span className="tm-muted-action">{status === "upcoming" ? "Coming Soon" : status === "completed" ? "Exam closed" : "Unavailable"}</span>}</div></article>;
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
          <div className="tm-toolbar"><div className="tm-tabs">{filters.map((key) => <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{statusLabel(key)}<span>{counts[key]}</span></button>)}</div></div>
          {visibleTests.length === 0 ? <div className="tm-empty-state"><div>▤</div><h3>{searchQuery ? "No matching tests found" : filter === "all" ? "No tests created yet" : "No " + statusLabel(filter).toLowerCase() + " tests"}</h3><p>{searchQuery ? "Try another test name, subject or class." : "Create a test, add questions and publish it to see it in this list."}</p></div> : (
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
