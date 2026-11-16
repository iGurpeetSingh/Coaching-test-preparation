# API workspace

Express + TypeScript API for the coaching platform.

## Commands

Run from the repository root:

- `npm run dev:api` — start API at http://localhost:4000
- `npm run typecheck` — typecheck all workspaces
- `npm test` — run API domain tests
- `npm run build` — build all workspaces
- `npm run migrate --workspace @coaching/api` — apply the SQL migration
- `npm run seed --workspace @coaching/api` — create an initial institute and owner

## Database bootstrap

Set these environment variables before migration/seeding:

- `DATABASE_URL` — PostgreSQL connection string.
- `BOOTSTRAP_TENANT_NAME` — institute name.
- `BOOTSTRAP_TENANT_SLUG` — unique lowercase workspace slug.
- `BOOTSTRAP_ADMIN_NAME` — initial owner name.
- `BOOTSTRAP_ADMIN_EMAIL` — owner email.
- `BOOTSTRAP_ADMIN_PASSWORD` — strong password of at least 12 characters.

The seed creates a main branch, an owner membership, default enquiry statuses/transitions and enquiry sources. Use a fresh development database and keep bootstrap credentials out of source control.

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
| POST | `/api/v1/auth/logout` | Revoke the current session |

For mutating requests, send the CSRF token in `x-csrf-token` and include cookies. Login and all business mutations require the CSRF cookie/header to match.

## Institute and academic APIs

All routes below require a valid session and the documented permission.

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/courses` | `admissions.read` | List active courses |
| POST | `/api/v1/courses` | `courses.manage` | Create course |
| PATCH | `/api/v1/courses/:id` | `courses.manage` | Update/deactivate course |
| GET | `/api/v1/batches` | `admissions.read` | List batches within accessible branches |
| POST | `/api/v1/batches` | `courses.manage` | Create branch/course batch |
| PATCH | `/api/v1/batches/:id` | `courses.manage` | Update/deactivate batch |
| GET | `/api/v1/students` | `admissions.read` | Search and page through admitted students |

Batch/student lists honour branch access. Courses and batches are soft-deactivated; historic admissions are not deleted.

## Enquiry, admission and follow-up APIs

| Method | Route | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/dashboard` | `enquiries.read` | Enquiry dashboard |
| GET | `/api/v1/enquiries` | `enquiries.read` | Search/filter enquiries |
| POST | `/api/v1/enquiries` | `enquiries.create` | Create enquiry |
| GET | `/api/v1/enquiries/:id` | `enquiries.read` | Enquiry details and activity history |
| PATCH | `/api/v1/enquiries/:id` | `enquiries.update` | Update enquiry fields |
| PATCH | `/api/v1/enquiries/:id/status` | `enquiries.update` | Move through allowed status transitions |
| POST | `/api/v1/enquiries/:id/assign` | `enquiries.assign` | Assign counsellor |
| POST | `/api/v1/enquiries/:id/assign/round-robin` | `enquiries.assign` | Auto-assign counsellor |
| POST | `/api/v1/enquiries/:id/activities` | `enquiries.update` | Add activity |
| POST | `/api/v1/enquiries/:id/archive` | `enquiries.archive` | Archive enquiry |
| POST | `/api/v1/enquiries/:id/restore` | `enquiries.archive` | Restore enquiry |
| POST | `/api/v1/admissions/enquiries/:id/convert` | `admissions.convert` | Convert enquiry to admission and student |
| GET | `/api/v1/admissions` | `admissions.read` | List admissions |
| GET | `/api/v1/followups` | `followups.read` | Follow-up worklist |
| POST | `/api/v1/followups/enquiries/:id` | `followups.manage` | Schedule follow-up |
| PATCH | `/api/v1/followups/:id/complete` | `followups.manage` | Complete follow-up |
| PATCH | `/api/v1/followups/:id/cancel` | `followups.manage` | Cancel follow-up |

## Error handling

Errors use a stable JSON envelope: `{ "error": { "code": "...", "message": "..." } }`.

- Validation errors return HTTP 400.
- Unauthenticated requests return HTTP 401.
- Permission/branch violations return HTTP 403 (or not-found for scoped enquiry lookup).
- Duplicate codes/identifiers return HTTP 409.
- Missing records return HTTP 404.
- Unexpected failures return HTTP 500 without exposing SQL or stack details.

## Current limitations

- The dashboard has not yet been connected to these APIs.
- Database-backed integration tests, tenant-isolation abuse tests and automated migration/seed tests are still required.
- Timetable, attendance, fee accounting, question bank, online attempts, grading and result APIs are not yet implemented.
