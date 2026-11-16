# Coaching & Test Preparation

A multi-tenant coaching-institute operations and test-preparation platform. The repository contains product research, a React/Vite dashboard prototype and an Express/PostgreSQL API.

## Current implementation status — 16 November 2026

The latest verified GitHub Actions run passes frontend/backend TypeScript checks, six API domain tests and both production builds.

### Implemented in the repository

- Product research, competitor scan, business workflows, functional requirements, architecture and QA baseline.
- React + TypeScript + Vite dashboard shell.
- Express + TypeScript API with liveness and database-readiness endpoints.
- Authentication/session routes: CSRF bootstrap, login, logout and current-user context.
- Enquiry CRM routes: dashboard, list, create, update, status transitions, assignment, activity, archive and restore.
- Admission conversion: creates/reuses a student, validates course/batch/fees and writes audit/activity history.
- Follow-up worklists, creation, completion and cancellation.
- Tenant-scoped course and batch list/create/update APIs.
- Tenant/branch-scoped student directory API.
- PostgreSQL migration for institute identity, roles, courses, batches, enquiries, students, admissions, follow-ups and audit/idempotency records.
- GitHub Actions CI for typecheck, unit tests and production builds.

### Still in progress

- The dashboard navigation still contains placeholder screens; the new courses, batches and student APIs are not yet wired into the React UI.
- Paper Builder and Test Management are browser-local demo features, not shared multi-device services.
- Question bank, syllabus mapping, timetable, attendance, homework, fees/collections/refunds, secure online attempts, evaluation and result analytics require implementation.
- Database-backed integration/security tests and production operational validation remain outstanding.

## Product modules

1. Institute, branch, user and role management.
2. Enquiries, admissions, students, guardians, courses and batches.
3. Timetable, attendance, homework and learning resources.
4. Fee plans, instalments, collections, receipts, dues and refunds.
5. Versioned question bank and syllabus mapping.
6. Blueprint-based paper generation and printable PDF output.
7. Online examinations with server-authoritative timing, autosave and recovery.
8. Objective/manual evaluation, result publication and analytics.

## Development principles

- Core workflows must not depend on third-party APIs.
- Tenant and branch authorization is enforced server-side and at the database layer.
- Question, paper, attempt, result and financial history must remain auditable.
- Blueprint shortages must be reported; questions must never be silently substituted.
- Responsive, keyboard-accessible UI with Hindi/English readiness.
- No production capacity or compliance claim without evidence.

## Documentation

- `docs/INDUSTRY-RESEARCH-AND-COMPETITOR-ANALYSIS.md` — market segments, public-source competitor comparison and product priorities.
- `docs/INDUSTRY-RESEARCH-COMPETITOR-ANALYSIS.md` — earlier research baseline; reconcile/archive after review.
- `docs/BUSINESS-WORKFLOWS.md` and `docs/END-TO-END-BUSINESS-WORKFLOWS.md` — operational workflows.
- `docs/FUNCTIONAL-REQUIREMENTS-AND-ACCEPTANCE.md` — roles, requirement IDs and acceptance criteria.
- `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/SRS.md` — technical baseline.
- `docs/QA-PLAN.md` — test and release gates.
- `docs/ROADMAP.md` — implementation phases and verified status.

## Local development

Requirements: Node.js 26 (see `.nvmrc`) and PostgreSQL.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The web app runs at `http://localhost:5173`; the API runs at `http://localhost:4000`.

### Database setup

```bash
# from the repository root
npm run migrate --workspace @coaching/api
npm run seed --workspace @coaching/api
```

Before running the seed command, set `DATABASE_URL` and the bootstrap variables documented in `apps/api/README.md`. Never use real production credentials in local development or commit secrets.

### API health

- `GET /api/v1/health` — process liveness.
- `GET /api/v1/ready` — PostgreSQL readiness.

Production launch remains gated by integration/security tests, institute pilot validation, privacy/tax review, measured load tests, backup-restore drills and incident-response readiness.
