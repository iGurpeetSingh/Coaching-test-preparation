# QA and Release Test Plan

## Test layers

- Static: TypeScript strict checks, lint, formatting and dependency/license/security audit.
- Unit: fee calculations, blueprint constraint logic, scoring rules, time calculations and permission predicates.
- Integration: API/database transactions, RLS, tenant-aware foreign keys, outbox, imports and exports.
- E2E: admission, batch, fee, question authoring, paper generation, exam attempt, grading and result publication.
- Non-functional: accessibility, responsive, load, recovery, backup/restore and security tests.

## Critical acceptance matrix

| Area | Test | Pass condition |
|---|---|---|
| Tenant isolation | Tenant A reads/updates Tenant B IDs through API, SQL, exports and jobs | Every attempt denied; no data leakage |
| Branch permissions | Teacher accesses unassigned batch | Denied and audited |
| Admissions | Enquiry → application → admission → enrollment | Full history and unique admission identity |
| Student history | Transfer student to another batch | Old enrollment retained and new enrollment linked |
| Fees | Partial, exact, excess and split allocation | Correct remaining balances and audit trail |
| Refunds | Full/partial refund | Original payment retained; refund separately posted |
| Question versioning | Edit a question used by prior exam | Prior paper/attempt remains unchanged |
| Paper generator | Insufficient questions for a blueprint | Visible shortage report; no silent substitution |
| Paper integrity | Reproduce generation from saved seed and versions | Same eligible inputs produce same selected paper |
| Exam autosave | Refresh after acknowledged save | Answer remains available |
| Network recovery | Disconnect, answer locally, reconnect | Pending revisions reconcile without silent loss |
| Submit race | User submit and deadline auto-submit concurrently | One final submitted state and one result basis |
| Timer | Change browser clock | Server deadline remains authoritative |
| Grading | Correct/wrong/unanswered/partial and negative-mark cases | Result matches versioned scoring policy |
| Regrade | Teacher changes score with reason | Before/after and actor history preserved |
| Publication | Student requests unpublished result | No marks/rank leakage |
| Accessibility | Keyboard-only and screen-reader navigation | Core flows are operable and labelled |
| Uploads | Fake MIME, oversized and unauthorised file | Rejected or quarantined |
| Recovery | Restore backup to isolated environment | Data restored within declared RPO/RTO |

## Performance scenarios

Initial load-test tiers are 100, 300 and 1,000 concurrent exam attempts. They are test targets, not confirmed product capacity. Model synchronised test start, steady answer saves, reconnect burst, final-minute submissions, auto-submit and result generation.

Record p50/p95/p99 latency, error rate, DB CPU/IO/connection pool/locks, queue lag and save acknowledgement latency. Numeric SLOs are set after baseline run and product-owner agreement.

## Browser/device coverage

Test current supported Chrome, Edge, Firefox and Safari at release time. Include Android Chrome, iOS Safari, tablet and desktop. Test low bandwidth, refresh, background/foreground, keyboard-only, zoom and screen-reader workflows.

## OMR validation gate

Do not release OMR before testing representative scanned and camera images across rotation, skew, blur, shadow, low contrast, faint pencil, erasure, multiple marks, clipped page and different printer stock. Label ground truth. Measure per-question accuracy, false positives, false negatives and ambiguous rate. Route low-confidence cases to human review.

## Security gate

Map release checks to OWASP ASVS 5.0 Level 2. Perform tenant isolation abuse tests, IDOR, auth/session, CSRF/XSS, injection, upload, rate-limit, privilege escalation and audit-log tampering tests. Commission external penetration testing before production processing of student/child data.

## Release blockers

- Any tenant data leak.
- Any exam answer loss after a successful save acknowledgement.
- Any duplicate financial posting or duplicate exam finalisation.
- Any mutation of historic paper/answer key/result without versioned audit event.
- Failed backup restore.
- Critical/high unresolved vulnerabilities.
- Critical accessibility blocker in the student examination flow.
