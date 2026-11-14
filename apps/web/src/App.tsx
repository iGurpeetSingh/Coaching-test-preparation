import { useMemo, useState } from "react";
import TestManagement from "./features/tests/TestManagement";
import StudentExamLibrary from "./features/tests/StudentExamLibrary";

const workspaceLinks = [
  ["Dashboard", "⌂"],
  ["Students", "♙"],
  ["Batches", "▦"],
  ["Courses", "▤"],
  ["Paper", "◈"],
  ["Tests & Exams", "▣"],
  ["Results", "▥"]
] as const;

const managementLinks = [
  ["Fee Management", "₹"],
  ["Reports", "▧"],
  ["Settings", "⚙"]
] as const;

const upcomingTests = [
  { name: "Physics Mock Test 01", batch: "Class 12 · Science A", date: "18 Nov 2026", status: "Ready" },
  { name: "Mathematics Weekly Test", batch: "JEE Foundation", date: "20 Nov 2026", status: "Draft" },
  { name: "Chemistry Chapter Test", batch: "Class 11 · Science B", date: "22 Nov 2026", status: "Scheduled" }
];

function App() {
  const [active, setActive] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const filteredTests = useMemo(
    () => upcomingTests.filter((test) => test.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const renderNav = (items: ReadonlyArray<readonly [string, string]>) => items.map(([label, icon]) => (
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
            <div className="avatar">AD</div>
            <div><strong>Institute Admin</strong><span>Owner account</span></div>
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
            <div className="top-user"><div className="avatar">AD</div><div><strong>Admin</strong><span>Institute Owner</span></div></div>
          </div>
        </header>

        <section className="page-content">
          {active !== "Tests & Exams" && <div className="page-heading">
            <div>
              <div className="eyebrow">INSTITUTE WORKSPACE</div>
              <h1>{active === "Dashboard" ? "Good morning, Admin 👋" : active}</h1>
              <p>{active === "Dashboard" ? "Here’s what’s happening at your institute today." : "Manage " + active.toLowerCase() + " for your institute."}</p>
            </div>
            <button className="primary-button" onClick={() => setActive("Tests & Exams")}>View Exams →</button>
          </div>}

          {active === "Tests & Exams" ? (
            <StudentExamLibrary searchQuery={query} />
          ) : active === "Results" ? (
            <TestManagement onBack={() => setActive("Dashboard")} searchQuery={query} showResultsInitially />
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
                <article className="stat-card"><div className="stat-top"><span className="stat-icon lavender">♙</span><span className="trend positive">+8.2%</span></div><div className="stat-value">1,240</div><div className="stat-label">Total Students</div><div className="stat-foot">Across all active batches</div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon blue">▦</span><span className="trend neutral">Active</span></div><div className="stat-value">42</div><div className="stat-label">Active Batches</div><div className="stat-foot">Across 3 courses</div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon mint">▣</span><span className="trend positive">+12 this month</span></div><div className="stat-value">135</div><div className="stat-label">Tests Conducted</div><div className="stat-foot">Online and offline</div></article>
                <article className="stat-card"><div className="stat-top"><span className="stat-icon peach">↗</span><span className="trend positive">+3.4%</span></div><div className="stat-value">78.6%</div><div className="stat-label">Average Performance</div><div className="stat-foot">Across published results</div></article>
              </div>

              <div className="section-heading"><div><h2>Quick actions</h2><p>Common tasks for your institute</p></div></div>
              <div className="quick-grid">
                <button className="quick-card quick-purple" onClick={() => setActive("Tests & Exams")}><span>＋</span><strong>View exams</strong><small>Check published Objective and Written papers</small></button>
                <button className="quick-card quick-blue" onClick={() => setActive("Paper")}><span>◈</span><strong>View papers</strong><small>Open the exam paper library</small></button>
                <button className="quick-card quick-green" onClick={() => setActive("Batches")}><span>▦</span><strong>Manage batches</strong><small>Organise classes and students</small></button>
                <button className="quick-card quick-orange" onClick={() => setActive("Reports")}><span>▥</span><strong>View reports</strong><small>Track academic performance</small></button>
              </div>

              <div className="section-heading tests-heading">
                <div><h2>Upcoming tests</h2><p>Review and manage scheduled assessments</p></div>
                <button className="text-button" onClick={() => setActive("Tests & Exams")}>View all tests →</button>
              </div>
              <div className="table-card">
                <div className="table-wrap">
                  <table><thead><tr><th>TEST NAME</th><th>BATCH</th><th>DATE</th><th>STATUS</th><th></th></tr></thead>
                    <tbody>
                      {filteredTests.map((test) => <tr key={test.name}>
                        <td><strong>{test.name}</strong><span className="table-sub">Assessment · 60 minutes</span></td>
                        <td>{test.batch}</td><td>{test.date}</td>
                        <td><span className={"status status-" + test.status.toLowerCase()}>{test.status}</span></td>
                        <td><button className="row-action" aria-label={"Open " + test.name} onClick={() => setActive("Tests & Exams")}>•••</button></td>
                      </tr>)}
                      {filteredTests.length === 0 && <tr><td colSpan={5} className="empty-state">No matching tests found.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer"><span>Showing {filteredTests.length} of {upcomingTests.length} sample tests</span><span>Prototype data</span></div>
              </div>
              <p className="demo-note">Illustrative sample figures only. Live institute data will appear when the relevant modules and database are connected.</p>
            </>
          )}
        </section>
      </main>


    </div>
  );
}

export default App;
