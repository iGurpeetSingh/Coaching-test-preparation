import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import "./exam-management.css";

type Batch = { id: string; name: string; code: string; branch_name: string };
type Question = { id: string; question_code: string; prompt: string; question_type: string; marks: number; subject_name: string | null; topic_name: string | null };
type Paper = {
  id: string; paper_code: string; title: string; subject_name: string; batch_name: string;
  branch_name: string; duration_minutes: number; starts_at: string; ends_at: string;
  question_count: number; total_marks: number; status: string;
};
const localDateTime = (hoursFromNow: number) => {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const getError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function ExamManagementPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [batchId, setBatchId] = useState("");
  const [paperCode, setPaperCode] = useState("");
  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [duration, setDuration] = useState("60");
  const [startsAt, setStartsAt] = useState(localDateTime(24));
  const [endsAt, setEndsAt] = useState(localDateTime(26));
  const [instructions, setInstructions] = useState("Read each question carefully. Your answers are saved to the server.");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [batchResult, questionResult, paperResult] = await Promise.all([
        apiRequest<{ items: Batch[] }>("/batches"),
        apiRequest<{ items: Question[] }>("/questions?status=published"),
        apiRequest<{ items: Paper[] }>("/papers")
      ]);
      setBatches(batchResult.items);
      setQuestions(questionResult.items);
      setPapers(paperResult.items);
      if (!batchId && batchResult.items[0]) setBatchId(batchResult.items[0].id);
    } catch (cause) { setError(getError(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  function toggleQuestion(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  const selectedQuestions = questions.filter((question) => selectedIds.includes(question.id));
  const totalMarks = selectedQuestions.reduce((sum, question) => sum + Number(question.marks), 0);
  const filteredQuestions = questions.filter((question) =>
    [question.question_code, question.prompt, question.subject_name || "", question.topic_name || ""]
      .join(" ").toLowerCase().includes(search.toLowerCase())
  );

  async function createPaper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ paper: Paper }>("/papers", {
        method: "POST",
        body: JSON.stringify({
          batchId, paperCode: paperCode.trim(), title: title.trim(),
          subjectName: subjectName.trim(), durationMinutes: Number(duration),
          startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
          instructions: instructions.trim(), questionIds: selectedIds
        })
      });
      setNotice("Paper draft created: " + result.paper.paper_code);
      setPaperCode(""); setTitle(""); setSelectedIds([]);
      await loadData();
    } catch (cause) { setError(getError(cause)); }
    finally { setSaving(false); }
  }

  async function publishPaper(paper: Paper) {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/papers/${paper.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "published" }) });
      setNotice(paper.paper_code + " is now published for its assigned batch.");
      await loadData();
    } catch (cause) { setError(getError(cause)); }
    finally { setSaving(false); }
  }

  async function closePaper(paper: Paper) {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/papers/${paper.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
      setNotice(paper.paper_code + " has been closed.");
      await loadData();
    } catch (cause) { setError(getError(cause)); }
    finally { setSaving(false); }
  }

  return (
    <div className="exam-management-page">
      <div className="directory-heading"><div><span className="directory-eyebrow">PAPER GENERATOR</span><h2>Exam Papers</h2><p>Create scheduled exam papers from published questions and freeze question/answer snapshots at creation time.</p></div><div className="directory-total"><strong>{papers.length}</strong><span>papers</span></div></div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}

      <form className="directory-create-form" onSubmit={createPaper}>
        <div className="directory-form-title"><strong>Create paper draft</strong><span>Select a batch, schedule the exam and include published question-bank items.</span></div>
        <div className="directory-fields">
          <label>Batch<select value={batchId} onChange={(event) => setBatchId(event.target.value)} required><option value="">Select batch</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.branch_name}</option>)}</select></label>
          <label>Paper code<input value={paperCode} onChange={(event) => setPaperCode(event.target.value)} required maxLength={48} placeholder="PHY-MOCK-01" /></label>
          <label>Paper title<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={180} placeholder="Physics Mock Test 01" /></label>
          <label>Subject<input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required maxLength={120} placeholder="Physics" /></label>
          <label>Duration (minutes)<input type="number" min="1" max="600" value={duration} onChange={(event) => setDuration(event.target.value)} required /></label>
          <label>Starts at<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
          <label>Ends at<input type="datetime-local" min={startsAt} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></label>
          <label>Instructions<input value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={3000} /></label>
        </div>

        <div className="exam-question-picker">
          <div className="exam-question-picker-head"><div><strong>Question selection</strong><span>{selectedIds.length} selected · {totalMarks} marks</span></div><label className="directory-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search published questions…" /></label></div>
          <div className="exam-question-list">
            {filteredQuestions.map((question) => <label key={question.id} className={selectedIds.includes(question.id) ? "exam-question-option selected" : "exam-question-option"}>
              <input type="checkbox" checked={selectedIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} />
              <span><strong>{question.question_code}</strong><small>{question.prompt}</small></span>
              <span className="exam-question-meta">{question.question_type.replaceAll("_", " ")} · {question.marks} marks</span>
            </label>)}
            {!filteredQuestions.length && <div className="directory-empty">No published questions are available. Create and publish questions in the Question Bank first.</div>}
          </div>
        </div>
        <button className="directory-primary" type="submit" disabled={saving || !batches.length || !selectedIds.length}>{saving ? "Creating…" : "Create paper draft"}</button>
      </form>

      <section className="directory-table-card">
        <div className="exam-list-heading"><strong>Paper schedule</strong><span>{papers.length} records</span></div>
        {loading ? <div className="directory-empty">Loading exam papers…</div> : <div className="directory-table-scroll"><table><thead><tr><th>PAPER</th><th>BATCH / BRANCH</th><th>DATE / WINDOW</th><th>QUESTIONS</th><th>MARKS</th><th>STATUS</th><th></th></tr></thead><tbody>
          {papers.map((paper) => <tr key={paper.id}>
            <td><strong>{paper.title}</strong><small>{paper.paper_code} · {paper.subject_name}</small></td>
            <td>{paper.batch_name}<small>{paper.branch_name}</small></td>
            <td>{new Date(paper.starts_at).toLocaleString("en-IN")}<small>Ends {new Date(paper.ends_at).toLocaleString("en-IN")}</small></td>
            <td>{paper.question_count}</td><td>{paper.total_marks}</td>
            <td><span className={paper.status === "published" ? "directory-status active" : "directory-status inactive"}>{paper.status}</span></td>
            <td>{paper.status === "draft" && <button className="directory-row-action" disabled={saving} onClick={() => void publishPaper(paper)}>Publish</button>}
              {paper.status === "published" && <button className="directory-row-action" disabled={saving} onClick={() => void closePaper(paper)}>Close</button>}</td>
          </tr>)}
        </tbody></table>{!papers.length && <div className="directory-empty">No papers created yet.</div>}</div>}
      </section>
    </div>
  );
}
