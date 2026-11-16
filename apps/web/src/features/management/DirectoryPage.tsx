import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiClientError } from "../../lib/api";
import "./directory-page.css";

type ModuleName = "Students" | "Batches" | "Courses";
type Branch = { id: string; name: string; branch_code: string };
type Course = {
  id: string; code: string; name: string; description: string | null;
  duration_months: number | null; default_fee: string | number; is_active: boolean;
};
type Batch = {
  id: string; branch_id: string; course_id: string; code: string; name: string;
  start_date: string | null; end_date: string | null; seat_limit: number | null;
  is_active: boolean; branch_name: string; course_name: string; enrolled_count: number;
};
type Student = {
  id: string; student_number: string; full_name: string; mobile: string | null;
  email: string | null; guardian_name: string | null; guardian_mobile: string | null;
  admission_number: string; admitted_at: string; branch_name: string;
  course_name: string; batch_name: string | null;
};

type Props = {
  module: ModuleName;
  branches: Branch[];
  permissions: string[];
};

function messageOf(error: unknown): string {
  return error instanceof ApiClientError || error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value: string | null): string {
  return value ? new Date(value + (value.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN") : "—";
}

export default function DirectoryPage({ module, branches, permissions }: Props) {
  const canManageCourses = permissions.includes("courses.manage");
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseFee, setCourseFee] = useState("0");
  const [courseDuration, setCourseDuration] = useState("");

  const [batchBranch, setBatchBranch] = useState(branches[0]?.id || "");
  const [batchCourse, setBatchCourse] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchStart, setBatchStart] = useState("");
  const [batchEnd, setBatchEnd] = useState("");
  const [batchSeats, setBatchSeats] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      if (module === "Courses") {
        const result = await apiRequest<{ items: Course[] }>("/courses?includeInactive=true");
        setCourses(result.items);
        setTotal(result.items.length);
      } else if (module === "Batches") {
        const [batchResult, courseResult] = await Promise.all([
          apiRequest<{ items: Batch[] }>("/batches"),
          apiRequest<{ items: Course[] }>("/courses")
        ]);
        setBatches(batchResult.items);
        setCourses(courseResult.items);
        setTotal(batchResult.items.length);
        if (!batchCourse && courseResult.items[0]) setBatchCourse(courseResult.items[0].id);
      } else {
        const params = new URLSearchParams({ page: "1", pageSize: "50" });
        if (search.trim()) params.set("q", search.trim());
        const result = await apiRequest<{ items: Student[]; total: number }>(`/students?${params.toString()}`);
        setStudents(result.items);
        setTotal(result.total);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // Reload when the selected directory or student search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, search]);

  useEffect(() => {
    if (!batchBranch && branches[0]) setBatchBranch(branches[0].id);
  }, [branches, batchBranch]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/courses", {
        method: "POST",
        body: JSON.stringify({
          code: courseCode.trim(), name: courseName.trim(),
          defaultFee: Number(courseFee), durationMonths: courseDuration ? Number(courseDuration) : null
        })
      });
      setCourseCode(""); setCourseName(""); setCourseFee("0"); setCourseDuration("");
      setNotice("Course created successfully.");
      await loadData();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("/batches", {
        method: "POST",
        body: JSON.stringify({
          branchId: batchBranch, courseId: batchCourse, code: batchCode.trim(), name: batchName.trim(),
          startDate: batchStart || null, endDate: batchEnd || null,
          seatLimit: batchSeats ? Number(batchSeats) : null
        })
      });
      setBatchCode(""); setBatchName(""); setBatchStart(""); setBatchEnd(""); setBatchSeats("");
      setNotice("Batch created successfully.");
      await loadData();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setSaving(false); }
  }

  async function toggleCourse(course: Course) {
    setError(""); setNotice("");
    try {
      await apiRequest(`/courses/${course.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !course.is_active }) });
      setNotice(course.is_active ? "Course deactivated." : "Course activated.");
      await loadData();
    } catch (cause) { setError(messageOf(cause)); }
  }

  async function toggleBatch(batch: Batch) {
    setError(""); setNotice("");
    try {
      await apiRequest(`/batches/${batch.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !batch.is_active }) });
      setNotice(batch.is_active ? "Batch deactivated." : "Batch activated.");
      await loadData();
    } catch (cause) { setError(messageOf(cause)); }
  }

  return (
    <div className="directory-page">
      <div className="directory-heading">
        <div>
          <span className="directory-eyebrow">INSTITUTE RECORDS</span>
          <h2>{module}</h2>
          <p>{module === "Students" ? "Students admitted through the institute admission workflow." : module === "Courses" ? "Manage courses and their standard fee settings." : "Organise course groups by branch, date and seat capacity."}</p>
        </div>
        <div className="directory-total"><strong>{total}</strong><span>{module.toLowerCase()} records</span></div>
      </div>

      {error && <div className="directory-alert error" role="alert">{error}</div>}
      {notice && <div className="directory-alert success" role="status">{notice}</div>}

      {module === "Students" && (
        <div className="directory-toolbar">
          <label className="directory-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, mobile or student number…" /></label>
          <span className="directory-muted">Showing up to 50 matching students</span>
        </div>
      )}

      {module === "Courses" && canManageCourses && (
        <form className="directory-create-form" onSubmit={createCourse}>
          <div className="directory-form-title"><strong>Add course</strong><span>Define the course code, duration and default fee</span></div>
          <div className="directory-fields">
            <label>Course code<input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="JEE-ADV" required maxLength={32} /></label>
            <label>Course name<input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="JEE Advanced" required maxLength={160} /></label>
            <label>Default fee (₹)<input type="number" min="0" step="0.01" value={courseFee} onChange={(event) => setCourseFee(event.target.value)} required /></label>
            <label>Duration (months)<input type="number" min="1" step="1" value={courseDuration} onChange={(event) => setCourseDuration(event.target.value)} placeholder="Optional" /></label>
          </div>
          <button className="directory-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Create course"}</button>
        </form>
      )}

      {module === "Batches" && canManageCourses && (
        <form className="directory-create-form" onSubmit={createBatch}>
          <div className="directory-form-title"><strong>Add batch</strong><span>Each batch belongs to one active course and branch</span></div>
          <div className="directory-fields">
            <label>Branch<select value={batchBranch} onChange={(event) => setBatchBranch(event.target.value)} required>
              <option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select></label>
            <label>Course<select value={batchCourse} onChange={(event) => setBatchCourse(event.target.value)} required>
              <option value="">Select course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select></label>
            <label>Batch code<input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder="JEE-2027-A" required maxLength={32} /></label>
            <label>Batch name<input value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="JEE 2027 Morning" required maxLength={160} /></label>
            <label>Start date<input type="date" value={batchStart} onChange={(event) => setBatchStart(event.target.value)} /></label>
            <label>End date<input type="date" value={batchEnd} onChange={(event) => setBatchEnd(event.target.value)} min={batchStart || undefined} /></label>
            <label>Seat limit<input type="number" min="1" step="1" value={batchSeats} onChange={(event) => setBatchSeats(event.target.value)} placeholder="No limit" /></label>
          </div>
          <button className="directory-primary" type="submit" disabled={saving || !branches.length || !courses.length}>{saving ? "Saving…" : "Create batch"}</button>
          {!branches.length && <span className="directory-muted">No accessible branch is available for this account.</span>}
          {!courses.length && <span className="directory-muted">Create a course before adding a batch.</span>}
        </form>
      )}

      <div className="directory-table-card">
        {loading ? <div className="directory-empty">Loading {module.toLowerCase()}…</div> : (
          <>
            {module === "Courses" && (
              <div className="directory-table-scroll"><table><thead><tr><th>COURSE</th><th>CODE</th><th>DURATION</th><th>DEFAULT FEE</th><th>STATUS</th>{canManageCourses && <th></th>}</tr></thead>
                <tbody>{courses.map((course) => <tr key={course.id}>
                  <td><strong>{course.name}</strong><small>{course.description || "No description"}</small></td>
                  <td>{course.code}</td><td>{course.duration_months ? course.duration_months + " months" : "—"}</td><td>{formatMoney(course.default_fee)}</td>
                  <td><span className={course.is_active ? "directory-status active" : "directory-status inactive"}>{course.is_active ? "Active" : "Inactive"}</span></td>
                  {canManageCourses && <td><button className="directory-row-action" onClick={() => void toggleCourse(course)}>{course.is_active ? "Deactivate" : "Activate"}</button></td>}
                </tr>)}</tbody>
              </table>{!courses.length && <div className="directory-empty">No courses created yet.</div>}</div>
            )}
            {module === "Batches" && (
              <div className="directory-table-scroll"><table><thead><tr><th>BATCH</th><th>COURSE</th><th>BRANCH</th><th>DATES</th><th>ENROLLED</th><th>STATUS</th>{canManageCourses && <th></th>}</tr></thead>
                <tbody>{batches.map((batch) => <tr key={batch.id}>
                  <td><strong>{batch.name}</strong><small>{batch.code}</small></td><td>{batch.course_name}</td><td>{batch.branch_name}</td>
                  <td>{formatDate(batch.start_date)} – {formatDate(batch.end_date)}</td>
                  <td>{batch.enrolled_count}{batch.seat_limit ? " / " + batch.seat_limit : ""}</td>
                  <td><span className={batch.is_active ? "directory-status active" : "directory-status inactive"}>{batch.is_active ? "Active" : "Inactive"}</span></td>
                  {canManageCourses && <td><button className="directory-row-action" onClick={() => void toggleBatch(batch)}>{batch.is_active ? "Deactivate" : "Activate"}</button></td>}
                </tr>)}</tbody>
              </table>{!batches.length && <div className="directory-empty">No batches created yet.</div>}</div>
            )}
            {module === "Students" && (
              <div className="directory-table-scroll"><table><thead><tr><th>STUDENT</th><th>STUDENT ID</th><th>MOBILE</th><th>COURSE / BATCH</th><th>BRANCH</th><th>ADMITTED</th></tr></thead>
                <tbody>{students.map((student) => <tr key={student.id}>
                  <td><strong>{student.full_name}</strong><small>{student.email || student.guardian_name || " "}</small></td>
                  <td>{student.student_number}</td><td>{student.mobile || "—"}</td><td>{student.course_name}<small>{student.batch_name || "No batch assigned"}</small></td>
                  <td>{student.branch_name}</td><td>{formatDate(student.admitted_at)}</td>
                </tr>)}</tbody>
              </table>{!students.length && <div className="directory-empty">No admitted students found.</div>}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
