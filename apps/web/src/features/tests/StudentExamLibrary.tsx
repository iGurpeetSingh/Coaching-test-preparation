import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEMO_PAPER_EVENT,
  getPublishedDemoPapers,
  type DemoPaper,
  type PaperType,
} from "../papers/demo-paper-store";
import StudentExamRunner from "./StudentExamRunner";
import "./student-exams.css";

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

function examState(paper: DemoPaper | null): "coming" | "live" | "closed" {
  if (!paper) return "coming";
  const start = new Date(paper.startAt).getTime();
  if (!Number.isFinite(start)) return "coming";
  if (Date.now() < start) return "coming";
  const end = start + Math.max(1, paper.durationMinutes) * 60_000;
  return Date.now() < end ? "live" : "closed";
}

export default function StudentExamLibrary({ searchQuery = "" }: { searchQuery?: string }) {
  const [papers, setPapers] = useState<DemoPaper[]>([]);
  const [activePaper, setActivePaper] = useState<DemoPaper | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshPapers = useCallback(() => {
    setPapers(getPublishedDemoPapers());
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    refreshPapers();
    const handleUpdate = () => refreshPapers();
    window.addEventListener(DEMO_PAPER_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    const poll = window.setInterval(refreshPapers, 5000);
    return () => {
      window.removeEventListener(DEMO_PAPER_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
      window.clearInterval(poll);
    };
  }, [refreshPapers]);

  useEffect(() => {
    const clock = window.setInterval(() => setLastUpdated(new Date()), 15_000);
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
        onClose={() => {
          setActivePaper(null);
          refreshPapers();
        }}
      />
    );
  }

  return (
    <section className="student-exams-page">
      <div className="student-exams-heading">
        <div>
          <span className="student-exams-eyebrow">STUDENT EXAM PORTAL · DEMO MODE</span>
          <h1>Exams</h1>
          <p>Choose the exam type assigned to your class or batch.</p>
        </div>
        <button className="student-exams-refresh" type="button" onClick={refreshPapers}>
          <span aria-hidden="true">↻</span> Refresh papers
        </button>
      </div>

      <div className="student-exams-sync" aria-live="polite">
        <span className="student-exams-dot" />
        {lastUpdated
          ? `Demo papers synced at ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "Checking demo papers..."}
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
                <button type="button" className="student-exam-open" onClick={() => setActivePaper(paper)}>
                  Start Exam <span aria-hidden="true">→</span>
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

      {visibleCards.length === 0 && <div className="student-exam-empty-state">No exam types match this search.</div>}
      <p className="student-exam-demo-note">
        Demo mode: papers and attempts are saved in this browser only. Use the same browser profile for Paper Management and Student Exams.
      </p>
    </section>
  );
}
