# Architecture Baseline

## 1. Deployment shape

Start with a modular monolith:
- React/Vite/TypeScript client.
- Node.js/Express/TypeScript API.
- PostgreSQL.
- Background worker for imports, exports, notifications and scheduled processing.
- Private object storage behind an adapter.
- CDN/WAF/TLS at the edge.

Keep module boundaries explicit. Do not introduce microservices before measured scaling or ownership needs require them.

## 2. Modules

Platform/Tenants; Identity & Access; Institute/Branches; Admissions; Academics; Classroom Operations; Finance; Question Bank; Assessment; Results/Analytics; Governance/Audit; Notifications.

## 3. Tenancy

Initial model: shared PostgreSQL database and schema, with tenant_id on all tenant-owned records and branch_id where needed.

Required controls:
1. Resolve tenant membership from authenticated server identity.
2. Use transaction-local tenant context.
3. Enable RLS and FORCE ROW LEVEL SECURITY where appropriate.
4. Application DB role is not superuser, table owner or BYPASSRLS.
5. Use tenant-aware unique keys and composite foreign keys.
6. Scope jobs, files, caches, exports and reports by tenant.
7. Audit cross-tenant support access.
8. Test absent tenant context, wrong tenant, wrong branch and privilege bypass attempts.

RLS is not a complete boundary when the application connects as a table owner or privileged role.

## 4. API

Version routes under /api/v1. Validate request payloads at boundaries. Use server-derived tenant scope, parameterised SQL, pagination, consistent error codes, idempotency keys for payment posting and exam submit. Use secure HttpOnly cookies or a reviewed equivalent; apply CSRF protection when cookie auth is used.

## 5. Exam reliability

Store server start/deadline, paper version, scoring-policy version and attempt state. Answer writes include question, attempt, revision and idempotency token. Acknowledge saves only after transaction commit. Reconnect reconciles revisions. Submit is transactional/idempotent; expired attempts auto-submit using database time. Preserve exact question and answer-key versions for reproducibility.

Client clock, browser storage and tab-change events are not trusted authorities.

## 6. Finance integrity

Use fixed-precision numeric amounts. Payment and its allocations are separate records. Posted financial events are append-only. Correct through refund, reversal or adjustment. Snapshot tax and fee-rule versions at posting. Future gateway adapters must verify signatures and deduplicate webhooks.

## 7. Jobs and files

Use transactional outbox for important background work. Workers must be tenant-scoped and idempotent, with retry/backoff and observable failure state. Uploads use random object names, detected MIME validation, size limits, ownership checks and private storage.

## 8. Security and operations

Use Argon2id, secure session rotation/revocation, MFA for privileged roles, rate limiting, input validation, parameterised SQL, CSRF/XSS/IDOR protections and audit logging. Map security release checks to OWASP ASVS 5.0 Level 2, with additional controls for child and financial data.

Use separate dev/staging/prod environments, externalised secrets, structured logs, metrics, encrypted backups, WAL/PITR where supported and restore drills. Define RPO/RTO before production.

## 9. Offline

PWA caching and IndexedDB outbox may support limited offline features. Foreground retry is mandatory because Background Sync is not universal. Offline exam mode is policy-controlled and not tamper-proof; final scoring and eligibility are server validated.

## 10. Performance

Initial test scenarios: 100, 300 and 1,000 concurrent attempts. These are load-test tiers, not a capacity promise. Measure save acknowledgement latency, p95/p99, errors, DB pool saturation, lock waits and queue lag before sizing production.
