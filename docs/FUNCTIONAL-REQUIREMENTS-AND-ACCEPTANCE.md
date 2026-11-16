# Functional Requirements & Acceptance Criteria

**Product:** Coaching & Test Preparation  
**Version:** 1.0 · **Baseline date:** 16 November 2026  
**Status:** Product requirements for planning and implementation. These requirements are not proof that the features are already implemented.

---

## 1. Product objective and scope

Build one multi-tenant coaching operations and exam-preparation platform. The product must connect institute administration, student lifecycle, academic delivery, fees, question management, examination, evaluation and results.

The product is designed for Indian coaching/test-preparation institutes first. School-specific or enterprise training features should be added only when validated by target customers.

### In scope

- Multiple institutes (tenants), branches and academic years.
- Secure accounts, roles and scoped permissions.
- Enquiry, admission, student, guardian, course, batch and faculty records.
- Timetable, attendance, homework and learning resources.
- Fee plans, instalments, collection records, receipts, dues and refunds.
- Syllabus taxonomy and reusable, versioned question bank.
- Bulk question import with preview and row-level validation.
- Blueprint-based paper creation and PDF output.
- Scheduled online examinations with robust attempt persistence.
- Objective and subjective evaluation, moderated results and analytics.
- Audit, privacy, exports and operational reporting.

### Not an MVP blocker

Native mobile apps, video streaming/DRM, full proctoring, live AI tutor, automated payment capture, third-party WhatsApp/SMS, full double-entry accounting, production OMR and full standards-based QTI conformance. These can be adapters or later phases after core workflows pass pilot.

---

## 2. Product principles

1. **One connected record:** student lifecycle and assessment history must link to one canonical student identity.
2. **Secure by default:** tenant and branch permissions are enforced on the server and database, not only in the UI.
3. **Versioned academic truth:** questions, paper, scoring policy, attempt and published result remain reproducible.
4. **No silent data loss:** imports, exam autosaves, payment posting and background jobs report success/failure explicitly.
5. **Mobile-first operation:** student exam and staff workflows must be usable on common phones and low-bandwidth connections.
6. **Human accountability:** concessions, attendance corrections, manual marks, regrades and access overrides are attributable.
7. **Core independence:** essential institute and assessment operations must work without a third-party API.
8. **Evidence before claims:** scale, accuracy, security and compliance statements require measured test results or professional review.

---

## 3. Roles and permission matrix

Legend: **Manage** = create/update within permitted scope; **Own** = own record only; **Assigned** = assigned records only; **Approve** = controlled approval action; **—** = no default access. Explicit grants may narrow or expand scope, but must never bypass tenant isolation.

| Capability | Platform Operator | Institute Owner | Branch Admin | Counsellor | Academic Coord. | Teacher | Accountant | Exam Controller | Student | Guardian |
|---|---|---|---|---|---|---|---|---|---|---|
| Platform tenants | Manage | — | — | — | — | — | — | — | — | — |
| Institute profile/branches | Support* | Manage | Assigned | — | — | — | — | — | — | — |
| Staff accounts/roles | Support* | Manage | Assigned | — | Assigned scope | — | — | Assigned scope | — | — |
| Enquiries/follow-ups | Support* | Manage | Manage | Assigned/Manage | — | — | — | — | — | — |
| Admissions/student records | Support* | Manage | Manage | Assigned | Assigned | Assigned learners | Billing fields | Exam identity fields | Own | Linked/limited |
| Courses/batches/syllabus | Support* | Manage | Manage | Read limited | Manage | Assigned/Read | Read billing link | Read exam link | Enrolled | Linked/limited |
| Timetable/attendance | Support* | Manage | Manage | — | Manage | Assigned/Manage | — | Read | Own | Linked/limited |
| Fee plans/charges | Support* | Manage | Branch scope | — | Read limited | — | Manage | — | Own balance | Linked balance |
| Payments/receipts/refunds | Support* | Approve policy | Branch scope | — | — | — | Manage/Approve by limit | — | Own receipt | Linked/limited |
| Question bank | Support* | Manage | Assigned | — | Approve | Author/Assigned | — | Manage/Approve | — | — |
| Paper/exam schedule | Support* | Policy | Assigned | — | Approve | Assigned author | — | Manage | Assigned exams | Limited schedule |
| Exam attempt | Support* | — | — | — | Oversight | Oversight if assigned | — | Monitor | Own | — |
| Evaluation/result | Support* | Policy | Assigned | — | Approve | Assigned/Mark | — | Manage/Publish | Published own | Published linked |
| Reports/export | Support* | Institute-wide | Branch | Assigned leads | Academic scope | Assigned batches | Finance scope | Exam scope | Own | Linked/limited |
| Audit/privacy requests | Support* | Manage | Request intake | — | — | — | — | — | Own request | Linked request |

`Support*` means exceptional, time-bound, reason-coded and audited support access. Platform operators must not have silent routine access to tenant records.

Permission design rules:
- Model permissions as capabilities (for example `enquiries.assign`, `papers.approve`, `results.publish`, `fees.refund`), not only role-name checks.
- Role membership is scoped by tenant and optionally branch.
- A user can hold multiple memberships where authorised; requests must use one active context.
- Students and guardians have record-level access limits.
- Sensitive actions require re-authentication or a second approval where risk warrants it.
- All permission changes are audited.

---

## 4. Functional requirements

Priority definitions:
- **P0:** required for a safe pilot/MVP.
- **P1:** important for a complete coaching product; can follow the first reliable pilot.
- **P2:** advanced or monetisation capability; defer until P0/P1 evidence exists.

### 4.1 Tenant, account and access management

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| IAM-01 | P0 | Create and configure institute tenant | Tenant has immutable ID, unique slug, timezone, locale and lifecycle state; tenant-scoped queries never return another tenant's records |
| IAM-02 | P0 | Manage branches | Branch belongs to one tenant; unique branch code within tenant; branch membership is validated on writes |
| IAM-03 | P0 | Secure login/session | Passwords use Argon2id or reviewed equivalent; secure HttpOnly cookies; session rotation/revocation; login rate limit; no secrets in logs |
| IAM-04 | P0 | Invite and activate users | Invite has expiry and one-time use; activation records actor/time; disabled user cannot start a new session |
| IAM-05 | P0 | Role and capability permissions | API denies unauthorised requests even when endpoint is called directly; branch and record scope is checked |
| IAM-06 | P0 | Student/guardian portal account | Account is linked to canonical student/guardian record; student can view only own permitted records |
| IAM-07 | P1 | Password recovery and account recovery | Reset token is short-lived, single-use and stored hashed; response does not reveal whether an email exists |
| IAM-08 | P1 | MFA for privileged roles | Admin/owner can enrol second factor; recovery procedure is audited |
| IAM-09 | P1 | Multi-membership context switch | User can switch only to memberships they hold; active context is visible and server-validated |

### 4.2 Enquiry and admission CRM

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| CRM-01 | P0 | Capture enquiries | Manual entry and documented CSV import store source, course interest, branch, contact, owner, stage and created timestamp |
| CRM-02 | P0 | Duplicate detection | Normalised phone/email match shows possible duplicates; user can review/merge; history is retained |
| CRM-03 | P0 | Counsellor assignment | Only authorised users assign/reassign; audit records previous/new owner and reason |
| CRM-04 | P0 | Follow-up management | Open lead has next action/date or explicit no-follow-up reason; overdue queue filters by owner/branch |
| CRM-05 | P0 | Stage lifecycle | Allowed stage transitions are configurable; invalid transitions fail with readable validation errors |
| CRM-06 | P0 | Activity history | Calls, visits, counselling, demo and notes are timestamped and attributable |
| CRM-07 | P0 | Convert to admission | Conversion creates/links student, application/enrolment and admission number without duplicating student identity |
| CRM-08 | P1 | Lead source and conversion reporting | Report filters by source, counsellor, course, branch and period; counts use distinct lead IDs |
| CRM-09 | P1 | Web enquiry endpoint/form | Captures a lead safely with rate limits, validation and spam controls; does not grant portal access automatically |

### 4.3 Student, guardian, course and batch

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| STD-01 | P0 | Canonical student profile | Student has tenant-scoped identity and searchable admission/contact identifiers; possible duplicates can be reconciled |
| STD-02 | P0 | Guardian relationship | Guardian link has relationship, permissions and effective dates; unlinked guardian cannot read student data |
| STD-03 | P0 | Academic year/course/batch | Batch belongs to branch/course/year; enrolment references a valid tenant-compatible batch |
| STD-04 | P0 | Enrolment history | Batch transfer closes prior enrolment and creates new one; prior attendance, fee and result history remains intact |
| STD-05 | P0 | Student status lifecycle | Active, completed, transferred, withdrawn and suspended states are explicit and audited |
| STD-06 | P0 | Student portal | Student can view own profile, active batch, schedule, exams, attempts and published results |
| STD-07 | P1 | Bulk student import | Preview identifies duplicates, invalid values and row-level failures before commit |
| STD-08 | P1 | Document management | Private file access checks tenant and student scope; file type/size is validated; access is audited |

### 4.4 Academic delivery and attendance

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| ACA-01 | P0 | Subject/syllabus taxonomy | Course subjects link to chapters/topics; IDs remain stable if labels change |
| ACA-02 | P0 | Faculty assignment | Teacher can access only assigned batch/subject scope unless separately granted |
| ACA-03 | P0 | Timetable | Session records teacher, batch, subject, topic, time and mode; conflicting schedules are warned/blocked by policy |
| ACA-04 | P0 | Attendance | Teacher records attendance for an assigned session; roster is limited to that batch |
| ACA-05 | P0 | Attendance correction | Correction requires reason and approval policy; original value and corrected value remain auditable |
| ACA-06 | P1 | Topic coverage tracking | Teacher records covered topics; coordinator sees planned vs delivered coverage |
| ACA-07 | P1 | Homework/submissions | Assignment has target batch, due date, attachment rules and submission status; teacher can grade and return feedback |
| ACA-08 | P1 | Study materials | Material access is constrained by enrolled batch/course and active publication state |

### 4.5 Fees and finance

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FIN-01 | P0 | Fee plans/components | Fee plan defines components, amounts, academic scope and effective dates |
| FIN-02 | P0 | Student charges/instalments | Charge schedule has due date and outstanding balance; partial payment updates balance correctly |
| FIN-03 | P0 | Concessions/scholarships | Discount needs reason, approver, amount/percentage and effective period |
| FIN-04 | P0 | Record manual payment | Cash/UPI/bank/cheque records reference, payer, amount, date and receiving actor |
| FIN-05 | P0 | Payment allocation | Allocation across charges cannot exceed permitted available payment; duplicate reference is detected |
| FIN-06 | P0 | Receipt generation | Unique receipt ID and payment snapshot can be printed/downloaded; receipt status is traceable |
| FIN-07 | P0 | Refund/reversal/adjustment | Original posting remains; correction is a separate event linked to original |
| FIN-08 | P1 | Due reminders | Reminder job is idempotent; UI distinguishes queued, sent, failed and provider-unconfirmed status |
| FIN-09 | P1 | Finance reporting | Student ledger and branch collection totals reconcile to underlying transactions |
| FIN-10 | P2 | Payment gateway adapter | Webhook signature verified; idempotency prevents duplicate posting; provider credentials remain secret |

### 4.6 Question bank and import

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| QBN-01 | P0 | Reusable question bank | Question is separate from paper and can be reused by multiple papers |
| QBN-02 | P0 | Question metadata | Store course/subject/chapter/topic, type, language, difficulty, skill, marks, tags and author |
| QBN-03 | P0 | Objective item | MCQ supports prompt, four or more configured options, correct answer, explanation and scoring policy |
| QBN-04 | P0 | Subjective item | Short/long/essay item supports rubric, maximum marks, evaluator guidance and attachments |
| QBN-05 | P0 | Versioning/review | Draft → Review → Approved → Retired lifecycle; approved/used version cannot be silently overwritten |
| QBN-06 | P0 | Question media | Image/diagram/equation attachment has alt text/caption where relevant and private access |
| QBN-07 | P0 | Duplicate detection | Similarity checks flag probable duplicates for human decision; system does not automatically delete legitimate variants |
| QBN-08 | P1 | Bulk import preview | Import shows total parsed, accepted, warnings, rejected and per-row errors before confirmation |
| QBN-09 | P1 | Document import | DOCX/CSV/XLSX supported subset is documented and tested against Hindi, Unicode, symbols and images |
| QBN-10 | P1 | Import/export history | Each import/export records actor, template/version, timestamp, result and downloadable error report |
| QBN-11 | P2 | QTI subset interoperability | Supported item types map through a versioned import/export profile with unsupported-item warnings |

### 4.7 Blueprint and paper generation

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| PBG-01 | P0 | Blueprint authoring | Blueprint defines sections, syllabus scope, count, marks, type and duration |
| PBG-02 | P0 | Difficulty/topic constraints | Each section can specify topic/difficulty distribution; unavailable pool is reported before generation |
| PBG-03 | P0 | Deterministic generation | Store seed, generator version, rule set and selected question-version IDs; same inputs/version produce same result |
| PBG-04 | P0 | Validation | Paper cannot be approved when count, marks, duplicates, distribution or section limits fail |
| PBG-05 | P0 | Manual replacement | Replacement must satisfy eligibility rules and reruns full validation |
| PBG-06 | P0 | Paper approval/freeze | Approval creates immutable PaperVersion and answer-key snapshot |
| PBG-07 | P0 | Printable output | Student paper excludes protected keys; teacher copy includes key/rubric; exports match approved version |
| PBG-08 | P1 | Multiple equivalent sets | Set comparison reports syllabus, difficulty, section and marks distribution differences |
| PBG-09 | P1 | Paper templates | Institute can save reusable blueprints and section templates |
| PBG-10 | P1 | Paper import from files | Uploaded existing papers are parsed into candidate questions with confidence and review status |

### 4.8 Exam delivery

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| EXM-01 | P0 | Exam scheduling/assignment | Exam references frozen PaperVersion and target set of eligible students/batches |
| EXM-02 | P0 | Availability window | Start/close and timezone are explicit; exam cannot start outside permitted window |
| EXM-03 | P0 | Server-authoritative timer | Deadline uses database/server time; changing client clock does not extend attempt |
| EXM-04 | P0 | Autosave | Save acknowledgement occurs only after committed answer revision |
| EXM-05 | P0 | Reconnect recovery | Refresh/re-login returns latest acknowledged revision; stale writes cannot overwrite newer state |
| EXM-06 | P0 | Submission idempotency | Double-click/network retry produces one final submitted attempt |
| EXM-07 | P0 | Auto-submit | Server finalises expired attempts according to policy; late answer writes are rejected |
| EXM-08 | P0 | Attempt rules | Max attempts and retake rules are checked server-side |
| EXM-09 | P1 | Section navigation/timing | Per-section time and navigation policy are enforced and visible to student |
| EXM-10 | P1 | Result/answer visibility policy | Marks, correct answers, explanations and rank can be released separately by time/policy |
| EXM-11 | P1 | Accommodations | Additional time or approved access adjustment is linked to an authorised request and audited |
| EXM-12 | P1 | Exam operational signals | Reconnect/tab/fullscreen events are timestamped and presented as signals, not definitive cheating proof |

### 4.9 Evaluation, results and analytics

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| RES-01 | P0 | Objective auto-grading | Score is calculated from frozen key and policy; repeated evaluation is reproducible |
| RES-02 | P0 | Subjective marking queue | Submitted subjective answers are assigned to authorised examiners |
| RES-03 | P0 | Rubric marking | Marks cannot exceed maximum; rubric/comment and examiner are recorded |
| RES-04 | P0 | Result approval/publication | Only authorised role can publish; publication creates immutable snapshot and timestamp |
| RES-05 | P0 | Student result privacy | Student can access only own published result; unpublished marks are not exposed |
| RES-06 | P1 | Regrade/moderation | Regrade needs reason; prior score, new score, actor and timestamps remain visible |
| RES-07 | P1 | Rank/percentile | Calculation defines cohort, included attempts, ties and population size |
| RES-08 | P1 | Topic/item analytics | Report shows attempted/total denominator and maps question-version to topic |
| RES-09 | P1 | Batch/subject dashboards | Teacher can compare students and batches within authorised scope |
| RES-10 | P1 | Remedial follow-up | Teacher can create a revision/homework task from weak-topic insight and track outcome |
| RES-11 | P2 | Advanced exam item analysis | Support item difficulty, discrimination and distractor analysis after sufficient response volume |

### 4.10 Governance, reports and operations

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| GOV-01 | P0 | Audit trail | Privileged changes, finance events, exam submit, grading, publication and export record actor/action/entity/time |
| GOV-02 | P0 | Tenant isolation | API, SQL, files, exports, caches and workers reject cross-tenant access; adversarial tests pass |
| GOV-03 | P0 | Input/file security | Request validation, parameterised SQL, MIME/size checks, private uploads and safe error handling |
| GOV-04 | P0 | Backup/restore | Documented backup schedule and a successful isolated restore drill with measured RPO/RTO |
| GOV-05 | P1 | Data export | Authorised scoped export includes export log and avoids excess fields |
| GOV-06 | P1 | Privacy request workflow | Data access/correction/erasure request is verified, assessed against retention needs and audited |
| GOV-07 | P1 | Operational dashboards | Show failed jobs, payment reconciliation exceptions, exam finalisation backlog and import errors |
| GOV-08 | P2 | Notification adapters | Email/SMS/WhatsApp providers are optional; delivery status reflects actual provider response |

---

## 5. Non-functional requirements

| Area | Requirement | Verification |
|---|---|---|
| Security | Least privilege, secure cookies/session rotation, password hashing, rate limits, CSRF/XSS/IDOR protections | Threat model, ASVS-based tests, external penetration test before production |
| Tenant isolation | No cross-tenant read/write via API, SQL, export, files, cache or jobs | Adversarial integration test suite |
| Reliability | Acknowledged exam answers survive refresh/reconnect; submit is idempotent | E2E network interruption and race tests |
| Performance | No capacity claim before concurrent-load tests | Test 100/300/1,000 simultaneous attempts; record p95/p99 and errors |
| Accessibility | WCAG 2.2 AA target for core web/student flows | Keyboard, screen-reader, zoom and automated accessibility tests |
| Mobile | Responsive flows on Android/iOS browser and tablets | Physical-device testing on supported browser versions |
| Internationalisation | Unicode-safe names/search; Hindi/English interface readiness; timezone-aware display | Hindi/English and timezone regression suite |
| Auditability | Immutable history for assessment and financial events | Database constraint and audit integrity tests |
| Privacy | Data minimisation, purpose-aware access, retention policy and guardian link controls | Data-flow review and legal review |
| Operability | Structured logs, metrics, alerting, secret management and restore procedure | Staging operational drill |

Performance tiers are test scenarios, not guaranteed capacity. Numeric service-level objectives must be agreed after baseline measurements and pilot workloads.

---

## 6. MVP release gates

A pilot cannot be declared ready until all P0 requirements have evidence.

### Gate A — identity and isolation
- Login, logout, session expiry and account disable work.
- Roles and branch-scoped access are enforced by API.
- Tenant A cannot access Tenant B through altered URLs, IDs, exports or background jobs.
- Audit trail exists for privileged actions.

### Gate B — student lifecycle
- Enquiry can become admission and enrolment.
- Student identity is not duplicated by multiple accounts or enquiries.
- Batch transfer retains historical records.
- Student and guardian views are scoped correctly.

### Gate C — academic operations
- Course, subject, topic, batch and faculty assignments work.
- Attendance corrections are audited.
- Fee partial payments, receipts, reversals and reconciliation totals are consistent.

### Gate D — assessment integrity
- Approved question versions can be reused.
- Import preview exposes malformed data.
- Blueprint shortage is explicit; no silent substitutions.
- Paper and answer key are frozen after approval.

### Gate E — exam reliability
- Start/deadline are server-authoritative.
- Acknowledged answers survive refresh and network interruption.
- Submit and auto-submit race safely.
- Duplicate submit does not create multiple attempts/results.

### Gate F — evaluation and results
- Objective marks are reproducible.
- Subjective marking respects maximum marks and rubric.
- Only authorised users publish results.
- Regrade history is retained.
- Student cannot see another student's result.

### Gate G — production controls
- Backup restores successfully in an isolated environment.
- Security, privacy, dependency and accessibility reviews are complete.
- Measured load results support the target pilot size.
- Institute pilot scenarios are signed off.

---

## 7. Mapping to business workflows

| Workflow | Requirement groups |
|---|---|
| WF-01 Institute onboarding | IAM-01 to IAM-05, GOV-01, GOV-02 |
| WF-02 Enquiry to admission | CRM-01 to CRM-09, STD-01, STD-02, FIN-01 |
| WF-03 Student/batch lifecycle | STD-01 to STD-08, IAM-06 |
| WF-04 Teaching/timetable | ACA-01 to ACA-03 |
| WF-05 Attendance | ACA-04 to ACA-06 |
| WF-06 Fees | FIN-01 to FIN-10 |
| WF-07 Question bank | QBN-01 to QBN-11 |
| WF-08 Paper generation | PBG-01 to PBG-10 |
| WF-09 Exam scheduling | EXM-01, EXM-02, EXM-08, EXM-10 |
| WF-10 Exam attempt | EXM-03 to EXM-07, EXM-11, EXM-12 |
| WF-11 Evaluation/results | RES-01 to RES-07 |
| WF-12 Analytics/intervention | RES-08 to RES-11, ACA-07 |
| WF-13 Certificate | Future P1/P2 module; completion criteria to be defined with pilot |
| WF-14 Privacy/data lifecycle | GOV-01 to GOV-08, IAM-03, IAM-07 |

---

## 8. Repository implementation snapshot (16 November 2026)

This is a limited source inspection of the current default branch, not a runtime test.

### Observed in repository
- The repository includes product baseline documents: `SRS.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `QA-PLAN.md`, `DECISIONS.md` and `ROADMAP.md`.
- The web app navigation includes Dashboard, Students, Batches, Courses, Paper, Tests & Exams, Results, Fee Management, Reports and Settings.
- In the inspected `App.tsx`, non-Paper/non-Tests pages such as Students, Batches, Courses and Fee Management render a planned-module placeholder rather than a complete workflow.
- Paper/Student Exam demo records in `demo-paper-store.ts` are persisted in browser `localStorage`; student attempts are created using entered name and roll number, not a verified user account.
- The inspected API entry point currently exposes `/api/v1/health` and `/api/v1` foundation responses. The inspected `migrate.ts` applies `001_student_enquiry_management.sql`; `seed.ts` includes enquiry stages, transitions, sources and permissions.
- A backend foundation and Enquiry-related migration/seed code are not evidence that complete production authentication, every ERP module or cross-device paper/exam persistence is finished.

### Required interpretation
- Treat this requirements document as a target specification.
- Mark a requirement complete only when implementation, automated tests and relevant runtime evidence exist.
- The browser-local exam demo is useful for same-browser workflow exploration; it does not satisfy server-side identity, cross-device persistence, tenant isolation or production exam reliability.
- Do not remove or replace working demo features while implementing the proper API and database path. Define a migration/compatibility plan before moving existing demo data.

---

## 9. Definition of done for any module

A module is complete only when all are true:

1. Requirements and allowed state transitions are documented.
2. Database model and migration are reviewed.
3. API validates input and derives identity/tenant scope server-side.
4. Permission checks work for allowed and denied cases.
5. UI supports loading, empty, success, validation, error and retry states.
6. Audit and history requirements are met.
7. Unit, integration and E2E tests pass.
8. Keyboard/mobile/accessibility checks pass for the critical workflow.
9. Documentation and operational runbook are updated.
10. Build/deployment succeeds and the deployed workflow is manually verified.

A commit, merged UI or successful build alone is not proof of end-to-end completion.
