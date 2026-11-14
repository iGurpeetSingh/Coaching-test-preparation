import { useCallback, useEffect, useMemo, useState } from "react";
import "./student-exams.css";

type PaperType = "objective" | "written";

type ObjectiveQuestion = {
  prompt: string;
  options: string[];
  marks?: number;
};

type WrittenQuestion = {
  prompt: string;
  marks: number;
};

type PublishedPaper = {
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

function isAvailable(paper: PublishedPaper): boolean {
  const start = new Date(paper.startAt).getTime();
  return Number.isFinite(start) && Date.now() >= start;
}

export default function StudentExamLibrary({ searchQuery = "" }: { searchQuery?: string }) {
  const [papers, setPapers] = useState<PublishedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<PaperType | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadPapers = useCallback(async (manual = false) => {
    if (!API_BASE_URL) {
      setPapers([]);
      setError("Exam service is not connected yet.");
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
      setExpanded(null);
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
          const available = paper ? isAvailable(paper) : false;
          const opened = expanded === card.type && available;

          return (
            <article className="student-exam-card" key={card.type}>
              <div className="student-exam-card-top">
                <span className="student-exam-icon" aria-hidden="true">{card.icon}</span>
                <span className={available ? "student-exam-status is-published" : "student-exam-status"}>
                  {available ? "Published" : "Coming Soon"}
                </span>
              </div>
              <h2>{paper && available ? paper.title : card.title}</h2>
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
              {paper?.instructions && available && (
                <p className="student-exam-instructions">{paper.instructions}</p>
              )}
              {available && paper ? (
                <button
                  type="button"
                  className="student-exam-open"
                  onClick={() => setExpanded(opened ? null : card.type)}
                >
                  {opened ? "Hide paper" : "View published paper"}
                  <span aria-hidden="true">{opened ? "↑" : "→"}</span>
                </button>
              ) : (
                <div className="student-exam-coming-note">
                  {paper ? `Available from ${formatDate(paper.startAt)}` : "This exam will appear here after it is published."}
                </div>
              )}

              {opened && paper && (
                <div className="student-exam-paper-content">
                  {card.type === "objective" ? (
                    (paper.questions || []).map((question, index) => (
                      <div className="student-exam-question" key={index}>
                        <div><strong>Q{index + 1}. {question.prompt}</strong><span>{question.marks ?? 2} marks</span></div>
                        <ol type="A">
                          {(question.options || []).map((option, optionIndex) => (
                            <li key={optionIndex}>{option}</li>
                          ))}
                        </ol>
                      </div>
                    ))
                  ) : (
                    (paper.writtenQuestions || []).map((question, index) => (
                      <div className="student-exam-question" key={index}>
                        <div><strong>Q{index + 1}. {question.prompt}</strong><span>{question.marks} marks</span></div>
                      </div>
                    ))
                  )}
                  {card.type === "objective" && !paper.questions?.length && (
                    <p className="student-exam-empty">No objective questions were included in this paper.</p>
                  )}
                  {card.type === "written" && !paper.writtenQuestions?.length && (
                    <p className="student-exam-empty">No written questions were included in this paper.</p>
                  )}
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
