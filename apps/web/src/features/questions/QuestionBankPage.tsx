import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import "./question-bank-page.css";

type Subject = { id: string; code: string; name: string; is_active: boolean };
type Chapter = { id: string; subject_id: string; code: string; name: string; is_active: boolean };
type Topic = { id: string; chapter_id: string; code: string; name: string; is_active: boolean };
type Question = {
  id: string; question_code: string; question_type: string; difficulty: string;
  prompt: string; options: Array<{ id: string; text: string }>; explanation: string | null;
  marks: number; status: string; version: number; subject_name: string | null;
  chapter_name: string | null; topic_name: string | null;
};
const getMessage = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function QuestionBankPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [subjectCode, setSubjectCode] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [chapterCode, setChapterCode] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [topicCode, setTopicCode] = useState("");
  const [topicName, setTopicName] = useState("");

  const [prompt, setPrompt] = useState("");
  const [questionType, setQuestionType] = useState("single_choice");
  const [difficulty, setDifficulty] = useState("medium");
  const [marks, setMarks] = useState("1");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [answerKey, setAnswerKey] = useState("A");
  const [explanation, setExplanation] = useState("");

  async function loadBase() {
    setLoading(true); setError("");
    try {
      const [syllabus, questionResult] = await Promise.all([
        apiRequest<{ subjects: Subject[]; chapters: Chapter[]; topics: Topic[] }>("/syllabus"),
        apiRequest<{ items: Question[] }>("/questions")
      ]);
      setSubjects(syllabus.subjects); setChapters(syllabus.chapters); setTopics(syllabus.topics);
      setQuestions(questionResult.items);
      if (!subjectId && syllabus.subjects[0]) setSubjectId(syllabus.subjects[0].id);
      if (!chapterId && syllabus.chapters[0]) setChapterId(syllabus.chapters[0].id);
      if (!topicId && syllabus.topics[0]) setTopicId(syllabus.topics[0].id);
    } catch (cause) { setError(getMessage(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadBase(); }, []);

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ subject: Subject }>("/syllabus/subjects", {
        method: "POST", body: JSON.stringify({ code: subjectCode.trim(), name: subjectName.trim() })
      });
      setSubjectCode(""); setSubjectName(""); setSubjectId(result.subject.id);
      setNotice("Subject created.");
      await loadBase();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  async function createChapter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ chapter: Chapter }>("/syllabus/chapters", {
        method: "POST", body: JSON.stringify({ subjectId, code: chapterCode.trim(), name: chapterName.trim() })
      });
      setChapterCode(""); setChapterName(""); setChapterId(result.chapter.id);
      setNotice("Chapter created.");
      await loadBase();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ topic: Topic }>("/syllabus/topics", {
        method: "POST", body: JSON.stringify({ chapterId, code: topicCode.trim(), name: topicName.trim() })
      });
      setTopicCode(""); setTopicName(""); setTopicId(result.topic.id);
      setNotice("Topic created.");
      await loadBase();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const objective = ["single_choice", "multiple_choice"].includes(questionType);
      const options = objective ? [
        { id: "A", text: optionA.trim() }, { id: "B", text: optionB.trim() },
        { id: "C", text: optionC.trim() }, { id: "D", text: optionD.trim() }
      ] : undefined;
      const result = await apiRequest<{ question: Question }>("/questions", {
        method: "POST",
        body: JSON.stringify({
          topicId: topicId || null, questionType, difficulty, marks: Number(marks),
          prompt: prompt.trim(), options,
          answerKey: questionType === "single_choice" ? answerKey
            : questionType === "multiple_choice" ? [answerKey]
            : questionType === "true_false" ? answerKey === "true" : null,
          explanation: explanation.trim() || null
        })
      });
      setPrompt(""); setOptionA(""); setOptionB(""); setOptionC(""); setOptionD(""); setExplanation("");
      setNotice("Question saved as draft: " + result.question.question_code);
      await loadBase();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  async function updateQuestionStatus(question: Question, status: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/questions/${question.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setNotice(question.question_code + " moved to " + status + ".");
      await loadBase();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  const visibleQuestions = questions.filter((question) =>
    [question.prompt, question.question_code, question.subject_name || "", question.topic_name || ""]
      .join(" ").toLowerCase().includes(search.toLowerCase())
  );
  const objective = ["single_choice", "multiple_choice"].includes(questionType);

  return (
    <div className="question-bank-page">
      <div className="directory-heading">
        <div><span className="directory-eyebrow">ASSESSMENT AUTHORING</span><h2>Question Bank</h2><p>Build a reusable syllabus-linked question bank and manage review and publication status.</p></div>
        <div className="directory-total"><strong>{questions.length}</strong><span>questions</span></div>
      </div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}

      <section className="qb-panel">
        <div className="qb-panel-heading"><strong>Syllabus structure</strong><span>Subject → Chapter → Topic</span></div>
        <div className="qb-syllabus-grid">
          <form onSubmit={createSubject}>
            <label>Subject code<input value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} required maxLength={32} placeholder="PHY" /></label>
            <label>Subject name<input value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required maxLength={120} placeholder="Physics" /></label>
            <button className="directory-primary" disabled={saving}>Add subject</button>
          </form>
          <form onSubmit={createChapter}>
            <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Select subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
            <label>Chapter code<input value={chapterCode} onChange={(event) => setChapterCode(event.target.value)} required maxLength={32} placeholder="PHY-01" /></label>
            <label>Chapter name<input value={chapterName} onChange={(event) => setChapterName(event.target.value)} required maxLength={160} placeholder="Motion" /></label>
            <button className="directory-primary" disabled={saving || !subjectId}>Add chapter</button>
          </form>
          <form onSubmit={createTopic}>
            <label>Chapter<select value={chapterId} onChange={(event) => setChapterId(event.target.value)} required><option value="">Select chapter</option>{chapters.filter((item) => !subjectId || item.subject_id === subjectId).map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.name}</option>)}</select></label>
            <label>Topic code<input value={topicCode} onChange={(event) => setTopicCode(event.target.value)} required maxLength={32} placeholder="PHY-01-01" /></label>
            <label>Topic name<input value={topicName} onChange={(event) => setTopicName(event.target.value)} required maxLength={160} placeholder="Speed and velocity" /></label>
            <button className="directory-primary" disabled={saving || !chapterId}>Add topic</button>
          </form>
        </div>
        <div className="qb-syllabus-summary">{subjects.length} subjects · {chapters.length} chapters · {topics.length} topics</div>
      </section>

      <form className="directory-create-form" onSubmit={createQuestion}>
        <div className="directory-form-title"><strong>Add question</strong><span>New questions are saved as draft and must pass review before publishing.</span></div>
        <div className="directory-fields">
          <label>Topic<select value={topicId} onChange={(event) => setTopicId(event.target.value)}><option value="">Unmapped topic</option>{topics.filter((item) => !chapterId || item.chapter_id === chapterId).map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}</select></label>
          <label>Question type<select value={questionType} onChange={(event) => setQuestionType(event.target.value)}><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="true_false">True / False</option><option value="short_answer">Short answer</option><option value="long_answer">Long answer</option></select></label>
          <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
          <label>Marks<input type="number" min="0.25" max="100000" step="0.25" value={marks} onChange={(event) => setMarks(event.target.value)} required /></label>
        </div>
        <label className="qb-prompt-label">Question prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required maxLength={12000} rows={3} placeholder="Enter the complete question…" /></label>
        {objective && <div className="qb-options-grid">
          <label>Option A<input value={optionA} onChange={(event) => setOptionA(event.target.value)} required maxLength={1000} /></label>
          <label>Option B<input value={optionB} onChange={(event) => setOptionB(event.target.value)} required maxLength={1000} /></label>
          <label>Option C<input value={optionC} onChange={(event) => setOptionC(event.target.value)} required maxLength={1000} /></label>
          <label>Option D<input value={optionD} onChange={(event) => setOptionD(event.target.value)} required maxLength={1000} /></label>
          <label>Correct option<select value={answerKey} onChange={(event) => setAnswerKey(event.target.value)}><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select></label>
        </div>}
        {questionType === "true_false" && <label className="qb-inline-field">Correct answer<select value={answerKey} onChange={(event) => setAnswerKey(event.target.value)}><option value="true">True</option><option value="false">False</option></select></label>}
        <label className="qb-prompt-label">Explanation (optional)<textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} maxLength={4000} placeholder="Explain the correct answer…" /></label>
        <button className="directory-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save question draft"}</button>
      </form>

      <section className="directory-table-card">
        <div className="qb-panel-heading"><strong>Question library</strong><span>{visibleQuestions.length} shown</span></div>
        <div className="directory-toolbar"><label className="directory-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search question, subject, topic or code…" /></label></div>
        {loading ? <div className="directory-empty">Loading question bank…</div> : <div className="directory-table-scroll"><table><thead><tr><th>QUESTION</th><th>SYLLABUS</th><th>TYPE / LEVEL</th><th>MARKS</th><th>VERSION</th><th>STATUS</th><th></th></tr></thead><tbody>
          {visibleQuestions.map((question) => <tr key={question.id}>
            <td><strong>{question.question_code}</strong><small>{question.prompt}</small></td>
            <td>{question.subject_name || "—"}<small>{question.topic_name || question.chapter_name || "Unmapped"}</small></td>
            <td>{question.question_type.replaceAll("_", " ")}<small>{question.difficulty}</small></td>
            <td>{question.marks}</td><td>v{question.version}</td>
            <td><span className={question.status === "published" ? "directory-status active" : "directory-status inactive"}>{question.status}</span></td>
            <td>{question.status === "draft" && <button className="directory-row-action" disabled={saving} onClick={() => void updateQuestionStatus(question, "review")}>Send review</button>}
              {question.status === "review" && <button className="directory-row-action" disabled={saving} onClick={() => void updateQuestionStatus(question, "published")}>Publish</button>}
              {question.status === "published" && <button className="directory-row-action" disabled={saving} onClick={() => void updateQuestionStatus(question, "archived")}>Archive</button>}</td>
          </tr>)}
        </tbody></table>{!visibleQuestions.length && <div className="directory-empty">No questions found. Start by adding a subject and a question.</div>}</div>}
      </section>
    </div>
  );
}
