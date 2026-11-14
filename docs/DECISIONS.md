# Architecture Decision Records

## ADR-001 — Modular monolith for the initial product
**Status:** Accepted

Use one deployable API with explicit module boundaries. This minimises operational overhead while workflows and traffic are not yet known. Split services only when measured scaling, deployment or team ownership requires it.

## ADR-002 — Shared PostgreSQL schema with row-level tenant isolation
**Status:** Accepted for initial SaaS release

Use tenant_id on tenant-owned records, tenant-aware composite foreign keys, RLS and a restricted application DB role. Force RLS where appropriate. Table owner/superuser/BYPASSRLS connections are prohibited for ordinary app traffic. Dedicated database per tenant may be an enterprise option later.

## ADR-003 — Explicit SQL migrations with Kysely
**Status:** Accepted as initial baseline

Use Kysely + node-postgres with explicit SQL migrations. The product relies on PostgreSQL RLS, composite constraints, transactional workflows and append-only history; explicit SQL keeps these controls reviewable. Exact package versions and licenses must be audited at lockfile creation.

## ADR-004 — Immutable assessment versions
**Status:** Accepted

Version questions and scoring policies. Freeze paper versions and attempt snapshots. A later question edit cannot rewrite historic exams or results. Regrades create an auditable new evaluation.

## ADR-005 — Server-authoritative online exam
**Status:** Accepted

Server/database time controls attempt deadlines and final submission. Client timer is display-only. Save acknowledgements follow committed writes; submissions are idempotent.

## ADR-006 — Append-only financial transactions
**Status:** Accepted

Posted payment/receipt/refund/adjustment events are not deleted. Corrections are separate reversal/refund/adjustment records. Amounts use fixed-precision decimal storage.

## ADR-007 — External services are optional adapters
**Status:** Accepted

Core institute, question bank, paper and examination features do not require third-party APIs. Payment capture, messaging, hosted AI, identity verification and cloud proctoring are optional provider adapters or self-hosted capabilities.
