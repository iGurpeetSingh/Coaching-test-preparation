# Coaching & Test Preparation

A coaching-institute platform combining institute administration, academic operations, question-bank management, paper generation, online examinations and result analytics.

## Current stage

- Research baseline completed for the agreed desk-research scope.
- Repository foundation is being initialized.
- Application features will be implemented in small, testable modules.
- Production launch remains gated by institute pilot validation, security review, load tests, backup-restore drills and legal/tax review.

## Product modules

1. Institute, branch, user and role management.
2. Admissions, students, guardians, courses and batches.
3. Timetable, attendance, homework and study material.
4. Fee plans, instalments, collections, receipts, dues and refunds.
5. Versioned question bank and syllabus mapping.
6. Blueprint-based paper generation and printable PDF output.
7. Online examination, autosave, recovery and server-authoritative timing.
8. Objective/manual evaluation, result publication and analytics.

## Development principles

- Core workflows must not depend on third-party APIs.
- Tenant and branch authorization is enforced server-side and at the database layer.
- Question, paper, attempt, result and financial history must remain auditable.
- Blueprint shortages must be reported; questions must never be silently substituted.
- Responsive, keyboard-accessible UI with Hindi/English readiness.
- No production capacity or compliance claim without evidence.

## Documentation

- `docs/RESEARCH-BASELINE.md`
- `docs/SRS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA-MODEL.md`
- `docs/QA-PLAN.md`
- `docs/DECISIONS.md`
- `docs/ROADMAP.md`

## Local development

The repository uses npm workspaces. See the root scripts and each app's README after the initial scaffold is in place.
