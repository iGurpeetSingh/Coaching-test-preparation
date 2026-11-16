# Coaching & Test Preparation

A coaching-institute platform combining institute administration, academic operations, question-bank management, paper generation, online examinations and result analytics.

## Current stage

- Product research, competitor review, business workflows and functional requirements are documented.
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

## Product and research documentation

- `docs/INDUSTRY-RESEARCH-AND-COMPETITOR-ANALYSIS.md` — market segments, eight-vendor public-source comparison, product positioning and priorities.
- `docs/BUSINESS-WORKFLOWS.md` — end-to-end institute, academic, financial and assessment workflows.
- `docs/FUNCTIONAL-REQUIREMENTS-AND-ACCEPTANCE.md` — role matrix, requirement IDs, priorities and acceptance criteria.
- `docs/RESEARCH-BASELINE.md` — architecture, privacy, finance and operational research baseline.
- `docs/SRS.md` — software requirements overview.
- `docs/ARCHITECTURE.md` — technical architecture baseline.
- `docs/DATA-MODEL.md` — logical data model.
- `docs/QA-PLAN.md` — QA and release test plan.
- `docs/DECISIONS.md` — architecture decision records.
- `docs/ROADMAP.md` — implementation phases and release gates.

## Local development

The repository uses npm workspaces. See the root scripts and each app's README after the initial scaffold is in place.
