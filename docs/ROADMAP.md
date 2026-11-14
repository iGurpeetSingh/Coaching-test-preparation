# Implementation Roadmap

## Phase 0 — Repository foundation
- [x] Product documentation baseline.
- [x] React/TypeScript web workspace.
- [x] Express/TypeScript API workspace.
- [x] Responsive dashboard shell and API health route.
- [ ] Install, lock and audit dependencies.
- [ ] Add CI build/typecheck workflow.

## Phase 1 — Platform foundation
- Tenant and branch model.
- Authentication, sessions, membership, roles and permissions.
- PostgreSQL migrations, RLS and tenant-isolation integration tests.
- Audit log, configuration and health/readiness endpoints.

## Phase 2 — Institute ERP
- Enquiries/admissions, student and guardian profiles.
- Courses, academic years, branches, batches, faculty.
- Timetable, attendance, homework and study material.
- Fee plans, instalments, payments, allocations, receipts, refunds and expenses.

## Phase 3 — Question Bank
- Syllabus taxonomy, question authoring and media.
- Question versioning and review.
- Import/export validation and question usage history.

## Phase 4 — Paper Generator
- Blueprint editor and constraint validation.
- Deterministic question selection.
- Duplicate prevention, shortage report and paper snapshots.
- Printable paper and answer-key PDF.

## Phase 5 — Online Examinations
- Exam scheduling and assignments.
- Server-authoritative timer, answer revisions, autosave and recovery.
- Idempotent submit and auto-submit.
- Objective grading and manual rubric grading.

## Phase 6 — Results and analytics
- Result approval/publication.
- Student and batch reports.
- Topic/question item analysis and exports.

## Phase 7 — Optional advanced features
- PWA/offline workflows.
- OMR after pilot accuracy gate.
- QTI supported-subset import/export.
- Optional payment, messaging, AI and proctoring adapters.

## Release gates

Each phase requires passing its module tests, tenant/permission tests and relevant security checks. Production launch additionally requires institute pilot, privacy/tax professional review, penetration testing, measured load targets, backup restore drill and incident-response readiness.
