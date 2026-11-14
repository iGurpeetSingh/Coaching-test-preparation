import { useCallback, useEffect, useMemo, useState } from "react";
import StudentExamRunner, { type ExamPaper } from "./StudentExamRunner";
import "./student-exams.css";

type PaperType = "objective" | "written";
type PublishedPaper = ExamPaper;
type PublishedResponse = { items?: PublishedPaper[] };

const API_BASE_URL = (import.meta.env.VITE_EXAMS_API_URL || "").trim().replace(/\/+$/, "");

const PAPER_CARDS: Array<{
  type: PaperType;
  title: string;
  description: string;
  icon: string;
  marks: string;
}> = [
  {
    type: "objective",
    title: "Objective Exam",
    description: "Multiple-choice questions",
    icon: "◉",
    marks: "50 questions · 100 marks",
  },
  {
    type: "written",
    title: "Written Exam",
    description: "Descriptive and written answers",
    icon: "✎",
    marks: "2, 4 and 6 mark questions · 100 marks",
  },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Schedule not available";
  return date.toLocaleString([], {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function examState(paper: PublishedPaper | null): "coming" | "live" | "closed" {
  if (!paper) return "coming";
  const start = new Date(paper.startAt).getTime();
  if (!Number.isFinite(start)) return "coming";
  if (Date.now() < start) return "coming";
  const end = start + Math.max(1, paper.durationMinutes) * 60 * 1000;
  return Date.now() < end ? "live" : "closed";
}

export default function StudentExamLibrary({ searchQuery = "" }: { searchQuery?: string }) {
  const [papers, setPapers] = useState<PublishedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activePaper, setActivePaper] = useState<PublishedPaper | null>(null);
  const [, setClock] = useState(Date.now());

  const loadPapers = useCallback(async (manual = false) => {
    if (!API_BASE_URL) {
      setPapers([]);
      setError("Exam service is not connected yet. The API URL must be configured by the site administrator.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch(API_BASE_URL + "/api/exams/published", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(response.status === 503
          ? "Exam service is not configured yet."
          : "Published papers could not be loaded. Please refresh again.");
      }
      const data = (await response.json()) as PublishedResponse;
      setPapers(Array.isArray(data.items) ? data.items : []);
      setLastUpdated(new Date());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to the exam service.");
      setPapers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPapers();
  }, [loadPapers]);

  useEffect(() => {
    const clock = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(clock);
  }, []);

  const visibleCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return PAPER_CARDS.map((card) => ({
      ...card,
      paper: papers.find((paper) => paper.paperType === card.type) || null,
    })).filter(({ title, paper }) => {
      if (!query) return true;
      return title.toLowerCase().includes(query) ||
        (paper?.title || "").toLowerCase().includes(query) ||
        (paper?.subject || "").toLowerCase().includes(query) ||
        (paper?.className || "").toLowerCase().includes(query);
    });
  }, [papers, searchQuery]);

  if (activePaper) {
    return (
      <StudentExamRunner
        paper={activePaper}
        apiBaseUrl={API_BASE_URL}
        onClose={() => {
          setActivePaper(null);
          void loadPapers(true);
        }}
      />
    );
  }

  return (
    <section className="student-exams-page">
      <div className="student-exams-heading">
        <div>
          <span className="student-exams-eyebrow">STUDENT EXAM PORTAL</span>
          <h1>Exams</h1>
          <p>Choose the exam type assigned to your class or batch.</p>
        </div>
        <button
          className="student-exams-refresh"
          type="button"
          onClick={() => void loadPapers(true)}
          disabled={loading || refreshing}
        >
          <span aria-hidden="true">↻</span>
          {refreshing ? "Refreshing..." : "Refresh papers"}
        </button>
      </div>

      <div className="student-exams-sync" aria-live="polite">
        <span className={loading || refreshing ? "student-exams-dot is-loading" : "student-exams-dot"} />
        {loading
          ? "Checking published papers..."
          : lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Paper availability"}
      </div>

      <div className="student-exams-grid">
        {visibleCards.map((card) => {
          const paper = card.paper;
          const state = examState(paper);
          const status = state === "live" ? "Published" : state === "closed" ? "Exam Closed" : "Coming Soon";

          return (
            <article className="student-exam-card" key={card.type}>
              <div className="student-exam-card-top">
                <span className="student-exam-icon" aria-hidden="true">{card.icon}</span>
                <span className={state === "live" ? "student-exam-status is-published" : "student-exam-status"}>
                  {status}
                </span>
              </div>
              <h2>{paper ? paper.title : card.title}</h2>
              <p className="student-exam-description">{card.description}</p>
              <div className="student-exam-meta">
                <span>{card.marks}</span>
                {paper && (
                  <>
                    <span>{paper.subject}</span>
                    <span>{paper.className}</span>
                    <span>{paper.durationMinutes} minutes</span>
                    <span>Scheduled: {formatDate(paper.startAt)}</span>
                  </>
                )}
              </div>
              {state === "live" && paper ? (
                <button
                  type="button"
                  className="student-exam-open"
                  onClick={() => setActivePaper(paper)}
                >
                  Start Exam
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <div className="student-exam-coming-note">
                  {state === "closed" && paper
                    ? "The scheduled exam window has ended."
                    : paper
                      ? `Available from ${formatDate(paper.startAt)}`
                      : "This exam will appear here after it is published."}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {visibleCards.length === 0 && (
        <div className="student-exam-empty-state">No exam types match this search.</div>
      )}
      {error && <p className="student-exam-connection-note" role="status">{error}</p>}
    </section>
  );
}
