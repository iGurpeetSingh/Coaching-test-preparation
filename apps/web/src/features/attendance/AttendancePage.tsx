import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import "./operations-page.css";

type Batch = { id: string; name: string; code: string; branch_name: string };
type Session = {
  id: string; batch_id: string; batch_name: string; branch_name: string;
  session_date: string; starts_at: string; ends_at: string; topic: string | null;
  status: "open" | "submitted" | "locked"; marked_count: number; roster_count: number;
};
type RosterStudent = {
  student_id: string; student_number: string; full_name: string; mobile: string | null;
  attendance_status: "present" | "absent" | "late" | "excused" | null;
  remarks: string | null;
};
type Mark = { status: "present" | "absent" | "late" | "excused"; remarks: string };

const dateToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const localDateTime = (hour: number, minute: number) => {
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const message = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

export default function AttendancePage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [batchId, setBatchId] = useState("");
  const [sessionDate, setSessionDate] = useState(dateToday());
  const [startsAt, setStartsAt] = useState(localDateTime(9, 0));
  const [endsAt, setEndsAt] = useState(localDateTime(10, 0));
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadBase() {
    setLoading(true); setError("");
    try {
      const [batchResult, sessionResult] = await Promise.all([
        apiRequest<{ items: Batch[] }>("/batches"),
        apiRequest<{ items: Session[] }>("/attendance/sessions")
      ]);
      setBatches(batchResult.items);
      setSessions(sessionResult.items);
      if (!batchId && batchResult.items[0]) setBatchId(batchResult.items[0].id);
      if (selected) setSelected(sessionResult.items.find((item) => item.id === selected.id) || null);
    } catch (cause) { setError(message(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadBase(); }, []);

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ session: Session }>("/attendance/sessions", {
        method: "POST",
        body: JSON.stringify({
          batchId, sessionDate,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          topic: topic.trim() || null
        })
      });
      setNotice("Attendance session created.");
      setTopic("");
      await loadBase();
      await openSession(result.session);
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); }
  }

  async function openSession(session: Session) {
    setSelected(session); setError("");
    try {
      const result = await apiRequest<{ session: Session; students: RosterStudent[] }>(`/attendance/sessions/${session.id}/roster`);
      setSelected(result.session);
      setRoster(result.students);
      const next: Record<string, Mark> = {};
      for (const student of result.students) {
        next[student.student_id] = {
          status: student.attendance_status || "present",
          remarks: student.remarks || ""
        };
      }
      setMarks(next);
    } catch (cause) { setError(message(cause)); setRoster([]); }
  }

  function updateMark(studentId: string, patch: Partial<Mark>) {
    setMarks((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] || { status: "present", remarks: "" }), ...patch }
    }));
  }

  async function saveAndSubmit() {
    if (!selected) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/attendance/sessions/${selected.id}/records`, {
        method: "PUT",
        body: JSON.stringify({
          records: roster.map((student) => ({
            studentId: student.student_id,
            status: marks[student.student_id]?.status || "present",
            remarks: marks[student.student_id]?.remarks || null
          }))
        })
      });
      await apiRequest(`/attendance/sessions/${selected.id}/submit`, { method: "POST", body: "{}" });
      setNotice("Attendance saved and submitted.");
      await loadBase();
      const updated = sessions.find((item) => item.id === selected.id);
      if (updated) await openSession({ ...updated, status: "submitted" });
    } catch (cause) { setError(message(cause)); }
    finally { setSaving(false); }
  }

  const countStatus = (status: Mark["status"]) => Object.values(marks).filter((mark) => mark.status === status).length;

  return (
    <div className="operations-page">
      <div className="operations-heading"><div><span className="directory-eyebrow">ACADEMIC OPERATIONS</span><h2>Attendance</h2><p>Create batch sessions, mark each enrolled student and submit a locked attendance register.</p></div><div className="operations-total"><strong>{sessions.length}</strong><span>sessions</span></div></div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}

      <form className="directory-create-form" onSubmit={createSession}>
        <div className="directory-form-title"><strong>Create attendance session</strong><span>Sessions are attached to a batch and branch; duplicate batch start times are rejected.</span></div>
        <div className="directory-fields">
          <label>Batch<select value={batchId} onChange={(event) => setBatchId(event.target.value)} required><option value="">Select batch</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name} · {batch.branch_name}</option>)}</select></label>
          <label>Session date<input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required /></label>
          <label>Starts at<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
          <label>Ends at<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} min={startsAt} required /></label>
          <label>Topic / lesson<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={240} placeholder="Optional lesson topic" /></label>
        </div>
        <button className="directory-primary" type="submit" disabled={saving || !batches.length}>{saving ? "Creating…" : "Create session"}</button>
        {!batches.length && <span className="directory-muted">Create a batch and admit students into it before scheduling attendance.</span>}
      </form>

      <div className="operations-columns">
        <section className="directory-table-card">
          <div className="operations-card-title"><strong>Attendance sessions</strong><span>{sessions.length} records</span></div>
          {loading ? <div className="directory-empty">Loading sessions…</div> : <div className="directory-table-scroll"><table><thead><tr><th>SESSION</th><th>BATCH</th><th>MARKED</th><th>STATUS</th><th></th></tr></thead><tbody>
            {sessions.map((session) => <tr key={session.id}>
              <td><strong>{new Date(session.session_date + "T00:00:00").toLocaleDateString("en-IN")}</strong><small>{new Date(session.starts_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {session.topic || "Class session"}</small></td>
              <td>{session.batch_name}<small>{session.branch_name}</small></td>
              <td>{session.marked_count} / {session.roster_count}</td>
              <td><span className={session.status === "open" ? "directory-status active" : "directory-status inactive"}>{session.status}</span></td>
              <td><button className="directory-row-action" onClick={() => void openSession(session)}>Open</button></td>
            </tr>)}
          </tbody></table>{!sessions.length && <div className="directory-empty">No attendance sessions yet.</div>}</div>}
        </section>

        <section className="directory-table-card">
          <div className="operations-card-title"><strong>{selected ? "Mark attendance" : "Attendance register"}</strong><span>{selected ? selected.batch_name : "Select a session"}</span></div>
          {selected ? <>
            <div className="attendance-session-meta">{selected.session_date} · {selected.topic || "Class session"} · {selected.status}</div>
            <div className="attendance-counts"><span>Present <b>{countStatus("present")}</b></span><span>Absent <b>{countStatus("absent")}</b></span><span>Late <b>{countStatus("late")}</b></span><span>Excused <b>{countStatus("excused")}</b></span></div>
            <div className="directory-table-scroll"><table><thead><tr><th>STUDENT</th><th>STATUS</th></tr></thead><tbody>
              {roster.map((student) => <tr key={student.student_id}>
                <td><strong>{student.full_name}</strong><small>{student.student_number}</small></td>
                <td><select className="attendance-mark-select" value={marks[student.student_id]?.status || "present"} disabled={selected.status !== "open" || saving} onChange={(event) => updateMark(student.student_id, { status: event.target.value as Mark["status"] })}>
                  <option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option>
                </select></td>
              </tr>)}
            </tbody></table>{!roster.length && <div className="directory-empty">No students are enrolled in this batch.</div>}</div>
            {selected.status === "open" && <div className="attendance-submit-row"><button className="directory-primary" disabled={saving || !roster.length} onClick={() => void saveAndSubmit()}>{saving ? "Saving…" : "Save & submit attendance"}</button></div>}
          </> : <div className="directory-empty">Choose an attendance session from the list to see its student roster.</div>}
        </section>
      </div>
    </div>
  );
}
