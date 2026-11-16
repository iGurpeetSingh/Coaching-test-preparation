# Implementation Roadmap

Status updated: 16 November 2026. Checkmarks mean code or documentation exists in the repository; they do not imply production validation.

## Phase 0 — Repository foundation
- [x] Product research, requirements and architecture documentation baseline.
- [x] React/TypeScript web workspace.
- [x] Express/TypeScript API workspace.
- [x] Responsive dashboard shell and liveness/readiness API endpoints.
- [x] GitHub Actions typecheck and production build workflow.
- [x] Workspace test command and six domain unit tests.
- [ ] Generate and commit a reproducible npm lockfile; audit dependency licenses and install scripts.

## Phase 1 — Platform foundation
- [x] Tenant, branch, membership, role, permission and session schema.
- [x] CSRF bootstrap, login, logout, current-user and permission middleware.
- [x] PostgreSQL migration with forced tenant RLS on tenant-owned tables.
- [x] Tenant-scoped transaction helper and database readiness check.
- [x] Enquiry/admission activity and audit log writes.
- [ ] Database-backed authentication, migration and tenant-isolation integration tests.
- [ ] Adversarial RLS tests using the same non-owner application database role used in deployment.
- [ ] MFA, invitation lifecycle, password recovery and privileged-action re-authentication.

## Phase 2 — Institute ERP
- [x] Enquiry CRM API: create, search, update, transition, assign, archive/restore and activity.
- [x] Follow-up API: worklist, create, complete and cancel.
- [x] Admission conversion with duplicate-student reuse, fee validation, batch capacity check and audit.
- [x] Course API: list, create, update and deactivate.
- [x] Batch API: branch-scoped list, create, update and deactivate.
- [x] Admitted-student directory API with search, pagination and branch scoping.
- [x] Connect login, dashboard CRM metrics, enquiry, student, course and batch screens to the API.
- [ ] Branch administration, academic years, faculty and guardian relationship management.
- [ ] Timetable, attendance, corrections/approvals, homework and study material.
- [ ] Fee plans, instalments, payment allocations, receipts, refunds, expenses and reconciliation.

## Phase 3 — Question Bank
- [ ] Syllabus taxonomy and subject/chapter/topic mapping.
- [ ] Versioned objective and subjective question authoring, review and media.
- [ ] Bulk import preview, row-level validation, import report and export.
- [ ] Question usage history and permissioned approval.

## Phase 4 — Paper Generator
- [ ] Replace browser-local paper storage with database-backed paper APIs.
- [ ] Blueprint editor, section/marks constraints and shortage report.
- [ ] Deterministic question selection, duplicate prevention and immutable paper snapshots.
- [ ] Printable question paper and answer-key PDF.

## Phase 5 — Online Examinations
- [ ] Exam schedule, eligibility, assignment and student identity checks.
- [ ] Server-authoritative timer and deadline.
- [ ] Answer revisions, transactional autosave, reconnect recovery and idempotent submit.
- [ ] Objective grading and manual rubric evaluation.

## Phase 6 — Results and analytics
- [ ] Evaluation moderation, approval and controlled publication.
- [ ] Student/batch/branch performance reports and exports.
- [ ] Topic/question item analysis and intervention tracking.

## Phase 7 — Optional advanced features
- [ ] PWA/offline workflows with explicit sync/reconciliation.
- [ ] OMR only after a representative accuracy pilot.
- [ ] Supported-subset QTI import/export.
- [ ] Optional payment, messaging, AI and proctoring adapters.

## Release gates

Each phase requires passing module tests, authorization tests and relevant security checks. Production launch additionally requires an institute pilot, privacy/tax professional review, penetration testing, measured load targets, backup restore drill, RPO/RTO definition and incident-response readiness.
