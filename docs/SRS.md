# Software Requirements Specification

**Version:** 0.1 · **Status:** Initial implementation baseline

Detailed product workflows are specified in [Business Workflows](BUSINESS-WORKFLOWS.md). Prioritised functional requirements, role permissions and testable acceptance criteria are maintained in [Functional Requirements & Acceptance](FUNCTIONAL-REQUIREMENTS-AND-ACCEPTANCE.md). Market assumptions and competitor patterns are documented in [Industry Research & Competitor Analysis](INDUSTRY-RESEARCH-AND-COMPETITOR-ANALYSIS.md).

## Product objective

A multi-tenant web platform for coaching institutes that joins administrative and academic workflows with question-bank management, paper generation, online exams and results.

## Actors

Super Admin, Institute Owner, Branch Admin, Admission Counselor, Accountant, Academic Coordinator, Teacher, Exam Controller, Student and Parent/Guardian. Access is deny-by-default and scoped by tenant, branch, role, assignment and record.

## Functional requirements

### Tenant and identity
- Create institute tenants and multiple branches.
- Support users, memberships, roles, granular permissions and secure sessions.
- Derive tenant/branch scope on the server; never trust client-supplied tenant identity.
- Audit privileged support access and permission changes.

### Admissions and academic operations
- Track enquiries, source, follow-ups, applications, admission and documents.
- Maintain student and guardian links.
- Configure academic years, courses, subjects, chapters, topics, faculty and batches.
- Maintain enrollment history and batch transfers without deleting prior records.
- Schedule classes and record attendance with correction audit.
- Manage homework, submissions and study materials.

### Fees
- Configure fee components, instalments and student-specific plans.
- Support discounts, scholarships, concessions, due dates and late fees.
- Record cash, UPI, bank and cheque manually.
- Support partial payments and allocation across charges.
- Issue receipts and track dues.
- Record refunds/reversals/adjustments as auditable events.
- Maintain expenses, collection reports, student ledger and cashbook.
- Use configurable effective-dated tax profiles; do not hard-code universal GST assumptions.

### Question bank
- Support MCQ, multi-select, true/false, numerical, fill blank, matching, ordering, short and long answer, passage, image and parameterised question types.
- Classify by syllabus, tags, difficulty, cognitive skill, language and format.
- Store options, answer key/rubric, explanation, marks, negative marks and media.
- Support draft/review/approved/retired lifecycle.
- Version all content and answer keys.
- Import/export documented CSV/XLSX subset with row-level validation report.

### Paper generator
- Define blueprint for syllabus coverage, count, marks, format, difficulty, skill and duration.
- Select only approved compatible question versions.
- Prevent duplicates according to configured policy.
- Record generation seed, rules and generator version.
- Validate totals and distributions; report question shortage explicitly.
- Never silently substitute questions.
- Freeze paper and answer key after approval.
- Report comparability for multiple sets.

### Examination
- Schedule an exam to selected branches/batches/students.
- Configure duration, availability, attempts, instructions, navigation and result visibility.
- Freeze assigned paper version.
- Use server-authoritative start/deadline.
- Autosave answer revisions and support reconnect recovery.
- Make submission idempotent and lock final attempts.
- Automatically submit at server deadline.
- Record tab/fullscreen/reconnect events only as operational signals.
- Support accommodation such as additional time.

### Evaluation and results
- Auto-grade objective question types from frozen key and scoring policy.
- Support configurable negative marking, unanswered scoring and partial credit.
- Use manual rubric grading for subjective questions.
- Record grader and moderation/regrade history.
- Require authorised result publication and preserve published snapshots.
- Provide student, batch, subject, topic, branch and institute reports.

### Privacy and audit
- Audit authentication, permissions, financial actions, exam submit/regrade, exports and data administration.
- Avoid recording passwords, session tokens and payment credentials in logs.
- Maintain privacy notice/consent version, guardian-link history and data-request workflow where applicable.
- Support retention policy and legal holds.

## Non-functional requirements

- Tenant isolation is a release blocker across API, SQL, jobs, cache, files and exports.
- Validate inputs and use parameterised database queries.
- Responsive web UI for mobile, tablet and desktop.
- Hindi/English readiness and Unicode-safe storage/search.
- Target WCAG 2.2 AA with keyboard and screen-reader testing.
- Secure session handling, MFA for privileged roles, rate limits and file validation.
- Auditable historical integrity for exams, results and financial records.
- Backups, measured restore process, RPO/RTO and observability before production.
- Performance guarantees must be supported by load-test evidence.
- External providers remain optional adapters, not core dependencies.

## Deferred scope

Full remote proctoring, payment gateway, WhatsApp/SMS, hosted AI, full double-entry accounting, native mobile applications, production OMR and full QTI conformance are not MVP blockers.

## MVP acceptance

Tenant isolation and permissions pass tests; admission-to-batch-to-attendance and fee workflows work; approved questions produce a blueprint-compliant paper; online exams survive refresh/network interruption without losing acknowledged answers; timers and submit are server-authoritative; grading is reproducible; result publication is audited; tenant-scoped reports and backup/restore are tested.
