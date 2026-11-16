import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiClientError } from "../../lib/api";
import "./enquiry-page.css";

type Branch = { id: string; name: string; branch_code: string };
type Course = { id: string; name: string; code: string };
type Enquiry = {
  id: string; enquiry_number: string; student_name: string; parent_name: string | null;
  mobile: string; email: string | null; priority: string; status_key: string;
  created_at: string; row_version: number; branch_id: string; branch_name: string;
  course_id: string | null; course_name: string | null; counsellor_name: string | null;
};

type Props = { branches: Branch[]; permissions: string[] };

const STATUS_LABELS: Record<string, string> = {
  new: "New", assigned: "Assigned", contacted: "Contacted", interested: "Interested",
  follow_up: "Follow-up", counselling: "Counselling", demo_scheduled: "Demo scheduled",
  demo_completed: "Demo completed", admission_pending: "Admission pending",
  converted: "Converted", not_interested: "Not interested", lost: "Lost", on_hold: "On hold"
};
const NEXT_STATUS: Record<string, string[]> = {
  new: ["assigned", "contacted", "interested", "follow_up", "on_hold", "not_interested", "lost"],
  assigned: ["contacted", "interested", "follow_up", "counselling", "demo_scheduled", "on_hold", "not_interested", "lost"],
  contacted: ["interested", "follow_up", "counselling", "demo_scheduled", "on_hold", "not_interested", "lost"],
  interested: ["follow_up", "counselling", "demo_scheduled", "admission_pending", "on_hold", "not_interested", "lost"],
  follow_up: ["contacted", "interested", "counselling", "demo_scheduled", "admission_pending", "on_hold", "not_interested", "lost"],
  counselling: ["follow_up", "demo_scheduled", "demo_completed", "admission_pending", "on_hold", "not_interested", "lost"],
  demo_scheduled: ["demo_completed", "follow_up", "admission_pending", "on_hold", "not_interested", "lost"],
  demo_completed: ["follow_up", "interested", "admission_pending", "on_hold", "not_interested", "lost"],
  admission_pending: ["follow_up", "on_hold", "not_interested", "lost"],
  not_interested: ["follow_up"],
  on_hold: ["contacted", "interested", "follow_up", "counselling", "demo_scheduled", "admission_pending", "not_interested", "lost"]
};

function getMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function EnquiryPage({ branches, permissions }: Props) {
  const canCreate = permissions.includes("enquiries.create");
  const canUpdate = permissions.includes("enquiries.update");
  const canConvert = permissions.includes("admissions.convert");
  const [items, setItems] = useState<Enquiry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Enquiry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [studentName, setStudentName] = useState("");
  const [parentName, setParentName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [courseId, setCourseId] = useState("");

  async function loadItems() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "50" });
      if (search.trim()) params.set("q", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      const result = await apiRequest<{ items: Enquiry[]; total: number }>(`/enquiries?${params.toString()}`);
      setItems(result.items); setTotal(result.total);
      if (selected) setSelected(result.items.find((item) => item.id === selected.id) || null);
    } catch (cause) { setError(getMessage(cause)); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadItems(); }, [search, statusFilter]);

  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(branches[0].id);
  }, [branches, branchId]);

  useEffect(() => {
    if (!permissions.includes("admissions.read")) return;
    apiRequest<{ items: Course[] }>("/courses").then((result) => setCourses(result.items)).catch(() => setCourses([]));
  }, [permissions]);

  async function createEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ enquiry: Enquiry; duplicateWarnings: Array<{ enquiryNumber: string; studentName: string }> }>("/enquiries", {
        method: "POST",
        body: JSON.stringify({
          studentName: studentName.trim(), parentName: parentName.trim() || null,
          mobile: mobile.trim(), email: email.trim() || null, branchId, courseId: courseId || null
        })
      });
      setStudentName(""); setParentName(""); setMobile(""); setEmail(""); setCourseId("");
      setNotice(result.duplicateWarnings.length
        ? "Enquiry saved. Similar existing enquiries were found; review duplicates before continuing."
        : "Enquiry created successfully.");
      await loadItems();
      setSelected(result.enquiry);
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  async function changeStatus(item: Enquiry, nextStatus: string) {
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest(`/enquiries/${item.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status: nextStatus, ...(nextStatus === "lost" ? { lostReason: "Marked lost from enquiry workspace" } : {}) })
      });
      setNotice("Enquiry status updated.");
      await loadItems();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  async function convertToAdmission(item: Enquiry) {
    const course = item.course_id || courseId || courses[0]?.id;
    if (!course) { setError("Create or assign a course before converting this enquiry."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ admission: { admission_number: string; student_number: string }; alreadyConverted: boolean }>(
        `/admissions/enquiries/${item.id}/convert`,
        { method: "POST", body: JSON.stringify({ branchId: item.branch_id, courseId: course, discountAmount: 0 }) }
      );
      setNotice(result.alreadyConverted ? "This enquiry was already converted." : `Admission created: ${result.admission.admission_number} · Student ID: ${result.admission.student_number}`);
      await loadItems();
    } catch (cause) { setError(getMessage(cause)); }
    finally { setSaving(false); }
  }

  const statuses = Object.keys(STATUS_LABELS);

  return (
    <div className="enquiry-page">
      <div className="enquiry-heading">
        <div><span className="directory-eyebrow">ADMISSIONS CRM</span><h2>Enquiries</h2><p>Capture prospective students, follow their progress and convert successful leads into admissions.</p></div>
        <div className="directory-total"><strong>{total}</strong><span>active enquiries</span></div>
      </div>
      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}

      {canCreate && (
        <form className="directory-create-form" onSubmit={createEnquiry}>
          <div className="directory-form-title"><strong>New enquiry</strong><span>Required details are saved to the institute CRM with an automatic enquiry number.</span></div>
          <div className="directory-fields enquiry-fields">
            <label>Student name<input value={studentName} onChange={(event) => setStudentName(event.target.value)} required maxLength={160} placeholder="Student full name" /></label>
            <label>Parent / guardian<input value={parentName} onChange={(event) => setParentName(event.target.value)} maxLength={160} placeholder="Parent name" /></label>
            <label>Mobile number<input type="tel" value={mobile} onChange={(event) => setMobile(event.target.value)} required maxLength={32} placeholder="10-digit mobile" /></label>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} placeholder="Optional" /></label>
            <label>Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label>Interested course<select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Not selected</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
          </div>
          <button className="directory-primary" type="submit" disabled={saving || !branches.length}>{saving ? "Saving…" : "Create enquiry"}</button>
          {!branches.length && <span className="directory-muted">No accessible branch is available for this account.</span>}
        </form>
      )}

      <div className="enquiry-toolbar">
        <label className="directory-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, mobile or enquiry number…" /></label>
        <select className="enquiry-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{STATUS_LABELS[status]}</option>)}
        </select>
      </div>

      <div className="directory-table-card">
        {loading ? <div className="directory-empty">Loading enquiries…</div> : (
          <div className="directory-table-scroll"><table><thead><tr><th>ENQUIRY / STUDENT</th><th>CONTACT</th><th>BRANCH / COURSE</th><th>STATUS</th><th>OWNER</th><th>ACTIONS</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} className={selected?.id === item.id ? "enquiry-selected" : ""}>
              <td><strong>{item.enquiry_number}</strong><small>{item.student_name}{item.parent_name ? " · " + item.parent_name : ""}</small></td>
              <td>{item.mobile}<small>{item.email || "No email"}</small></td>
              <td>{item.branch_name}<small>{item.course_name || "Course not selected"}</small></td>
              <td><span className="directory-status active">{STATUS_LABELS[item.status_key] || item.status_key}</span></td>
              <td>{item.counsellor_name || "Unassigned"}</td>
              <td className="enquiry-actions">
                <button className="directory-row-action" onClick={() => setSelected(item)}>Details</button>
                {canConvert && item.status_key !== "converted" && !["lost", "not_interested"].includes(item.status_key) && <button className="directory-row-action" disabled={saving} onClick={() => void convertToAdmission(item)}>Admit</button>}
              </td>
            </tr>)}</tbody>
          </table>{!items.length && <div className="directory-empty">No enquiries match the selected filters.</div>}</div>
        )}
      </div>

      {selected && (
        <section className="enquiry-detail">
          <div><span className="directory-eyebrow">SELECTED ENQUIRY</span><h3>{selected.student_name}</h3><p>{selected.enquiry_number} · {selected.mobile} · {selected.branch_name}</p></div>
          {canUpdate && NEXT_STATUS[selected.status_key]?.length ? (
            <label>Update status<select value="" onChange={(event) => { if (event.target.value) void changeStatus(selected, event.target.value); }} disabled={saving}>
              <option value="">Choose next status</option>{NEXT_STATUS[selected.status_key].map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select></label>
          ) : <span className="directory-muted">Current status: {STATUS_LABELS[selected.status_key] || selected.status_key}</span>}
          <button className="directory-row-action" onClick={() => setSelected(null)}>Close details</button>
        </section>
      )}
    </div>
  );
}
