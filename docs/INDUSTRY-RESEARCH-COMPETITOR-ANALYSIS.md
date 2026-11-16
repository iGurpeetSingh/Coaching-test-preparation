# India Coaching & Test-Preparation Software — Industry Research and Competitor Analysis

**Research cut-off:** 16 November 2026  
**Repository:** iGurpeetSingh/Coaching-test-preparation  
**Research type:** Desk research using official vendor product pages/help centres, public product material, and selected market/security/regulatory references.

## 1. Executive summary

The coaching software market is not one uniform category. The products reviewed fall into four overlapping groups:

1. **Coaching institute ERP:** day-to-day operations such as enquiries, admissions, student records, batches, fees, attendance, parent communication and reporting.
2. **LMS / branded academy platforms:** course delivery, live/recorded learning, cohorts, content access, marketing, payments and learner engagement.
3. **Assessment/test platforms:** question banks, bulk question import, scheduled mock tests, exam simulation, automatic/manual evaluation and performance analysis.
4. **School/SIS and tutoring operations systems:** useful adjacent references for gradebooks, student lifecycle, scheduling, invoicing, staff permissions and parent/student portals.

No single vendor page reviewed proves that every one of these areas is equally deep. The product opportunity for this repository is to connect the institute's operational record to its academic record: one student identity should link to branch, course, batch, fee ledger, attendance, study activity, tests, answers and longitudinal outcomes.

### Strategic recommendation

Build a **coaching-first academic operating system**, not merely a paper-creation page or a generic LMS. The core should be reliable institute identity/permissions, batch-aware student management, reusable versioned question bank, blueprint-driven paper generation, dependable online exams, explainable grading and useful performance analytics. Financial and enquiry workflows should be designed into the product model, but implementation must be sequenced so the exam foundation is not diluted.

## 2. Scope and research method

### Vendors reviewed

- Classpro
- Teachmint
- Classplus
- Testpress
- Learnyst
- Edmingle
- Fedena
- Moodle
- Classe365
- Teachworks

### Evidence standard

The comparison below records capabilities explicitly described in vendor product pages or help documentation. A vendor's own marketing statement is evidence that the vendor advertises the capability; it is **not** independent proof of uptime, accuracy, security, usability, support quality or customer outcomes. No paid account, implementation, load test or hands-on product certification was performed for this report.

Where current public material was incomplete or appeared dated (notably the Teachmint institute-software brochure), that limitation is called out. Features, plan packaging, pricing and integrations can change. Confirm them in a live vendor demonstration and contract before procurement.

## 3. Market context

Redseer Strategy Consultants' public summary for its 2026 India test-preparation report describes an approximately **US$14.8 billion FY26** test-preparation market and projects **US$23–26 billion by FY30**, with a stated 12–15% CAGR range. Treat this as a market-research estimate for the test-preparation sector, not as the addressable market for institute-management software and not as a revenue forecast for this product. Its scope and methodology should be reviewed in the full report before financial modelling.

A separate issuer prospectus filed with the Indian stock exchanges cites Technopak secondary research on education segments. The prospectus uses a different classification and reporting basis; it should not be mixed mechanically with Redseer's estimate. This report therefore avoids creating a single combined TAM number.

### Demand-side implications for product design

- **Exam outcomes are a credibility asset.** A useful system must make student improvement, topic gaps, attempt history and result publication visible—not only count registrations.
- **Hybrid operations are normal.** Software should support offline classes, online resources and online tests without assuming every institute is fully digital.
- **Batch and cohort management matters.** Coaching centres frequently run rolling admissions and repeated batches; a student's current batch must not erase prior academic history.
- **Administrative friction is a purchase driver.** Fees, attendance, enquiries, notifications, scheduling and reporting compete for staff time alongside teaching.
- **Exam reliability is product-critical.** Lost answers, timer disputes, incorrect scoring or accidental result exposure damage trust more than a cosmetic UI issue.
- **Mobile-first access is essential.** Student, parent and teacher actions must work on a phone and on constrained networks; desktop administration remains useful for bulk work.

## 4. Competitor landscape

| Product | Primary category / buyer | Publicly described strengths | Product lesson for this repository |
|---|---|---|---|
| **Classpro** | Coaching-class management for Indian institutes | Fee collection, receipts, reminders, real-time dues, attendance, biometric integration, parent alerts, student performance, test notifications, reports; current public material also describes enquiries/lead tracking, notes, homework and parent/student app | Strong benchmark for a coaching-first dashboard that connects fees, attendance, parents and results. Batch-level reports and family visibility should be first-class. |
| **Teachmint** | Institute administration plus teaching/LMS | Public institute-management material describes dynamic fee setup, online payments/dues, enquiry CRM and follow-ups, admission reports, attendance, certificates/report cards, timetable, homework and exam management; separate LMS material describes online/offline/hybrid delivery, recordings and performance reporting | Benchmark the administrative breadth and the teacher/student/parent operating model. The available institute brochure is archived/older; verify current availability and packaging in a demo. |
| **Classplus** | Branded coaching app / course business | Branded website and app, course store, online assessments with auto-correction, scanning physical papers into tests, student activity dashboard, coupons/marketing dashboard, live classes/recordings and video lectures | Benchmark low-friction content/test publishing and branded learner access. Distinguish institute ERP depth from the branded content-commerce experience. |
| **Testpress** | Online examination and learning platform | Bulk question upload from Word including media/equations/graphs, section/subsection exams, exam and rank scheduling, exam templates, question bank, objective and subjective formats, analytics by subject/time spent, manual evaluation, resume, reminders and discussion | Strong assessment benchmark. Prioritise robust import validation, section rules, separate result release, subjective marking, attempt recovery and item-level analytics. |
| **Learnyst** | Branded LMS and test-series business | Test series as grouped assessments; MCQ, numerical, essay, fill-in and multi-input questions; section and overall timers; scheduled test windows; attempt controls; content/course builder, cohorts, branded site/apps, lead-capture and marketing workflows, content security and learner analytics | Benchmark test-series packaging, access windows and learner experience. Course commerce/security is a separate capability from core coaching ERP. |
| **Edmingle** | Training operations / multi-cohort LMS | Programmes/courses/webinars, instructor-led scheduling, multi-cohort batches, attendance, recordings, feedback, assessments, certificates, question bank, submissions, analytics, multi-branch/multi-tenant management, white-label apps and engagement workflows | Benchmark multi-branch/cohort operations and the integration between product delivery, assessment and analytics. |
| **Fedena** | School ERP / student administration | Admissions, student information, fees, finance, attendance, HR, communication, examination, gradebook and report generation. Fedena's own support material explicitly distinguishes its ERP from an LMS. | Useful adjacent reference for administrative controls, gradebook and report cards. Do not copy a school-year model blindly into rolling coaching batches. |
| **Moodle** | Open-source LMS | Course-scoped question banks with categories/subcategories and reusable questions; quiz controls for timing, opening/closing windows, attempts, review visibility and grading behaviour | Benchmark transparent assessment configuration, reusable question libraries and teacher control. It is an LMS, not a complete coaching ERP by default. |
| **Classe365** | SIS / education administration with modular add-ons | Student/parent/teacher/admin dashboards, courses, attendance, notices, grading, assessment, admissions CRM, LMS, fees/invoicing and finance modules | Benchmark a connected student information model and clearly separated, attachable capabilities. Verify which modules are included in each plan. |
| **Teachworks** | Tutoring/test-prep business operations | Student and tutor management, one-to-one/group scheduling, client booking, attendance, reminders, staff permissions, invoicing, payment processing, progress tracking and integrations | Useful for calendar, tutor utilisation and billing workflows. Less assessment-specialist than Testpress/Learnyst. |

### 4.1 Category-by-category observations

**Coaching ERP (Classpro, Teachmint):** the operational value is centralisation: student records, collections, attendance, parent updates and reports share one workflow. An isolated exam module is not enough for an institute owner.

**Branded LMS (Classplus, Learnyst, Edmingle):** these platforms place strong emphasis on course packaging, live/recorded content, learner engagement, branded apps/websites and selling access. Their features are relevant, but must be weighed against the local institute's need for staff roles, branch-level control, fee reconciliation and academic history.

**Exam engines (Testpress, Moodle, Learnyst):** assessment depth includes bulk authoring/import, multiple question types, section timing, exam windows, attempt settings, review controls, manual evaluation and analytics. These are core product requirements, not optional polish.

**SIS / School ERP (Fedena, Classe365):** they demonstrate the value of student/parent portals, gradebooks, admissions records and finance integration. Coaching needs additional flexibility for rolling enrolment, multiple concurrent batches and test-series cadence.

**Tutoring operations (Teachworks):** scheduling, reminders, tutor availability, client portals and billing are strong operational patterns for smaller or session-based academies.

## 5. Capability benchmark and recommended response

| Capability | Market expectation observed | Recommended product response | Priority |
|---|---|---|---|
| Institute, branch and staff access | Separate admin, teacher, learner, parent/staff experiences are common | Tenant + branch model; invitation/provisioning; permission matrix; audit trail | P0 |
| Student identity and enrolment | Student record feeds academic, finance and communication workflows | One canonical student profile; guardian links; historical enrolments; batch transfer history | P0 |
| Batches and academic calendar | Cohorts, schedules, courses and sessions recur across products | Batch-first course delivery, faculty assignment, room/session schedule and timetable conflict checks | P1 |
| Fees and receivables | Fee setup, instalments, receipts, reminders and outstanding balance are recurring ERP features | Charge ledger, allocation, receipt, due ageing, reversals/refunds, reconciliation | P1 |
| Reusable question bank | Dedicated question banks and bulk import are established assessment patterns | Versioned question bank, metadata/tags, review status, import with row-level errors | P0 |
| Paper assembly | Section/blueprint/coverage rules and reusable tests are present in assessment products | Blueprint-driven selection, shortage report, duplicate policy, reproducible seed and frozen paper version | P0 |
| Exam delivery | Scheduled windows, timers, attempt controls, autosave/resume and review controls are expected | Server-authoritative time, committed autosave, recovery, idempotent submit and immutable attempt snapshot | P0 |
| Evaluation and result release | Auto grading and manual subjective evaluation coexist | Versioned scoring policy, rubrics, moderated grading, separate result publication control | P0 |
| Performance analytics | Subject/topic/section/attempt trends and time-on-question are offered by test platforms | Student → batch → subject → topic analytics with transparent formulas and export | P1 |
| Learner engagement | Reminders, notifications, discussions and content access are common | In-app notifications first; delivery adapters for email/SMS/WhatsApp later | P1 |
| Branded course commerce | Branded apps, landing pages, stores and payment integrations are prominent | Defer to a later commercialisation phase; preserve clean adapter boundaries | P2 |
| OMR / proctoring / AI | Available in specialist ecosystems, often as paid/advanced capability | Do not promise before accuracy, privacy, cost and fairness pilots | P2 |

P0/P1/P2 here is a product recommendation, not a claim about a competitor's plan tiers.

## 6. Differentiation opportunity

1. **One connected learner history:** enquiries/admission, fee plan, batch movement, attendance, tests, answers and results must join through stable IDs. (The Enquiry UI/module remains deferred in the current implementation sequence.)
2. **Reliable assessment operations:** frozen paper and scoring versions, server time, save acknowledgements, idempotent submission and auditable regrades.
3. **Transparent question quality:** each question has syllabus mapping, difficulty, cognitive skill, language, source/provenance, approval status and version history.
4. **Blueprint shortage honesty:** show exactly which subject/topic/difficulty constraints cannot be met; never silently substitute an unrelated question.
5. **Coaching-specific reporting:** compare the student's own progress over time, batch distributions and topic-level weak areas; expose rank/percentile only with defined cohort and tie rules.
6. **Practical bilingual operation:** English/Hindi Unicode data, print-ready papers and low-bandwidth-friendly learner pages.
7. **Configurable core without provider lock-in:** manual fee records, exams, grading, PDFs and reports work without external providers; messaging, payment capture and video are optional adapters.

## 7. Commercial and procurement notes

Public pricing is not comparable from the reviewed sample: some vendors use sales-led quotes or modular plans, while some publish a limited entry price and transaction-fee structure. Do not rank products using an old screenshot or a single advertised plan.

For a fair procurement comparison, request a live demo and written schedule covering:

- Total institute, branch, staff, student and parent licences.
- Question import limits, storage, video bandwidth and concurrent exam attempts.
- Exam attempts, result reports, manual marking and rank/percentile features.
- Payment-gateway and messaging charges, transaction fees and taxes.
- Data export, API access, SSO, custom domain and branded app charges.
- Data residency, retention, backups, restore, support SLA and incident reporting.
- Onboarding, data migration, training, renewal uplift, cancellation and exit/export.
- Feature availability by plan, add-on and mobile/desktop surface.

Run the same scripted demo on at least three shortlisted vendors rather than accepting different demo scenarios.

## 8. Risk and compliance considerations

- **Student/minor data:** collect only necessary personal data; define the institute's role, notices, guardian relationships, retention, access and deletion workflows. Obtain Indian privacy counsel advice on the staged commencement of the DPDP Act/Rules and the institution's specific responsibilities.
- **Security verification:** use OWASP ASVS 5.0 as a requirements and test checklist; the standard is a verification framework, not a certification automatically earned by adopting it.
- **Financial records:** preserve posted history; correct through separate reversal/refund/adjustment events. Tax treatment is fact-specific and should be approved by a CA.
- **Exam integrity:** do not call browser focus/fullscreen signals proof of cheating. Provide human review and accommodation policies.
- **AI/automated grading:** show rubric, confidence and human override for subjective/ambiguous work. Never present a generated score as authoritative without teacher approval where required.

## 9. Current repository position and implications

Reviewed files in the repository show:

- The current Paper Builder and student examination demo persist data in browser LocalStorage. This is suitable for a same-browser demonstration, not cross-device accounts or production student records.
- The Express API currently exposes API metadata and a health route; its README says the health route does not yet verify PostgreSQL connectivity.
- The repository contains an initial product/SRS/architecture baseline and enquiry-related migration/seed artefacts, but the complete connected ERP workflow described here is not thereby proven to be implemented.
- No production authentication, tenant isolation, persistent paper/attempt service or full operational workflow should be marked complete based only on the current demo.

The business workflows and functional specification in the companion documents describe the target system. Treat them as the next implementation contract, not as a claim that the current live demo already provides those capabilities.

## 10. Sources

All pages were accessed/retrieved on **16 November 2026**. Vendor feature descriptions are vendor-published claims.

1. [Classpro — Coaching Class Management Software](https://classpro.in/) — fees, attendance, parent alerts and student performance.
2. [Classpro — Coaching Institute Management Software Guide (30 September 2026)](https://blog.classpro.in/what-is-coaching-institute-management-software/) — coaching-specific workflows, enquiry stages and batch realities.
3. [Classpro — Plans and trial FAQ](https://www.classpro.in/plans) — trial and sales-led plan information.
4. [Teachmint — Institute Management Software brochure (archived public PDF)](https://teachmint.storage.googleapis.com/public/176177529/StudyMaterial/4f3f9313-fe7d-4bb0-824d-5f8e252b4ea0.pdf) — fee, enquiry, attendance and academic modules; age/availability must be confirmed.
5. [Classplus — App features](https://classplusapp.com/app-features) — store, assessments, stats, marketing, live classes, video and website.
6. [Testpress — Features](https://testpress.tech/features/) — bulk upload, section exams, scheduling, question bank and analytics.
7. [Testpress — Online exam features](https://testpress.tech/online-exam-software/features/) — resume, manual evaluation and advanced analytics.
8. [Learnyst — Test Series overview](https://support.learnyst.com/overview-of-test-series) — question formats, time controls, test windows and attempts.
9. [Learnyst — Platform FAQ](https://support.learnyst.com/learnyst-platform-faqs) — identity continuity across web/mobile and course bundling.
10. [Learnyst — Platform](https://www.learnyst.com/) — cohorts, branded surfaces, lead capture, workflows and content security.
11. [Edmingle — Platform overview](https://www.edmingle.com/) — programmes, cohorts, multi-branch, assessments, engagement and analytics.
12. [Edmingle — Product documentation](https://support.edmingle.com/docs/introduction-products) — courses, memberships, events, test series, assessments and submissions.
13. [Fedena — Exam Management System](https://fedena.com/feature-tour/exam-management-system) — exam scheduling, gradebook and reports.
14. [Fedena — What is Fedena?](https://support.fedena.com/support/solutions/articles/266501-what-is-fedena-) — vendor's ERP/LMS distinction.
15. [Moodle 5.0 — Question banks](https://docs.moodle.org/501/en/mod/quiz/question) — reusable course/quiz question banks and categories.
16. [Moodle 5.0 — Quiz settings](https://docs.moodle.org/500/en/mod/quiz/config) — opening/closing windows, attempts and grade behaviour.
17. [Classe365 — Student Information System](https://www.classe365.com/student-information-system) — student dashboards, courses, attendance, grades and admissions CRM.
18. [Teachworks — Tutoring management](https://www.teachworks.com/tutoring-management-software) — schedules, student/staff access, notifications, attendance and billing.
19. [Teachworks — Test preparation management](https://www.teachworks.com/test-preparation-school-management) — test-preparation centre workflows.
20. [Redseer — India Test Preparation Market: Outcome Is King (2026)](https://redseer.com/reports/india-test-preparation-market-outcome-is-king/) — public summary of market estimate; full methodology should be reviewed before financial use.
21. [Government of India — Digital Personal Data Protection Rules, 2025 Gazette](https://egazette.gov.in/WriteReadData/2025/267650.pdf) — notification and phased commencement dates.
22. [Government of India — DPDP Act commencement notification G.S.R. 843(E)](https://egazette.gov.in/WriteReadData/2025/267647.pdf) — staged commencement notification.
23. [OWASP — Application Security Verification Standard](https://asvs.owasp.org/) — ASVS 5.0.0 framework.

---

**Research limitation:** This is a structured desk-research baseline, not a paid-vendor bake-off, customer interview study, legal opinion, financial due-diligence report or penetration test. Those are separate validation gates.
