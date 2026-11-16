import { useEffect, useState } from "react";
import ExamManagementPage from "./features/exams/ExamManagementPage";
import StudentExamPage from "./features/exams/StudentExamPage";
import ResultsPage from "./features/results/ResultsPage";
import AuthScreen from "./features/auth/AuthScreen";
import DirectoryPage from "./features/management/DirectoryPage";
import EnquiryPage from "./features/admissions/EnquiryPage";
import AttendancePage from "./features/attendance/AttendancePage";
import FeeManagementPage from "./features/finance/FeeManagementPage";
import QuestionBankPage from "./features/questions/QuestionBankPage";
import { apiRequest, bootstrapCsrf, getCurrentUser, signOut, type CurrentUserResponse } from "./lib/api";

const workspaceLinks = [
  ["Dashboard", "⌂"],
  ["Enquiries", "↗"],
  ["Students", "♙"],
  ["Batches", "▦"],
  ["Courses", "▤"],
  ["Attendance", "✓"],
  ["Question Bank", "▧"],
  ["Paper", "◈"],
  ["My Exams", "▣"],
  ["Tests & Exams", "▣"],
  ["Results", "▥"]
] as const;

const managementLinks = [
  ["Fee Management", "₹"],
  ["Reports", "▧"],
  ["Settings", "⚙"]
] as const;

function App() {
  const [active, setActive] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [dashboardStats, setDashboardStats] = useState({
    students: "—", batches: "—", enquiries: "—", admissions: "—"
  });
  const [statusBreakdown, setStatusBreakdown] = useState<Array<{ key: string; label: string; count: number }>>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    let activeRequest = true;
    (async () => {
      try {
        await bootstrapCsrf();
        const session = await getCurrentUser();
        if (activeRequest) setCurrentUser(session);
      } catch {
        if (activeRequest) setCurrentUser(null);
      } finally {
        if (activeRequest) setAuthLoading(false);
      }
    })();
    return () => { activeRequest = false; };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.permissions.includes("student.exams.read") && !currentUser.permissions.includes("admissions.read")) {
      setActive("My Exams");
      setDashboardLoading(false);
      return;
    }
    let activeRequest = true;
    setDashboardLoading(true);
    Promise.allSettled([
      apiRequest<{ total: number }>("/students?page=1&pageSize=1"),
      apiRequest<{ items: Array<{ is_active: boolean }> }>("/batches"),
      apiRequest<{ metrics: { total: number }; statusBreakdown: Array<{ key: string; label: string; count: number }> }>("/dashboard"),
      apiRequest<{ total: number }>("/admissions?page=1&pageSize=1")
    ]).then((results) => {
      if (!activeRequest) return;
      const [students, batches, enquiries, admissions] = results;
      setDashboardStats({
        students: students.status === "fulfilled" ? String(students.value.total) : "—",
        batches: batches.status === "fulfilled"
          ? String(batches.value.items.filter((batch) => batch.is_active).length)
          : "—",
        enquiries: enquiries.status === "fulfilled" ? String(enquiries.value.metrics.total) : "—",
        admissions: admissions.status === "fulfilled" ? String(admissions.value.total) : "—"
      });
      setStatusBreakdown(enquiries.status === "fulfilled" ? enquiries.value.statusBreakdown : []);
    }).finally(() => {
      if (activeRequest) setDashboardLoading(false);
    });
    return () => { activeRequest = false; };
  }, [currentUser]);

  async function handleSignedIn() {
    const session = await getCurrentUser();
    setCurrentUser(session);
    setActive("Dashboard");
  }

  async function handleSignOut() {
    try { await signOut(); } catch { /* The local workspace view is cleared even if the network is unavailable. */ }
    setCurrentUser(null);
    setQuery("");
    setActive("Dashboard");
  }
  if (authLoading) {
    return <div className="auth-page"><div className="auth-card">Loading secure institute session…</div></div>;
  }
  if (!currentUser) {
    return <AuthScreen onSignedIn={handleSignedIn} />;
  }

  const displayName = currentUser.user.fullName || "Institute User";
  const initials = displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  const permissionByModule: Record<string, string> = {
    Enquiries: "enquiries.read",
    Students: "admissions.read",
    Batches: "admissions.read",
    Courses: "admissions.read",
    Attendance: "attendance.read",
    "Question Bank": "question_bank.read",
    Paper: "papers.read",
    "Tests & Exams": "papers.read",
    "My Exams": "student.exams.read",
    Results: "results.read",
    "Fee Management": "fees.read",
    Reports: "reports.read",
    Settings: "users.manage"
  };
  const renderNav = (items: ReadonlyArray<readonly [string, string]>) => items
    .filter(([label]) => !permissionByModule[label] || currentUser.permissions.includes(permissionByModule[label]))
    .map(([label, icon]) => (
    <button key={label} className={active === label ? "nav-item active" : "nav-item"} onClick={() => setActive(label)}>
      <span className="nav-icon">{icon}</span>{label}

    </button>
  ));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div><strong>Coaching Pro</strong><span>INSTITUTE WORKSPACE</span></div>
        </div>
        <div className="side-label">WORKSPACE</div>
        <nav aria-label="Main navigation">{renderNav(workspaceLinks)}</nav>
        <div className="side-label management-label">MANAGEMENT</div>
        <nav aria-label="Management navigation">{renderNav(managementLinks)}</nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">?</span>
            <strong>Need help?</strong>
            <p>Find guides for your institute workspace.</p>
            <button onClick={() => setActive("Help & Support")}>Open help centre →</button>
          </div>
          <div className="profile-mini">
            <div className="avatar">{initials}</div>
            <div><strong>{displayName}</strong><span>{currentUser.user.tenantName}</span></div>
            <span className="profile-menu">•••</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <strong>{active}</strong></div>
          <div className="top-actions">
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tests..." aria-label="Search tests" /></label>
            <button className="icon-button" aria-label="Notifications">♧</button>
            <div className="top-user"><div className="avatar">{initials}</div><div><strong>{displayName}</strong><span>{currentUser.user.tenantName}</span></div></div>
            <button className="text-button" onClick={() => void handleSignOut()}>Sign out</button>
          </div>
        </header>

        <section className="page-content">
          {!["Tests & Exams", "Paper", "My Exams", "Results"].includes(active) && <div className="page-heading">
            <div>
              <div className="eyebrow">INSTITUTE WORKSPACE</div>
              <h1>{active === "Dashboard" ? "Good morning, " + displayName + " 👋" : active}</h1>
              <p>{active === "Dashboard" ? "Here’s what’s happening at your institute today." : "Manage " + active.toLowerCase() + " for your institute."}</p>
            </div>
            {currentUser.permissions.includes("question_bank.read") && <button className="primary-button" onClick={() => setActive("Tests & Exams")}>View Exams →</button>}
          </div>}

          {active === "My Exams" ? (
            <StudentExamPage />
          ) : active === "Tests & Exams" || active === "Paper" ? (
            <ExamManagementPage />
          ) : active === "Fee Management" ? (
            <FeeManagementPage permissions={currentUser.permissions} />
          ) : active === "Attendance" ? (
            <AttendancePage />
          ) : active === "Question Bank" ? (
            <QuestionBankPage />
          ) : active === "Enquiries" ? (
            <EnquiryPage branches={currentUser.branches} permissions={currentUser.permissions} />
          ) : active === "Students" || active === "Batches" || active === "Courses" ? (
            <DirectoryPage
              module={active}
              branches={currentUser.branches}
              permissions={currentUser.permissions}
            />
          ) : active === "Results" ? (
            <ResultsPage permissions={currentUser.permissions} />
          ) : active !== "Dashboard" && active !== "Tests & Exams" ? (
            <div className="placeholder-panel">
              <div className="placeholder-icon">✦</div>
              <h2>{active} workspace</h2>
              <p>This module is planned in the product roadmap. The current build establishes the shared navigation and design system first.</p>
              <button className="secondary-button" onClick={() => setActive("Dashboard")}>Back to dashboard</button>
            </div>
          ) : (
            <>
              <div className="stats-grid">
                <article className="stat-card"><div className="stat-top"><span className="stat-icon lavender">♙</span><span className="trend neutral">{dashboardLoading ? "Loading" : "Live"}</span></div><div className="stat-value">{dashboardStats.students}</div><div className="stat-label">Admitted Students</div><div className="stat-foot">From admission records</div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon blue">▦</span><span className="trend neutral">{dashboardLoading ? "Loading" : "Live"}</span></div><div className="stat-value">{dashboardStats.batches}</div><div className="stat-label">Active Batches</div><div className="stat-foot">Within accessible branches</div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon mint">↗</span><span className="trend neutral">{dashboardLoading ? "Loading" : "Live"}</span></div><div className="stat-value">{dashboardStats.enquiries}</div><div className="stat-label">Active Enquiries</div><div className="stat-foot">Visible enquiry pipeline</div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon peach">▣</span><span className="trend neutral">{dashboardLoading ? "Loading" : "Live"}</span></div><div className="stat-value">{dashboardStats.admissions}</div><div className="stat-label">Admissions</div><div className="stat-foot">Converted enquiry records</div></article>
              </div>

              <div className="section-heading"><div><h2>Quick actions</h2><p>Common tasks for your institute</p></div></div>
              <div className="quick-grid">
                {currentUser.permissions.includes("enquiries.create") && <button className="quick-card quick-purple" onClick={() => setActive("Enquiries")}><span>＋</span><strong>New enquiry</strong><small>Capture and follow prospective students</small></button>}
                {currentUser.permissions.includes("admissions.read") && <button className="quick-card quick-blue" onClick={() => setActive("Students")}><span>♙</span><strong>View students</strong><small>Search admitted student records</small></button>}
                {currentUser.permissions.includes("courses.manage") && <button className="quick-card quick-green" onClick={() => setActive("Courses")}><span>▤</span><strong>Manage courses</strong><small>Set course names and standard fees</small></button>}
                {currentUser.permissions.includes("courses.manage") && <button className="quick-card quick-orange" onClick={() => setActive("Batches")}><span>▦</span><strong>Manage batches</strong><small>Organise branch groups and seat capacity</small></button>}
                {currentUser.permissions.includes("attendance.manage") && <button className="quick-card quick-blue" onClick={() => setActive("Attendance")}><span>✓</span><strong>Mark attendance</strong><small>Open a batch attendance register</small></button>}
                {currentUser.permissions.includes("fees.manage") && <button className="quick-card quick-orange" onClick={() => setActive("Fee Management")}><span>₹</span><strong>Collect fees</strong><small>Create charges and post payments</small></button>}
              </div>

              <div className="section-heading tests-heading">
                <div><h2>Enquiry pipeline</h2><p>Current enquiry status distribution from your institute CRM</p></div>
                <button className="text-button" onClick={() => setActive("Enquiries")}>Open enquiries →</button>
              </div>
              <div className="table-card">
                <div className="table-wrap">
                  <table><thead><tr><th>STATUS</th><th>ENQUIRIES</th><th>SHARE</th><th></th></tr></thead>
                    <tbody>
                      {statusBreakdown.filter((item) => item.count > 0).map((item) => (
                        <tr key={item.key}>
                          <td><strong>{item.label}</strong></td>
                          <td>{item.count}</td>
                          <td>{dashboardStats.enquiries === "—" || Number(dashboardStats.enquiries) === 0 ? "—" : Math.round(item.count / Number(dashboardStats.enquiries) * 100) + "%"}</td>
                          <td><button className="row-action" aria-label={"Open " + item.label + " enquiries"} onClick={() => setActive("Enquiries")}>→</button></td>
                        </tr>
                      ))}
                      {!statusBreakdown.some((item) => item.count > 0) && (
                        <tr><td colSpan={4} className="empty-state">{dashboardLoading ? "Loading enquiry pipeline…" : "No enquiry records are available for your account yet."}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer"><span>Counts are calculated from records visible to your role and branches.</span><span>{dashboardLoading ? "Refreshing…" : "Live API data"}</span></div>
              </div>
            </>
          )}
        </section>
      </main>


    </div>
  );
}

export default App;
