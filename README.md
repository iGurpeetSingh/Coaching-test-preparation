# Coaching & Test Preparation

A multi-tenant coaching-institute operations and test-preparation platform. The repository contains product research, a React/Vite dashboard and an Express/PostgreSQL API.

## Verified repository status — 16 November 2026

The latest GitHub Actions run on the main branch passed frontend/backend TypeScript checks, six API domain unit tests and both production builds.

### Implemented code

- Product research, competitor analysis, business workflows, functional requirements, architecture and QA documentation.
- Institute sign-in UI, CSRF bootstrap, session-aware API client and sign-out.
- Institute dashboard with live API-backed student, batch, enquiry and admission metrics.
- Enquiry CRM UI/API: create, search, status transitions, activity, assignment, archive/restore and admission conversion.
- Course and batch management UI/API with branch-scoped records.
- Student directory UI/API with search and pagination.
- Attendance UI/API: class sessions, student roster, marking and submission/lock.
- Fee UI/API: student charges, payment allocation, receipt numbering and payment history.
- Syllabus/question bank UI/API: subjects, chapters, topics, question authoring, review/publish status and version creation.
- PostgreSQL migrations for identity/tenancy, admissions, attendance, finance ledger and question bank, with tenant RLS enabled/forced on tenant-owned records.
- GitHub Actions CI: typecheck, six API domain tests and production builds.

### Known unfinished areas

- Dashboard-connected modules listed above are at the initial operational workflow stage; end-to-end PostgreSQL integration tests and tenant-isolation abuse tests remain required.
- Paper Builder, Student Exam Runner/Library and Results still use browser-local demo storage. They are not yet a shared multi-device examination system.
- Full exam scheduling/assignment, student portal login/linking, server-authoritative exam timer, persistent answer autosave/recovery, objective/subjective grading and result publication are not yet implemented.
- Fee instalment plans, concessions, refund/reversal approval and accounting reconciliation are not yet complete.
- Timetable, homework, study material, guardian relationship management, faculty management and academic-year lifecycle remain outstanding.
- Production launch is blocked pending database deployment/migration, real institute pilot, privacy/tax review, security testing, load testing, monitoring and backup-restore validation.

## Product modules

1. Institute, branch, user and role management.
2. Enquiries, admissions, students, guardians, courses and batches.
3. Timetable, attendance, homework and learning resources.
4. Fee plans, instalments, collections, receipts, dues and refunds.
5. Versioned question bank and syllabus mapping.
6. Blueprint-based paper generation and printable PDF output.
7. Online examinations with server-authoritative timing, autosave and recovery.
8. Objective/manual evaluation, result publication and analytics.

## Documentation

- `docs/INDUSTRY-RESEARCH-AND-COMPETITOR-ANALYSIS.md` — market segments, public-source competitor comparison and product priorities.
- `docs/INDUSTRY-RESEARCH-COMPETITOR-ANALYSIS.md` — earlier research baseline; reconcile/archive after review.
- `docs/BUSINESS-WORKFLOWS.md` and `docs/END-TO-END-BUSINESS-WORKFLOWS.md` — institute workflows.
- `docs/FUNCTIONAL-REQUIREMENTS-AND-ACCEPTANCE.md` — roles, requirements and acceptance criteria.
- `docs/ARCHITECTURE.md`, `docs/DATA-MODEL.md`, `docs/SRS.md` — technical baseline.
- `docs/QA-PLAN.md` — testing and release gates.
- `docs/ROADMAP.md` — implementation phases and remaining work.

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

Copy `.env.example` to `.env`, set a local PostgreSQL URL and unique development bootstrap credentials, then run:

```bash
npm run migrate --workspace @coaching/api
npm run seed --workspace @coaching/api
```

The migration runner applies ordered `NNN_name.sql` files and records applied migrations in `schema_migrations`. Never commit real secrets or reuse production credentials in local development.

### API health

- `GET /api/v1/health` — process liveness.
- `GET /api/v1/ready` — PostgreSQL readiness.

Production launch remains gated by integration/security tests, institute pilot validation, privacy/tax review, measured load tests, backup-restore drills and incident-response readiness.
