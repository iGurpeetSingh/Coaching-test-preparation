# Research Baseline

**Status:** Initial baseline captured 14 November 2026; competitor and workflow research expanded — 16 November 2026.  
**Research detail:** see [Industry Research & Competitor Analysis](INDUSTRY-RESEARCH-AND-COMPETITOR-ANALYSIS.md), [Business Workflows](BUSINESS-WORKFLOWS.md) and [Functional Requirements & Acceptance](FUNCTIONAL-REQUIREMENTS-AND-ACCEPTANCE.md).  
**Not claimed complete:** institute pilot, formal legal/tax opinion, penetration test, production load test, OMR accuracy test and backup-restore drill.

## Product position

A multi-tenant coaching institute platform combining:
- Institute, branch, admissions, students, guardians and staff.
- Courses, subjects, chapters, topics, batches and faculty.
- Timetable, attendance, homework and study material.
- Fees, instalments, collections, receipts, dues, refunds and expenses.
- Versioned question bank and syllabus mapping.
- Blueprint-based paper generation and printable PDF.
- Online examination, autosave, recovery and server-authoritative timer.
- Objective/manual grading, result publication and analytics.

The differentiator is a connected academic record from admission and batch history through syllabus, exams and performance.

## Competitor scan

Public-source desk review expanded to Classpro, Teachmint, Classplus, Testpress, Edmingle, Learnyst, Fedena and Moodle. These products occupy different market segments; the review is not a like-for-like vendor ranking or hands-on certification. Features not established by reviewed pages are marked as not verified, not assumed absent. Validate current packaging, integrations, support, security and commercial terms directly with vendors before procurement.

- Classpro: coaching operations including enquiries/follow-ups, fee collection, attendance, student performance and parent/student engagement.
- Teachmint: institute management and assessments with question-bank, scheduling, question types and student/topic analytics advertised publicly.
- Classplus: branded coaching app/website, digital courses, live/video classes, online assessments and student activity dashboard.
- Testpress: exam-prep assessment engine with bulk Word MCQ upload, section-based exams, exam/rank scheduling and configurable result visibility.
- Edmingle: training operations, multi-cohort/batch, assessments, certificates, engagement, multi-branch/multi-tenant and analytics.
- Learnyst: mock tests/test series, question pool, multiple item types, section/overall timing, scheduling, attempt settings, autosave and analytics.
- Fedena: adjacent school ERP covering dashboards, admission, finance, attendance, timetable, examination, gradebook and reporting.
- Moodle: configurable LMS reference with reusable question bank, quiz, gradebook, group and mobile workflows.

The detailed source register and comparison are maintained in [Industry Research & Competitor Analysis](INDUSTRY-RESEARCH-AND-COMPETITOR-ANALYSIS.md).

## Academic and question-bank model

Question taxonomy: exam/course → subject → chapter → topic/subtopic, plus tags, difficulty, cognitive skill, language and item type.

Question types: single-choice, multi-select, true/false, numerical, fill blank, matching, ordering, short answer, essay, passage/stimulus-based, image-based and parameterised/calculated.

Every question must have stable identity and immutable versions. A published paper and historic attempt refer to exact question versions/snapshots so later edits cannot change past exams.

## Paper generator

A blueprint defines syllabus coverage, question counts, marks, formats, difficulty distribution, cognitive skills and duration. Generation must:
1. Validate the blueprint.
2. Select approved eligible question versions.
3. Enforce topic/type/difficulty/skill constraints and duplicate policy.
4. Use a reproducible seed and record generation inputs.
5. Validate final marks, counts and distributions.
6. Report shortages rather than silently substituting questions.
7. Freeze approved paper and answer-key versions.

Difficulty and cognitive skill are independent. Equivalent sets require matched coverage and distribution, not only shuffled order. CBSE assessment resources and Moodle question-bank behaviour are useful references. [CBSE academic resources](https://cbseacademic.nic.in/) · [Moodle docs](https://docs.moodle.org/).

## Exam and grading

Exam attempt is server-authoritative: server start/deadline, answer revision history, autosave acknowledgement after commit, reconnect recovery, idempotent submit, final lock and automatic submission at deadline. Browser clock and client storage are untrusted. Tab/fullscreen events are signals, not conclusive cheating evidence.

Objective grading is deterministic from frozen answer/scoring policy; subjective work uses rubrics and teacher grading. Regrade must preserve before/after marks, reason, actor and timestamp.

## Fees and financial integrity

Support fee plans, instalments, admission/exam fees, scholarships, discounts, concessions, late fee, partial payment, payment allocation, receipts, refunds, reversals, expenses and dues. Store money as fixed-precision decimal. Posted financial records are not deleted; corrections are append-only adjustments/refunds.

GST applicability is fact-specific. Government of India references commercial coaching/training services as generally taxable at 18%, while specified services by qualifying educational institutions can be exempt. Keep effective-dated tax profiles configurable and obtain CA review before production. [Government of India portal](https://sansad.in/).

## Privacy/security

DPDP Rules 2025 were gazetted 13 November 2025 with staged commencement. Rule 4 relates to Consent Manager registration/obligations, not the general parent-consent duty for all coaching institutes. Child-data exemptions are limited and purpose-specific. Product design includes notices/consent records, guardian links, least privilege, access logs, data-request workflow, retention rules and breach response. Obtain Indian privacy counsel review before production data processing.

Sources: [Official Gazette](https://egazette.gov.in/) · [India Code](https://www.indiacode.nic.in/).

## No-third-party-API boundary

Core ERP, manual payment recording, question selection, exams, objective grading, reports, PDFs and local OMR can operate without third-party APIs. Payment capture, WhatsApp/SMS delivery, dependable external email, identity verification, cloud proctoring and hosted AI require external providers or self-hosted infrastructure. Internal app-to-backend routes remain necessary and are not third-party services.

## Technology baseline

- React + Vite + TypeScript frontend.
- Node.js LTS + Express + TypeScript API.
- PostgreSQL shared-schema multi-tenancy with tenant-scoped rows and RLS.
- Kysely + node-postgres + explicit SQL migrations.
- PDFKit, ExcelJS, KaTeX.
- Playwright and k6 for test tooling.
- OpenCV for later OMR validation.

Exact versions and transitive licenses must be locked and audited at install time. Application connections must not use PostgreSQL superuser/table-owner/BYPASSRLS roles. Use transaction-scoped tenant context, FORCE RLS where appropriate, tenant-aware foreign keys and adversarial isolation tests.

## Hosting approach

Start as a modular monolith with stateless web/API processes, PostgreSQL, private object storage, a background worker, TLS/WAF and separated environments. Size infrastructure only after defining concurrent attempts, save frequency, storage, report/export bursts, availability goals and a load test. Define RPO/RTO and prove backups through restore drills.

Initial load test tiers: 100, 300 and 1,000 concurrent attempts. These are test scenarios, not a capacity guarantee.

## Validation gates (not yet done)

- Representative institute workflow interviews.
- CA review of fee/tax configuration.
- Privacy counsel review of DPDP role, child-data and retention obligations.
- Dependency/SBOM/license/vulnerability scan for exact lockfile.
- Real device/browser offline recovery validation.
- Hosting topology load tests and measured p95/p99 SLO.
- Backup restoration with measured RPO/RTO.
- OMR accuracy pilot on representative images.
- Penetration test before production student data.
