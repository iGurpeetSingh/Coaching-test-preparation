import { useMemo, useState } from "react";
import "./paper-builder.css";

type Difficulty = "Easy" | "Medium" | "Hard";
type Question = {
  id: string;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  answer: string;
  marks: number;
};
type BlueprintRule = {
  topic: string;
  easy: number;
  medium: number;
  hard: number;
};

const questionBank: Question[] = [
  { id: "PHY-001", topic: "Current Electricity", difficulty: "Easy", prompt: "The SI unit of electric current is:", options: ["Volt", "Ampere", "Ohm", "Watt"], answer: "Ampere", marks: 2 },
  { id: "PHY-002", topic: "Current Electricity", difficulty: "Easy", prompt: "Which instrument is used to measure electric current?", options: ["Voltmeter", "Ammeter", "Galvanometer only", "Barometer"], answer: "Ammeter", marks: 2 },
  { id: "PHY-003", topic: "Current Electricity", difficulty: "Medium", prompt: "A 10 Ω resistor is connected to a 5 V source. The current is:", options: ["0.2 A", "0.5 A", "2 A", "5 A"], answer: "0.5 A", marks: 2 },
  { id: "PHY-004", topic: "Current Electricity", difficulty: "Medium", prompt: "Two resistors of 4 Ω and 6 Ω are connected in series. Their equivalent resistance is:", options: ["2 Ω", "10 Ω", "24 Ω", "1.5 Ω"], answer: "10 Ω", marks: 2 },
  { id: "PHY-005", topic: "Current Electricity", difficulty: "Hard", prompt: "A wire is stretched to twice its original length, keeping volume constant. Its resistance becomes:", options: ["R/2", "2R", "4R", "R/4"], answer: "4R", marks: 2 },
  { id: "PHY-006", topic: "Magnetism", difficulty: "Easy", prompt: "The SI unit of magnetic field is:", options: ["Tesla", "Weber", "Henry", "Farad"], answer: "Tesla", marks: 2 },
  { id: "PHY-007", topic: "Magnetism", difficulty: "Medium", prompt: "The magnetic force on a moving charge is maximum when its velocity is:", options: ["Parallel to the field", "Opposite to the field", "Perpendicular to the field", "Zero"], answer: "Perpendicular to the field", marks: 2 },
  { id: "PHY-008", topic: "Magnetism", difficulty: "Hard", prompt: "The magnetic field at the centre of a circular current loop is proportional to:", options: ["Radius", "Current divided by radius", "Radius squared", "Resistance only"], answer: "Current divided by radius", marks: 2 },
  { id: "PHY-009", topic: "Electromagnetic Induction", difficulty: "Easy", prompt: "The phenomenon of producing emf by changing magnetic flux is called:", options: ["Electrolysis", "Induction", "Polarisation", "Rectification"], answer: "Induction", marks: 2 },
  { id: "PHY-010", topic: "Electromagnetic Induction", difficulty: "Medium", prompt: "According to Lenz's law, induced current opposes the:", options: ["Resistance", "Change causing it", "Conductor length", "Charge carrier"], answer: "Change causing it", marks: 2 },
  { id: "PHY-011", topic: "Electromagnetic Induction", difficulty: "Hard", prompt: "A coil has 100 turns and flux changes by 0.02 Wb in 0.1 s. The magnitude of induced emf is:", options: ["2 V", "10 V", "20 V", "200 V"], answer: "20 V", marks: 2 },
  { id: "PHY-012", topic: "Current Electricity", difficulty: "Medium", prompt: "For an ohmic conductor at constant temperature, the V-I graph is:", options: ["A straight line through origin", "A circle", "A parabola", "A horizontal line"], answer: "A straight line through origin", marks: 2 }
];

const initialRules: BlueprintRule[] = [
  { topic: "Current Electricity", easy: 1, medium: 2, hard: 1 },
  { topic: "Magnetism", easy: 1, medium: 1, hard: 0 },
  { topic: "Electromagnetic Induction", easy: 0, medium: 1, hard: 0 }
];

function difficultyLabel(value: Difficulty) {
  return value.toLowerCase();
}

type Props = { initialMode?: "automatic" | "manual"; onBack: () => void };

export default function PaperBuilder({ initialMode = "automatic", onBack }: Props) {
  const [mode, setMode] = useState<"automatic" | "manual">(initialMode);
  const [title, setTitle] = useState("Physics Mock Test 01");
  const [course, setCourse] = useState("Class 12");
  const [subject, setSubject] = useState("Physics");
  const [duration, setDuration] = useState(60);
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [rules, setRules] = useState<BlueprintRule[]>(initialRules);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [paper, setPaper] = useState<Question[]>([]);
  const [showAnswers, setShowAnswers] = useState(false);
  const [message, setMessage] = useState("");
  const totalRequested = useMemo(
    () => rules.reduce((sum, rule) => sum + rule.easy + rule.medium + rule.hard, 0),
    [rules]
  );
  const totalMarks = paper.reduce((sum, question) => sum + question.marks, 0);
  const availableCount = questionBank.length;

  function updateRule(topic: string, key: "easy" | "medium" | "hard", value: number) {
    setRules((current) => current.map((rule) => rule.topic === topic ? { ...rule, [key]: Math.max(0, Math.min(50, value || 0)) } : rule));
    setPaper([]);
    setMessage("");
  }

  function generateAutomatic() {
    const selected: Question[] = [];
    const shortages: string[] = [];
    const selectedIds = new Set<string>();
    for (const rule of rules) {
      const targets: Array<[Difficulty, number]> = [
        ["Easy", rule.easy],
        ["Medium", rule.medium],
        ["Hard", rule.hard]
      ];
      for (const [difficulty, count] of targets) {
        const candidates = questionBank
          .filter((item) => item.topic === rule.topic && item.difficulty === difficulty && !selectedIds.has(item.id))
          .sort((a, b) => a.id.localeCompare(b.id));
        const chosen = candidates.slice(0, count);
        chosen.forEach((item) => {
          selected.push(item);
          selectedIds.add(item.id);
        });
        if (chosen.length < count) {
          shortages.push(rule.topic + " · " + difficulty + ": needed " + count + ", available " + chosen.length);
        }
      }
    }
    if (shortages.length > 0) {
      setPaper([]);
      setMessage("Not enough approved sample questions to satisfy this blueprint. " + shortages.join(" | "));
      return;
    }
    setPaper(selected);
    setShowAnswers(false);
    setMessage("Paper generated from " + selected.length + " eligible questions. Review it before publishing.");
  }

  function generateManual() {
    const chosen = questionBank.filter((item) => manualIds.includes(item.id));
    if (chosen.length === 0) {
      setMessage("Select at least one question before creating the paper.");
      return;
    }
    setPaper(chosen);
    setShowAnswers(false);
    setMessage("Manual paper assembled with " + chosen.length + " selected questions.");
  }

  function toggleManual(id: string) {
    setManualIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <div className="paper-builder">
      <div className="builder-toolbar">
        <button className="back-link" onClick={onBack}>← Dashboard</button>
        <div className="builder-actions">
          <span className="draft-tag">DRAFT</span>
          <button className="secondary-button" disabled={paper.length === 0} onClick={() => setShowAnswers((value) => !value)}>{showAnswers ? "Hide answer key" : "View answer key"}</button>
          <button className="print-button" disabled={paper.length === 0} onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      <div className="builder-title"><div><div className="eyebrow">ASSESSMENT WORKFLOW / PAPER BUILDER</div><h1>Create question paper</h1><p>Configure the test, build a paper and review the printable version.</p></div><div className="step-chip"><span>1</span> Details <i>—</i><span>2</span> Questions <i>—</i><span>3</span> Preview</div></div>

      <div className="builder-layout">
        <section className="builder-main">
          <div className="builder-card">
            <div className="card-heading"><div><h2>Basic details</h2><p>Set the test information shown on the paper.</p></div><span className="section-number">01</span></div>
            <div className="form-grid">
              <label className="field field-wide">Test name<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="field">Course / Class<select value={course} onChange={(event) => setCourse(event.target.value)}><option>Class 12</option><option>Class 11</option><option>JEE Foundation</option><option>NEET Foundation</option></select></label>
              <label className="field">Subject<select value={subject} onChange={(event) => setSubject(event.target.value)}><option>Physics</option><option>Chemistry</option><option>Mathematics</option><option>Biology</option></select></label>
              <label className="field">Duration (minutes)<input type="number" min="5" max="300" value={duration} onChange={(event) => setDuration(Math.max(5, Number(event.target.value) || 5))} /></label>
              <label className="field checkbox-field"><input type="checkbox" checked={negativeMarking} onChange={(event) => setNegativeMarking(event.target.checked)} /> Enable negative marking <small>Scoring policy will be configured before exam publishing.</small></label>
            </div>
          </div>

          <div className="builder-card">
            <div className="card-heading"><div><h2>Select questions</h2><p>Choose manual selection or use a syllabus blueprint.</p></div><span className="section-number">02</span></div>
            <div className="mode-switch">
              <button className={mode === "automatic" ? "mode-option selected" : "mode-option"} onClick={() => { setMode("automatic"); setPaper([]); setMessage(""); }}>✦ Auto generate</button>
              <button className={mode === "manual" ? "mode-option selected" : "mode-option"} onClick={() => { setMode("manual"); setPaper([]); setMessage(""); }}>☷ Select manually</button>
            </div>

            {mode === "automatic" ? (
              <>
                <div className="blueprint-caption"><strong>Paper blueprint</strong><span>Questions required: {totalRequested}</span></div>
                <div className="blueprint-table-wrap"><table className="blueprint-table"><thead><tr><th>Chapter / Topic</th><th>Easy</th><th>Medium</th><th>Hard</th><th>Total</th></tr></thead><tbody>
                  {rules.map((rule) => <tr key={rule.topic}>
                    <td><strong>{rule.topic}</strong></td>
                    <td><input aria-label={rule.topic + " easy questions"} type="number" min="0" value={rule.easy} onChange={(event) => updateRule(rule.topic, "easy", Number(event.target.value))} /></td>
                    <td><input aria-label={rule.topic + " medium questions"} type="number" min="0" value={rule.medium} onChange={(event) => updateRule(rule.topic, "medium", Number(event.target.value))} /></td>
                    <td><input aria-label={rule.topic + " hard questions"} type="number" min="0" value={rule.hard} onChange={(event) => updateRule(rule.topic, "hard", Number(event.target.value))} /></td>
                    <td><strong>{rule.easy + rule.medium + rule.hard}</strong></td>
                  </tr>)}
                </tbody></table></div>
                <div className="bank-availability"><span>Sample approved bank: {availableCount} questions</span><span>Difficulty is separate from cognitive skill in the full bank.</span></div>
                <button className="generate-button" onClick={generateAutomatic}>✦ Generate paper</button>
              </>
            ) : (
              <>
                <div className="blueprint-caption"><strong>Available sample questions</strong><span>{manualIds.length} selected</span></div>
                <div className="manual-question-list">
                  {questionBank.map((item) => <label key={item.id} className="manual-question">
                    <input type="checkbox" checked={manualIds.includes(item.id)} onChange={() => toggleManual(item.id)} />
                    <span><strong>{item.prompt}</strong><small>{item.topic} · {item.difficulty} · {item.marks} marks</small></span>
                  </label>)}
                </div>
                <button className="generate-button" onClick={generateManual}>Create paper from selection</button>
              </>
            )}
            {message && <div className={paper.length ? "builder-message success" : "builder-message warning"} role="status">{message}</div>}
          </div>
        </section>

        <aside className="builder-side">
          <div className="summary-card">
            <div className="summary-heading"><span>▤</span><strong>Paper summary</strong></div>
            <div className="summary-line"><span>Questions in bank</span><strong>{availableCount}</strong></div>
            <div className="summary-line"><span>Requested questions</span><strong>{totalRequested}</strong></div>
            <div className="summary-line"><span>Selected questions</span><strong>{paper.length}</strong></div>
            <div className="summary-line"><span>Duration</span><strong>{duration} min</strong></div>
            <div className="summary-total"><span>Generated marks</span><strong>{totalMarks}</strong></div>
            <p>Marks are calculated from selected question records. Final exam settings and approval will be added before publishing.</p>
          </div>
          <div className="workflow-tip"><span>ⓘ</span><div><strong>Before publishing</strong><p>Review question wording, answer key, total marks, duration and instructions. A published paper will be frozen as a version.</p></div></div>
        </aside>
      </div>

      <section className="paper-preview-section">
        <div className="preview-heading"><div><div className="eyebrow">PRINT LAYOUT</div><h2>Paper preview</h2><p>This is the teacher preview. The answer key can be toggled separately.</p></div><span className="preview-badge">A4 PREVIEW</span></div>
        <div className="print-paper">
          <div className="paper-brand"><div className="paper-logo">C</div><div><strong>COACHING PRO</strong><span>INSTITUTE NAME</span></div></div>
          <div className="paper-title"><h2>{title || "Untitled Test"}</h2><p>{course} · {subject}</p></div>
          <div className="paper-meta"><span>Time: {duration} minutes</span><span>Maximum marks: {totalMarks || "—"}</span><span>Questions: {paper.length}</span></div>
          <div className="student-lines"><span>Student name: __________________________</span><span>Roll no.: ______________</span></div>
          <div className="paper-instructions"><strong>General instructions</strong><ol><li>Read each question carefully before answering.</li><li>Write your answers clearly in the space provided.</li><li>{negativeMarking ? "Negative marking is enabled; refer to the exam instructions." : "There is no negative marking in this draft."}</li></ol></div>
          {paper.length === 0 ? <div className="paper-empty">Your generated questions will appear here. Set a blueprint or select questions manually, then generate the paper.</div> : (
            <div className="paper-questions">{paper.map((item, index) => <article key={item.id} className="paper-question">
              <div className="paper-question-title"><strong>{index + 1}. {item.prompt}</strong><span>({item.marks} marks)</span></div>
              <div className="paper-options">{item.options.map((option, optionIndex) => <span key={option}>{String.fromCharCode(65 + optionIndex)}. {option}</span>)}</div>
              {showAnswers && <div className="answer-key">Answer: {item.answer}</div>}
            </article>)}</div>
          )}
          <div className="paper-end">— End of question paper —</div>
        </div>
      </section>
      <p className="prototype-disclaimer">Prototype using sample question records in the browser. Questions are not yet stored in PostgreSQL and generated papers are not yet persisted or assigned to students.</p>
    </div>
  );
}
