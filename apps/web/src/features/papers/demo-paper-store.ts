export type PaperType = "objective" | "written";

export type ObjectiveQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  marks: 2;
};

export type WrittenQuestion = {
  id: string;
  prompt: string;
  marks: 2 | 4 | 6;
};

export type DemoPaper = {
  id: string;
  paperType: PaperType;
  title: string;
  subject: string;
  className: string;
  startAt: string;
  durationMinutes: number;
  instructions: string;
  questions?: ObjectiveQuestion[];
  writtenQuestions?: WrittenQuestion[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
};

export type DemoAttemptStatus = "in_progress" | "evaluated" | "awaiting_marking" | "graded";

export type DemoAttempt = {
  attemptId: string;
  paperId: string;
  paper: DemoPaper;
  studentName: string;
  rollNumber: string;
  startedAt: string;
  expiresAt: string;
  answers: Record<string, number | string>;
  status: DemoAttemptStatus;
  submittedAt?: string;
  score: number | null;
  totalMarks: number;
  correctCount?: number;
  incorrectCount?: number;
  unansweredCount?: number;
  marksByQuestion?: number[];
  gradedAt?: string;
};

const PAPER_STORAGE_KEY = "coaching_demo_papers_v1";
const ATTEMPT_STORAGE_KEY = "coaching_demo_attempts_v1";
export const DEMO_PAPER_EVENT = "coaching-demo-papers-updated";

function makeId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + "_" + random;
}

function readArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, rows: T[]): void {
  window.localStorage.setItem(key, JSON.stringify(rows));
}

function notifyStore(): void {
  window.dispatchEvent(new CustomEvent(DEMO_PAPER_EVENT));
}

export function getDemoPapers(): DemoPaper[] {
  return readArray<DemoPaper>(PAPER_STORAGE_KEY).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getLatestDemoPaper(paperType: PaperType): DemoPaper | null {
  return getDemoPapers().find((paper) => paper.paperType === paperType) || null;
}

export function getPublishedDemoPapers(): DemoPaper[] {
  const latestByType = (["objective", "written"] as const)
    .map((type) => getLatestDemoPaper(type))
    .filter((paper): paper is DemoPaper => Boolean(paper && paper.published));
  return latestByType;
}

export function saveDemoPaper(input: Omit<DemoPaper, "createdAt" | "updatedAt"> & { createdAt?: string }): DemoPaper {
  const rows = readArray<DemoPaper>(PAPER_STORAGE_KEY);
  const now = new Date().toISOString();
  const existing = rows.find((paper) => paper.id === input.id);
  const saved: DemoPaper = {
    ...input,
    createdAt: input.createdAt || existing?.createdAt || now,
    updatedAt: now,
  };
  const next = rows.filter((paper) => paper.id !== saved.id);
  next.push(saved);
  writeArray(PAPER_STORAGE_KEY, next);
  notifyStore();
  return saved;
}

export function setDemoPaperPublished(paperId: string, published: boolean): DemoPaper | null {
  const rows = readArray<DemoPaper>(PAPER_STORAGE_KEY);
  const index = rows.findIndex((paper) => paper.id === paperId);
  if (index < 0) return null;
  const updated: DemoPaper = {
    ...rows[index],
    published,
    publishedAt: published ? new Date().toISOString() : rows[index].publishedAt,
    updatedAt: new Date().toISOString(),
  };
  rows[index] = updated;
  writeArray(PAPER_STORAGE_KEY, rows);
  notifyStore();
  return updated;
}

export function createDemoAttempt(
  paper: DemoPaper,
  studentName: string,
  rollNumber: string
): DemoAttempt {
  const now = Date.now();
  const startsAt = new Date(paper.startAt).getTime();
  if (!paper.published) throw new Error("This paper is not published.");
  if (!Number.isFinite(startsAt)) throw new Error("The exam schedule is invalid.");
  if (now < startsAt) throw new Error("This exam is scheduled for " + new Date(startsAt).toLocaleString() + ".");
  if (now >= startsAt + paper.durationMinutes * 60_000) throw new Error("The scheduled exam window has ended.");

  const attempt: DemoAttempt = {
    attemptId: makeId("attempt"),
    paperId: paper.id,
    paper: JSON.parse(JSON.stringify(paper)) as DemoPaper,
    studentName: studentName.trim(),
    rollNumber: rollNumber.trim(),
    startedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + paper.durationMinutes * 60_000).toISOString(),
    answers: {},
    status: "in_progress",
    score: null,
    totalMarks: 100,
  };
  const rows = readArray<DemoAttempt>(ATTEMPT_STORAGE_KEY);
  rows.push(attempt);
  writeArray(ATTEMPT_STORAGE_KEY, rows);
  notifyStore();
  return attempt;
}

export function getDemoAttempts(paperId?: string): DemoAttempt[] {
  return readArray<DemoAttempt>(ATTEMPT_STORAGE_KEY)
    .filter((attempt) => !paperId || attempt.paperId === paperId)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function getDemoAttempt(attemptId: string): DemoAttempt | null {
  return readArray<DemoAttempt>(ATTEMPT_STORAGE_KEY).find((attempt) => attempt.attemptId === attemptId) || null;
}

export function saveDemoAttemptAnswers(
  attemptId: string,
  answers: Record<string, number | string>
): DemoAttempt | null {
  const rows = readArray<DemoAttempt>(ATTEMPT_STORAGE_KEY);
  const index = rows.findIndex((attempt) => attempt.attemptId === attemptId);
  if (index < 0 || rows[index].status !== "in_progress") return null;
  rows[index] = { ...rows[index], answers };
  writeArray(ATTEMPT_STORAGE_KEY, rows);
  notifyStore();
  return rows[index];
}

export function submitDemoAttempt(attemptId: string): DemoAttempt | null {
  const rows = readArray<DemoAttempt>(ATTEMPT_STORAGE_KEY);
  const index = rows.findIndex((attempt) => attempt.attemptId === attemptId);
  if (index < 0) return null;
  const attempt = rows[index];
  if (attempt.status !== "in_progress") return attempt;

  const submittedAt = new Date().toISOString();
  if (attempt.paper.paperType === "objective") {
    const questions = attempt.paper.questions || [];
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let score = 0;
    questions.forEach((question, questionIndex) => {
      const answer = attempt.answers[String(questionIndex)];
      if (answer === undefined) {
        unansweredCount += 1;
      } else if (answer === question.correctIndex) {
        correctCount += 1;
        score += question.marks;
      } else {
        incorrectCount += 1;
      }
    });
    rows[index] = {
      ...attempt,
      status: "evaluated",
      submittedAt,
      score,
      totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
      correctCount,
      incorrectCount,
      unansweredCount,
    };
  } else {
    rows[index] = { ...attempt, status: "awaiting_marking", submittedAt, score: null };
  }
  writeArray(ATTEMPT_STORAGE_KEY, rows);
  notifyStore();
  return rows[index];
}

export function gradeDemoWrittenAttempt(attemptId: string, marksByQuestion: number[]): DemoAttempt | null {
  const rows = readArray<DemoAttempt>(ATTEMPT_STORAGE_KEY);
  const index = rows.findIndex((attempt) => attempt.attemptId === attemptId);
  if (index < 0) return null;
  const attempt = rows[index];
  if (attempt.paper.paperType !== "written" || attempt.status !== "awaiting_marking") {
    throw new Error("This written submission is not awaiting marking.");
  }
  const questions = attempt.paper.writtenQuestions || [];
  if (marksByQuestion.length !== questions.length) throw new Error("Enter marks for every written question.");
  let score = 0;
  marksByQuestion.forEach((mark, questionIndex) => {
    if (!Number.isInteger(mark) || mark < 0 || mark > questions[questionIndex].marks) {
      throw new Error("Marks for question " + (questionIndex + 1) + " must be between 0 and " + questions[questionIndex].marks + ".");
    }
    score += mark;
  });
  rows[index] = {
    ...attempt,
    status: "graded",
    score,
    marksByQuestion,
    gradedAt: new Date().toISOString(),
  };
  writeArray(ATTEMPT_STORAGE_KEY, rows);
  notifyStore();
  return rows[index];
}

export function clearDemoExamData(): void {
  window.localStorage.removeItem(PAPER_STORAGE_KEY);
  window.localStorage.removeItem(ATTEMPT_STORAGE_KEY);
  notifyStore();
}
