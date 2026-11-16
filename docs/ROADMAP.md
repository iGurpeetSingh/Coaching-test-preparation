# Implementation Roadmap

Status updated: 16 November 2026. Checkmarks mean code or documentation exists in the repository; they do not imply production validation.

## Phase 0 — Repository foundation
- [x] Product research, requirements and architecture documentation baseline.
- [x] React/TypeScript web workspace.
- [x] Express/TypeScript API workspace.
- [x] Responsive dashboard shell and liveness/readiness endpoints.
- [x] GitHub Actions typecheck, unit-test and production-build workflow.
- [x] Workspace test command and six API domain unit tests.
- [x] Ordered SQL migration runner and local bootstrap environment example.
- [ ] Generate/commit a reproducible npm lockfile and audit dependency licenses/install scripts.

## Phase 1 — Platform foundation
- [x] Tenant, branch, membership, role, permission and session schema.
- [x] CSRF bootstrap, login, logout, current-user and permission middleware.
- [x] PostgreSQL migrations with forced tenant RLS on tenant-owned tables.
- [x] Tenant-scoped transaction helper and database readiness check.
- [x] Activity and audit log writes for admissions/enquiries.
- [ ] Database-backed authentication/migration integration tests and adversarial tenant-isolation tests.
- [ ] MFA, invite lifecycle, password recovery and privileged-action re-authentication.

## Phase 2 — Institute ERP
- [x] Enquiry CRM API/UI: create, search, transition, assignment, archive/restore and activity.
- [x] Admission conversion with student creation/reuse, fee validation, batch capacity and audit trail.
- [x] Course and batch APIs/UI with branch scoping.
- [x] Admitted-student directory API/UI with search and pagination.
- [x] Attendance session, roster, mark and submit API/UI.
- [x] Fee charge, payment allocation and receipt APIs/UI.
- [ ] Fee instalments, concessions, refund/reversal approval and reconciliation reports.
- [ ] Timetable, academic-year lifecycle, faculty and guardian management.
- [ ] Homework, assignment submission and study-material access.

## Phase 3 — Question Bank
- [x] Subject/chapter/topic syllabus schema and create/list APIs.
- [x] Question authoring for objective and subjective types.
- [x] Draft/review/publish/archive lifecycle and new-version creation.
- [x] Question Bank UI with syllabus authoring and review actions.
- [ ] Full bulk import preview, row-level validation, export and question usage history.
- [ ] Multi-reviewer approval, media attachments and richer answer-key editing.

## Phase 4 — Paper Generator
- [ ] Replace browser-local Paper Builder store with database-backed paper APIs.
- [ ] Blueprint editor, section/marks constraints and shortage report.
- [ ] Deterministic question selection, duplicate prevention and immutable paper snapshots.
- [ ] Printable question paper and answer-key PDF.

## Phase 5 — Online Examinations
- [ ] Secure student/guardian portal account linking and exam eligibility.
- [ ] Exam schedule and assignments.
- [ ] Server-authoritative timer and deadline.
- [ ] Transactional answer autosave, revision history, reconnect recovery and idempotent submit.
- [ ] Objective grading and manual rubric evaluation.

## Phase 6 — Results and analytics
- [ ] Evaluation moderation, approval and controlled publication.
- [ ] Student/batch/branch performance reports and exports.
- [ ] Topic/question item analysis and intervention tracking.

## Phase 7 — Production readiness and optional advanced features
- [ ] Database integration/security tests, penetration test and accessibility audit.
- [ ] Institute pilot, load test, monitoring, incident runbooks and measured SLOs.
- [ ] Backup restore drill and documented RPO/RTO.
- [ ] Privacy/tax professional review and data-retention implementation.
- [ ] PWA/offline, OMR (after accuracy pilot), supported-subset QTI, and optional payment/messaging/AI/proctoring adapters.

## Release gates

Production launch is blocked until all P0 workflows pass tests, tenant isolation is verified, no critical/high vulnerabilities remain, institute pilot sign-off is recorded, privacy/tax review is completed, load targets are measured, backups are restored successfully and incident response is ready.
