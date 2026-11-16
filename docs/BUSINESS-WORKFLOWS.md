# Business Workflows — Coaching & Test Preparation

**Version:** 1.0 · **Research-derived workflow baseline:** 16 November 2026  
**Status:** Product process specification; workflows require validation with pilot institutes before implementation is treated as final.

This document defines how work should move through the product. A workflow is not complete because a page or button exists: every state transition, permission, data write, exception and audit event must be defined.

---

## 1. Organisation and identity model

Keep these concepts separate:

- **Platform:** the software service and its platform operators.
- **Tenant / Institute:** one coaching business/customer using the platform.
- **Branch:** an operating location belonging to an institute.
- **Academic year / session:** time-bounded academic grouping.
- **Course / programme:** the learning programme or exam-preparation offering.
- **Batch / cohort:** a group of enrolled learners following a schedule.
- **User:** a person who authenticates.
- **Membership:** a user's relationship with a tenant, branch and role.
- **Student record:** academic identity and history; it may exist before the student has login access.
- **Guardian link:** a scoped relationship allowing a parent/guardian to access permitted learner information.

A user may have more than one membership where explicitly authorised, but every request must resolve a single active tenant context and a valid permission scope. Never infer tenant scope from a client-supplied ID alone.

## 2. Actors and responsibility boundaries

| Actor | Main responsibility | Typical access |
|---|---|---|
| Platform operator | Operates the SaaS platform and support | Platform-level; customer data access is exceptional, justified and audited |
| Institute owner | Owns institute setup, users, branches and policy | Institute-wide |
| Branch administrator | Runs one or more assigned branches | Assigned branch scope |
| Admission counsellor | Manages leads, follow-ups and applications | Assigned leads and admission pipeline |
| Academic coordinator | Manages courses, subjects, syllabus, batches and calendar | Assigned academic scope |
| Teacher | Delivers classes, attendance, homework and assessment | Assigned batches/subjects |
| Accountant | Manages fee plans, charges, receipts and reconciliation | Assigned financial scope |
| Exam controller | Manages question review, papers, exams and result publication | Assigned assessment scope |
| Student | Attends learning and attempts assigned exams | Own profile, enrolments, attempts and published results |
| Parent/guardian | Supports a linked learner | Only explicitly shared learner data |

Permissions are deny-by-default. A display condition in the UI is not an authorisation control; the API and database must enforce the same rule.

---

## 3. Workflow catalogue

### WF-01 — Institute onboarding and branch setup

**Trigger:** a new institute is provisioned.

**Primary owner:** platform operator / institute owner.

**Steps**
1. Create tenant with a stable tenant identifier and lifecycle state.
2. Record institute identity, contact, timezone, locale, branding and data-retention defaults.
3. Create the initial branch and assign a branch administrator.
4. Configure academic year/session, working days, class timings and default policies.
5. Invite or create authorised staff accounts and assign role memberships.
6. Validate institute contact and owner access; require credential setup before account activation.
7. Display an onboarding checklist and prevent operational records from being created without mandatory setup.

**States:** Provisioning → Setup Required → Active → Suspended → Archived.

**Rules**
- Tenant identifiers are immutable.
- Suspending a tenant blocks ordinary access but does not delete or rewrite records.
- Cross-tenant references are prohibited at the database boundary.
- Platform support access must be time-bound, scoped, reason-coded and audited.

**Failure handling:** incomplete setup remains visible as Setup Required; never create partially active staff/student accounts without a clear state.

### WF-02 — Enquiry to admission

**Trigger:** a prospective learner or guardian contacts the institute.

**Primary owner:** admission counsellor.

**Steps**
1. Capture a lead manually, through an institute-owned website form, or via approved bulk import.
2. Store source, interested course, preferred branch, learner/guardian contacts, preferred language and communication preference.
3. Run duplicate detection on normalised phone/email and show possible matches to an authorised user.
4. Create an enquiry with owner, priority, current stage and next follow-up date.
5. Log calls, visits, counselling, demo-class and other follow-up outcomes.
6. Move the enquiry through configurable stages, for example: New → Contacted → Counselling Scheduled → Demo/Assessment → Offer/Fees Discussed → Application → Admitted / Lost / On Hold.
7. Convert to application and collect required documents.
8. Verify application and record an admission decision.
9. Assign admission number, academic year, course, branch and initial batch.
10. Create or link the student record; add guardian links and account invite.
11. Apply an approved fee plan and record the first charge/payment as appropriate.
12. Report conversion by source, counsellor, course, branch and date range.

**Required data:** lead source, contact, course interest, branch preference, owner, next action and stage history.

**Controls**
- Every open enquiry has an owner or an explicit unassigned queue.
- Every active follow-up has a due date.
- Lost/on-hold records require a reason.
- Admission number is unique within the institute/defined numbering scope.
- Concessions and manual admission overrides require authority and audit.
- Merging duplicates preserves activity history and records the surviving identity.

### WF-03 — Student identity, enrolment and batch lifecycle

**Trigger:** an admission is approved or an existing learner changes programme/batch.

**Primary owner:** branch administrator / academic coordinator.

**Steps**
1. Create or find a single canonical student record.
2. Verify required identity/contact fields and guardian links.
3. Create an enrolment for academic year, course, branch and batch.
4. Assign subjects and relevant faculty.
5. Set start/end dates and enrolment status.
6. Provision student portal membership only after the account has been invited and activated.
7. For a batch transfer, close or end-date the prior enrolment and create a new one.
8. For withdrawal, mark enrolment withdrawn and revoke future access according to policy; preserve prior history.
9. For re-admission, create a new enrolment event linked to the existing student identity.

**States:** Applicant → Admitted → Enrolled → Active → Transferred / Completed / Withdrawn.

**Rules**
- A student record is not the same object as a login account.
- Historical enrolment, fee, attendance, exam and result records remain linked to the correct academic period.
- A student cannot see another student's records through a guessed URL or API ID.

### WF-04 — Course, batch, timetable and class delivery

**Trigger:** a programme/batch is ready for teaching.

**Primary owner:** academic coordinator.

**Steps**
1. Define academic year, courses/programmes, subjects and syllabus taxonomy.
2. Define chapters/topics and teaching sequence.
3. Create batch with branch, course, capacity, start/end dates and fee plan association.
4. Assign students and faculty with effective dates.
5. Create class sessions with subject, topic, teacher, time, duration, room or online mode.
6. Detect timetable conflicts for teacher, batch and room.
7. Publish timetable to authorised students and faculty.
8. Teacher records delivery status and covered topics.
9. Record cancellations/rescheduling and reason.
10. Generate batch-level syllabus-progress and class-delivery reports.

**Controls:** no overlapping active teacher/batch/room assignment without an authorised override; changes must notify affected users through configured channels only.

### WF-05 — Attendance and academic follow-up

**Trigger:** a scheduled class or approved attendance event occurs.

**Primary owner:** teacher; branch administrator supervises corrections.

**Steps**
1. Teacher opens an assigned session and roster.
2. Mark Present, Absent, Late or an approved additional state.
3. Save attendance against session, student and teacher.
4. Allow a correction request with reason and evidence where needed.
5. Authorised supervisor approves/rejects the correction; retain both original and corrected values.
6. Calculate attendance percentage using configured eligible sessions and exclusions.
7. Detect absence patterns and raise a follow-up task for the designated staff member.
8. Display only permitted details to students and guardians.

**Rules**
- Attendance cannot be overwritten without a trace.
- Cancelled sessions are excluded according to policy.
- Reports disclose the calculation period and eligible-session denominator.

### WF-06 — Fee plan, collection and reconciliation

**Trigger:** admission, instalment schedule or a chargeable service is created.

**Primary owner:** accountant.

**Steps**
1. Configure fee components and plans for course/batch/academic year.
2. Generate a charge schedule for the student, including due date and amount.
3. Apply scholarship/concession/discount after recording reason, authority and effective period.
4. Record payment mode and reference: cash, UPI, bank transfer, cheque or gateway settlement.
5. Allocate payment to one or more outstanding charges.
6. Recalculate balance using decimal arithmetic.
7. Issue receipt with unique receipt number.
8. Record partial payment, excess payment and unallocated credit using explicit policies.
9. Reconcile manual or provider settlement against bank/cash records.
10. Process refunds, reversals and corrections as separate append-only records.
11. Generate student ledger, dues ageing, collection and branch reports.

**Non-negotiable controls**
- Money is stored as fixed-precision decimal, not binary floating point.
- Duplicate payment references are detected.
- Posted records are never hard-deleted.
- Receipt correction is an audited reversal/reissue, not silent editing.
- Tax settings are configurable and subject to professional review.

### WF-07 — Question-bank authoring and review

**Trigger:** a teacher/examiner creates a new question or imports questions.

**Primary owner:** teacher/question author; reviewer/exam controller approves.

**Steps**
1. Select tenant, course, subject, chapter, topic and language.
2. Choose item type and enter the prompt.
3. Add options, answer key, explanation/rubric, marks, negative marks and attachments as appropriate.
4. Tag difficulty, cognitive skill, source and usage restrictions.
5. Validate required options, answer key, scoring range, media and language.
6. Save as Draft.
7. Submit for review.
8. Reviewer approves, requests changes or rejects with comments.
9. Approved question receives an immutable version number.
10. Any subsequent edit creates a new draft version; the prior version remains available to historical papers.
11. Track which papers and exams use each question version.

**Supported item types to plan for:** single-choice MCQ, multi-select, true/false, numerical, fill blank, matching, ordering, short answer, essay, passage/stimulus, image/diagram and calculated/parameterised item.

**Import sub-workflow**
- Select a supported file type and import template.
- Upload to private temporary storage and validate file size/type.
- Parse questions and map fields.
- Show a preview with accepted, warning and rejected rows.
- Allow the user to correct mapping/content.
- Confirm import only after explicit action.
- Store a report with source row, error code, message and final status.
- Do not silently discard a question or invent missing answer keys.

### WF-08 — Blueprint and paper generation

**Trigger:** an exam controller needs a new test paper or a set of equivalent papers.

**Primary owner:** exam controller.

**Steps**
1. Select course/exam, subject(s), syllabus scope, time and total marks.
2. Define sections and ordering.
3. Set item count, marks, question type, difficulty, cognitive skill, topic coverage and scoring rules for each section.
4. Run eligibility and availability checks on approved question versions.
5. Present shortage report by topic/type/difficulty; allow criteria adjustment with audit.
6. Generate a deterministic candidate using recorded seed and generator version.
7. Validate section totals, overall marks, item count, duplicates and required distribution.
8. Allow manual replacement only with an eligible question; rerun validation after changes.
9. Review student copy and answer key separately.
10. Submit for approval; approver freezes a PaperVersion.
11. Generate printable PDF and teacher answer-key output.
12. Preserve blueprint, selected version IDs, seed, generator version and approval history.

**Rules**
- A paper cannot be published if validation fails.
- The system never silently fills shortages with unrelated questions.
- A historical paper cannot change when a question is edited.
- Multiple sets must have comparable syllabus, difficulty and marks coverage, not merely a different order.

### WF-09 — Exam scheduling, assignment and publication

**Trigger:** an approved paper is ready for delivery.

**Primary owner:** exam controller.

**Steps**
1. Create exam metadata and choose a frozen PaperVersion.
2. Assign target students, batches or branches.
3. Configure open/close window, duration, attempt count, navigation, section timing, negative marking and accommodations.
4. Define whether students see marks, answer key, explanation, rank and percentile immediately, later or never.
5. Validate each assigned student's eligibility and account status.
6. Publish and show the exam on the student's dashboard.
7. Display Upcoming, Available, In Progress, Submitted, Evaluation Pending, Result Scheduled or Result Published state as appropriate.
8. Send notifications through enabled channels and log delivery status when a provider reports it.

**Rules**
- Published assignments are snapshotted; editing the source paper does not mutate an already assigned exam.
- A scheduled exam without a valid approved paper cannot be started.
- Time zone is explicit and displayed consistently.
- Result release date and exam start date are separate settings.

### WF-10 — Online exam attempt and submission

**Trigger:** eligible student selects Start Exam.

**Primary owner:** student; system enforces exam policy.

**Steps**
1. Authenticate student and resolve tenant membership.
2. Verify assignment, exam availability, remaining attempts and accommodations.
3. Create attempt with server-side start time, deadline, attempt number and frozen paper snapshot.
4. Render instructions and require acknowledgement where policy requests it.
5. Capture each answer update as a revision; save to server.
6. Acknowledge save only after durable transaction commit.
7. Recover latest acknowledged revision after refresh, reconnect or re-login.
8. Display server-derived remaining time.
9. Allow navigation/review/mark-for-review according to exam settings.
10. Student submits; server validates and finalises once using idempotency.
11. At deadline, server finalises automatically; late writes are rejected.
12. Store submission time, status, answer revisions and operational events.

**Attempt states:** Created → In Progress → Submitted / Auto Submitted → Evaluated → Result Published. Expired/voided states require explicit policy and audit.

**Controls**
- Browser local storage and browser clock are not authoritative.
- A repeated submit request returns the same final attempt/result.
- Reconnect cannot overwrite a newer server revision with an older client revision.
- Tab changes, fullscreen exits and reconnects are signals for review, not conclusive proof of misconduct.

### WF-11 — Evaluation, moderation and result publication

**Trigger:** attempt submission is complete.

**Primary owner:** evaluation engine and authorised examiner.

**Steps**
1. Auto-grade eligible objective items using the frozen scoring policy.
2. Place subjective items in a marking queue.
3. Assign responses to an authorised examiner.
4. Mark each response using question maximum and rubric.
5. Add feedback/comments where permitted.
6. Optional second marking/moderation checks outliers or sampled scripts.
7. Reconcile totals and apply policy for unanswered/negative/partial credit.
8. Approve the result batch.
9. Publish a versioned result snapshot at the configured time.
10. Display only the fields permitted by the result visibility policy.
11. If recheck/regrade is approved, create a new evaluation version with reason and before/after values.
12. Retain the earlier publication history.

**Controls:** examiners cannot modify an already published result without regrade permission; result rank is recalculated only from the approved population and tie policy.

### WF-12 — Performance analytics and remedial action

**Trigger:** evaluation results are available.

**Primary owner:** teacher / academic coordinator.

**Steps**
1. Aggregate score, accuracy, attempted/unanswered count and time taken.
2. Break down by section, subject, topic, question type and difficulty.
3. Compare student against own prior attempts and cohort distribution.
4. Identify weak topics and recurring misconceptions.
5. Review question quality (too easy/hard, ambiguous or poor discrimination) before treating scores as student ability.
6. Create revision plan, homework, doubt session or remedial class.
7. Track attendance and performance in subsequent assessments.
8. Report improvement with cohort and time-period context.

**Rules**
- Analytics must disclose denominator and missing data.
- A small cohort or single question must not be over-interpreted.
- Rank/percentile should show the comparison population and tie policy.
- Teacher should be able to inspect the underlying responses that drive a weak-topic insight.

### WF-13 — Certificates and course completion

**Trigger:** learner reaches a completion rule.

**Primary owner:** academic coordinator.

**Steps**
1. Define completion rule for course/programme.
2. Calculate eligible attendance, completed work and assessment threshold.
3. Generate a completion candidate.
4. Authorised user approves or automatic rule finalises when enabled.
5. Issue certificate with unique identifier and issue timestamp.
6. Support reissue/revocation with reason and history.
7. Provide verification view that exposes only intended certificate data.

### WF-14 — User support, privacy and data lifecycle

**Trigger:** user requests account help, data correction, export, deletion or restriction.

**Primary owner:** institute admin / designated privacy contact.

**Steps**
1. Verify requester identity and authority.
2. Classify request and identify tenant/records affected.
3. Check legal/contractual retention, financial record and exam-integrity requirements.
4. Approve or reject access/correction/export/erasure action with a reason.
5. Apply data minimisation and access restrictions where erasure cannot immediately occur.
6. Record completion, affected systems, actor and timestamps.
7. Escalate suspected data breach to incident process.
8. Preserve audit logs without copying unnecessary sensitive content into logs.

This workflow is a product-control baseline, not legal advice. Applicable Indian privacy, child-data, consumer and record-retention duties require legal review.

---

## 4. Cross-workflow invariants

These rules apply across modules:

1. Every tenant-owned record is tenant-scoped; branch scope is enforced where relevant.
2. Every privileged state change is authorised server-side and audited.
3. Student profile and student login account are separate entities.
4. Batch transfers and withdrawals preserve academic history.
5. Question, paper, scoring policy, attempt and result versions are immutable when used in a completed assessment.
6. Financial postings are append-only and corrected through reversal/refund/adjustment.
7. Time-sensitive exams use server/database time.
8. Autosave acknowledgement follows durable commit.
9. Exam submit and payment posting are idempotent.
10. Importers show validation errors before data is committed.
11. A failed background job is visible and retryable; it must not silently lose work.
12. Reports include scope, period, denominator and generation timestamp.
13. External integrations are optional, and the UI must not imply a notification/payment occurred if a provider did not confirm it.
14. Production release requires verified backup restoration and security tests.

## 5. Process ownership / hand-off matrix

| Workflow | Responsible | Accountable | Consulted |
|---|---|---|---|
| Institute onboarding | Platform admin | Institute owner | Branch admin |
| Enquiry/admission | Counsellor | Branch admin | Accountant |
| Student/batch | Academic coordinator | Branch admin | Teacher |
| Timetable/class | Teacher / coordinator | Academic coordinator | Students |
| Attendance | Teacher | Branch admin | Student/guardian |
| Fees | Accountant | Institute owner | Student/guardian |
| Question authoring | Teacher | Exam controller | Subject expert |
| Paper approval | Exam controller | Academic head | Teacher |
| Exam delivery | System + student | Exam controller | Support |
| Evaluation | Examiner | Academic head | Exam controller |
| Result publication | Exam controller | Academic head | Institute owner |
| Analytics/intervention | Teacher | Academic coordinator | Guardian |
| Data/privacy request | Designated admin | Institute owner | Privacy/legal adviser |

## 6. Pilot scenarios to validate these workflows

Before declaring the process model stable, run at least these scenarios with real staff:

- A walk-in enquiry that converts after two follow-ups.
- Duplicate enquiry created from a web form and manual phone entry.
- Student admitted with a concession and two instalments.
- Student moved to a different batch halfway through the term.
- Attendance corrected after the teacher closed the session.
- Partial fee payment allocated across two due charges.
- Word/Excel question import containing Hindi text, images, equations and malformed rows.
- Paper generation fails because the topic/difficulty pool is short.
- Exam begins on multiple devices at once and reaches a final-minute save burst.
- Student loses network after an acknowledged save and resumes on a second session.
- Teacher marks a written response and a second examiner requests moderation.
- A published result is regraded with a reason.
- A guardian can see the linked learner but cannot see another sibling's records without an explicit link.
- One tenant administrator attempts to access another tenant's student via a modified identifier.

These scenarios become acceptance tests in `QA-PLAN.md`.
