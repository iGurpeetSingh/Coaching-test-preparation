# API workspace

Express + TypeScript API for the coaching platform.

## Commands

Run from the repository root:

- `npm run dev:api` — start API at http://localhost:4000
- `npm run typecheck` — typecheck all workspaces
- `npm test` — run API domain tests
- `npm run build` — build all workspaces
- `npm run migrate --workspace @coaching/api` — apply ordered SQL migrations
- `npm run seed --workspace @coaching/api` — create an initial institute owner and default roles

## Database bootstrap

Set `DATABASE_URL` and the bootstrap variables in `.env.example` before running migrations and seed. The seed creates a main branch, owner membership, default enquiry sources/status transitions and roles for branch administration, counselling, teaching, academic coordination, accounting and examination control. Keep bootstrap credentials out of source control.

Migration files matching `NNN_name.sql` run in lexical order. Applied migrations are recorded in `schema_migrations`.

## Health endpoints

- `GET /api/v1` — API metadata and mounted module list.
- `GET /api/v1/health` — process liveness; does not require PostgreSQL.
- `GET /api/v1/ready` — readiness check; returns HTTP 503 when PostgreSQL is unavailable.

## Authentication

All business routes require an authenticated session. Login uses a CSRF bootstrap token and secure cookies.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/auth/csrf` | Issue pre-auth CSRF token |
| POST | `/api/v1/auth/login` | Sign in with email, password and optional tenant slug |
| GET | `/api/v1/auth/me` | Return current user, roles, permissions and accessible branches |
| POST | `/api/v1/auth/logout` | Revoke current session |

Send the CSRF token in `x-csrf-token` and include cookies on mutating requests.

## Institute, academic and admissions APIs

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET/POST/PATCH | `/api/v1/courses` and `/api/v1/courses/:id` | `admissions.read` / `courses.manage` | List/create/update/deactivate courses |
| GET/POST/PATCH | `/api/v1/batches` and `/api/v1/batches/:id` | `admissions.read` / `courses.manage` | Branch-scoped batch management |
| GET | `/api/v1/students` | `admissions.read` | Search/page admitted students |
| GET | `/api/v1/dashboard` | `enquiries.read` | Enquiry pipeline metrics and trends |
| GET/POST | `/api/v1/enquiries` | `enquiries.read` / `enquiries.create` | Search and create prospective student leads |
| GET/PATCH | `/api/v1/enquiries/:id` | `enquiries.read` / `enquiries.update` | View/update an enquiry |
| PATCH | `/api/v1/enquiries/:id/status` | `enquiries.update` | Move through configured lifecycle |
| POST | `/api/v1/enquiries/:id/assign` | `enquiries.assign` | Assign counsellor |
| POST | `/api/v1/enquiries/:id/activities` | `enquiries.update` | Append activity to timeline |
| POST | `/api/v1/enquiries/:id/archive` | `enquiries.archive` | Archive enquiry |
| POST | `/api/v1/enquiries/:id/restore` | `enquiries.archive` | Restore enquiry |
| POST | `/api/v1/admissions/enquiries/:id/convert` | `admissions.convert` | Convert enquiry into admission and student |
| GET | `/api/v1/admissions` | `admissions.read` | List admissions |
| GET/POST/PATCH | `/api/v1/followups` and related routes | `followups.read` / `followups.manage` | Worklist, schedule, complete and cancel follow-ups |

## Attendance APIs

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/attendance/sessions` | `attendance.read` | List branch-scoped class sessions |
| POST | `/api/v1/attendance/sessions` | `attendance.manage` | Create a batch attendance session |
| GET | `/api/v1/attendance/sessions/:id/roster` | `attendance.read` | Load enrolled student roster and saved marks |
| PUT | `/api/v1/attendance/sessions/:id/records` | `attendance.manage` | Save present/absent/late/excused marks |
| POST | `/api/v1/attendance/sessions/:id/submit` | `attendance.manage` | Submit a complete register; submitted sessions are read-only |

## Fee APIs

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/fees/charges` | `fees.read` | List charges with allocated and outstanding balances |
| POST | `/api/v1/fees/charges` | `fees.manage` | Add a charge to a student's admission ledger |
| GET | `/api/v1/fees/payments` | `fees.read` | List posted payments |
| POST | `/api/v1/fees/payments` | `fees.manage` | Post payment with charge allocations and issue receipt number |
| GET | `/api/v1/fees/receipts/:receiptNumber` | `fees.read` | Retrieve receipt and allocation details |

Payments must be fully allocated across open charges in the same request. Over-allocation and duplicate payment references are rejected. Refund/reversal workflow and statutory accounting reports are not implemented yet.

## Syllabus and question-bank APIs

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/syllabus` | `question_bank.read` | List subjects, chapters and topics |
| POST | `/api/v1/syllabus/subjects` | `question_bank.manage` | Create subject |
| POST | `/api/v1/syllabus/chapters` | `question_bank.manage` | Create chapter |
| POST | `/api/v1/syllabus/topics` | `question_bank.manage` | Create topic |
| GET | `/api/v1/questions` | `question_bank.read` | Search questions; read-only roles see published questions only |
| POST | `/api/v1/questions` | `question_bank.manage` | Create a draft question |
| PATCH | `/api/v1/questions/:id/status` | `question_bank.manage` | Submit for review, publish or archive |
| POST | `/api/v1/questions/:id/versions` | `question_bank.manage` | Create a new draft version without overwriting history |

Supported question types: single choice, multiple choice, true/false, short answer and long answer. Paper blueprint and online exam integration are still pending.

## Error handling and limitations

Errors use a stable JSON envelope: `{ "error": { "code": "...", "message": "..." } }`. Validation returns HTTP 400, unauthenticated requests 401, permission failures 403, duplicates/concurrency conflicts 409 and missing records 404.

Database-backed integration tests, tenant-isolation abuse tests, refund/reconciliation, secure student portal accounts, online attempts, grading and production operational checks are still required.
