# Coaching Institute — End-to-End Business Workflows

**Version:** 1.0  
**Research cut-off:** 16 November 2026  
**Applies to:** Target product workflows for Coaching & Test Preparation  
**Status:** Functional workflow design; not a claim that every module is implemented.

## 1. Operating model

The system should use one canonical institute/student record and connect operational events to it. Do not create independent copies of a student in each module.

### Core operating entities

- **Tenant / Institute:** the customer organisation and its data boundary.
- **Branch:** a physical or operational location belonging to an institute.
- **User:** a login identity.
- **Membership:** a user's association with an institute and its status.
- **Role / Permission:** allowed actions, scoped by tenant, branch and assigned records.
- **Student:** learner identity and stable student number.
- **Guardian:** parent/guardian identity linked to one or more students.
- **Course / Subject / Batch:** what is taught and which cohort receives it.
- **Enrollment:** time-bounded student participation in a course/batch.
- **Question / Question Version:** reusable academic item and its immutable versions.
- **Blueprint / Paper Version:** exam design rules and the frozen paper generated from approved question versions.
- **Exam / Assignment / Attempt:** scheduled delivery, target audience and one student's sitting.
- **Evaluation / Result Publication:** grading decision and student-visible released result.
- **Charge / Payment / Allocation / Receipt:** financial obligation, money received, where it is applied and proof of payment.

## 2. Roles and accountability

| Role | Primary responsibility | Typical permitted scope |
|---|---|---|
| Platform Super Admin | Platform operations and exceptional support | Platform-level administration; access is audited |
| Institute Owner | Institute configuration and accountability | All authorised branches and institute reports |
| Branch Admin | Local operations | Assigned branch users, batches, students and reports |
| Admission Counsellor | Enquiry and admission pipeline | Assigned leads, follow-ups and admission handoff |
| Accountant | Fees and reconciliation | Charges, collections, receipts, dues, refunds and financial reports |
| Academic Coordinator | Academic structure and quality | Courses, subjects, syllabus, batches, timetable and academic approvals |
| Teacher | Teaching and assessment | Assigned batches, sessions, content, assigned question banks and grading tasks |
| Exam Controller | Exam operations | Blueprints, paper approval, scheduling, assignments and result-release workflow |
| Student | Learning and assessment participation | Own profile, enrolments, materials, attendance and own attempts/results |
| Parent / Guardian | Learner oversight | Linked child's permitted attendance, schedule, fees and released reports |

Access should be deny-by-default. A user can hold more than one role, but effective permissions must be computed on the server from active membership, role, branch and assignment—not from a client-supplied role string.

## 3. End-to-end workflow A — Institute onboarding and access

**Goal:** establish a secure tenant and provision the first authorised users.

1. Platform creates the institute tenant with a unique slug and initial owner identity.
2. Owner confirms institute profile, timezone, locale, academic calendar, branches and branding.
3. Owner invites branch admins and staff; each invite is single-use, expires and is tied to the intended email/phone identity.
4. Staff accept invitation, set a secure credential and complete required profile fields.
5. Owner assigns role and branch scope. Academic staff also receive course, subject or batch assignments.
6. System records actor, role change, timestamp and scope in the audit log.
7. Each user lands on the correct role-specific dashboard after login.

**Exceptions and controls**

- Duplicate email/phone must not silently create duplicate identities.
- Suspended or expired membership cannot authenticate into institute data.
- Disabling a user revokes active sessions and future access.
- Password reset tokens are single-use, short-lived and stored hashed.
- Privileged accounts should use MFA.
- A user linked to two institutes selects a tenant after authentication; data never crosses tenant context.

**Completion criteria:** Owner can invite one teacher and one student, assign branch/batch access and confirm that each sees only their authorised screens and records.

## 4. End-to-end workflow B — Enquiry to admission

**Scope note:** this is the standard coaching-industry business workflow used to connect the student lifecycle. The Enquiry Management UI/module remains deferred in the current implementation sequence; documenting the workflow does not authorise building that module now.

**Goal:** convert a prospective learner into a verified student and active batch enrolment without re-entering the same data.

1. **Capture:** create a lead from walk-in, phone call, website form, referral, campaign or another configured source.
2. **Deduplicate:** match on normalized phone/email and possible existing student/guardian; show a possible duplicate for staff review.
3. **Qualify:** capture learner name, guardian contact, target course/exam, preferred branch/batch, education level and consent/notice state where required.
4. **Assign:** route to a counsellor using branch, course, source or workload rules. Assignment is visible and auditable.
5. **Follow up:** create dated tasks, call notes and next action. Overdue follow-ups appear in the counsellor queue.
6. **Counselling/demo:** record counselling outcome and any demo-class booking/completion.
7. **Offer:** choose course, batch, fee plan, discount/scholarship and payment schedule.
8. **Admission review:** verify required documents and approvals; do not mark enrolled merely because a lead is interested.
9. **Payment:** accept cash/UPI/bank/cheque or approved payment-gateway confirmation. A manual entry records method, amount, reference, date and operator. A receipt is issued only after the transaction is posted.
10. **Convert:** create or link a canonical Student, create Enrollment, assign batch and create a student login invitation.
11. **Handoff:** notify the academic team; the student appears in class rosters, timetable, attendance and exam eligibility.
12. **Close lead:** set converted/lost/on-hold with reason and preserve the timeline.

**Lead state model (configurable):** New → Assigned → Contacted → Interested → Counselling → Demo Scheduled → Demo Completed → Admission Pending → Converted. Side states include Follow-up, On Hold, Not Interested and Lost. Every transition should be validated and preserve previous status, actor, time and reason.

**Admission invariants**

- One active enrolment per student/course/batch combination unless the business rule explicitly allows parallel enrolments.
- Converting an enquiry must link to an existing student if a verified match exists.
- Batch transfer closes or dates the old enrolment; it never erases academic history.
- Fee discount/concession needs an authorised reason and audit event.
- Document visibility is restricted to permitted staff and linked guardian/student views.

## 5. End-to-end workflow C — Student, guardian and batch lifecycle

1. Student profile is created once with a stable internal ID and institute-specific student number.
2. Guardian records are separate identities; guardian-student links include relationship, verification state and allowed access.
3. Student is enrolled into a course and batch for a defined effective period.
4. Faculty and class schedule are resolved from batch/subject assignments.
5. A batch transfer creates a new enrolment period and preserves the old batch, attendance, assignments and exam attempts.
6. Pause, withdrawal or completion updates enrolment state; it must not delete fees, attendance, submissions or released results.
7. A student login is activated by invitation or secure provisioning. The student can view own information only.
8. Guardian access is available only for explicitly linked children and the permitted information categories.

**Student lifecycle states:** Prospect (future Enquiry module) → Applicant → Admitted → Active → On Hold → Transferred / Withdrawn / Completed → Alumni. The transition rules and effective dates must be configurable.

## 6. End-to-end workflow D — Academic planning and classroom delivery

1. Academic coordinator configures academic year, course, subject and syllabus hierarchy (chapter/topic/subtopic).
2. Coordinator creates batches with branch, capacity, schedule, delivery mode and assigned teachers.
3. Timetable creates class sessions with date, start/end time, room/link and teacher.
4. System checks teacher, room and batch conflicts and warns before save.
5. Teacher opens the session roster and marks attendance (Present, Absent, Late, Excused or configured states).
6. An authorised correction to attendance requires a reason and records before/after values.
7. Teacher attaches homework, notes or study material to a batch/subject/session with release and due dates.
8. Students see current schedule, permitted resources and homework; teachers see completion/submission status.
9. Parents receive only permitted linked-student notices and summaries.
10. Reports roll up class attendance, homework completion and engagement by batch, subject, branch and date range.

**Important:** schedule, attendance and resources must be linked to batch/subject records, not just free-text labels.

## 7. End-to-end workflow E — Question-bank governance

**Goal:** make every assessment question reusable, searchable and safe to use in future exams.

1. Teacher selects tenant, course/exam, subject and syllabus topic.
2. Teacher authors the stem, answer options or rubric, explanation, media and marks.
3. Teacher adds metadata: item type, language, difficulty, cognitive skill, source/provenance, tags and estimated time.
4. Draft is saved with a question version number.
5. Reviewer checks correctness, ambiguity, answer key, language, syllabus relevance and media rights.
6. Approved version becomes eligible for paper generation.
7. An edit to a used or approved item creates a new version; it must not mutate a historic paper or attempt.
8. Retiring a question prevents future selection but does not delete historical use.

**Question lifecycle:** Draft → In Review → Approved → Retired. Rejected/Needs Revision returns to Draft with reviewer comments.

**Supported question-type progression**

- Initial: single-answer MCQ, multi-select, true/false, numerical, short answer and essay.
- Next: fill blank, matching, ordering, passage/stimulus and image-based.
- Later: parameterised/calculated items and richer interactive content.

The exact supported subset must be reflected in import/export validation. Unknown question types must be rejected with row-level errors, not silently coerced.

## 8. End-to-end workflow F — Blueprint and paper generation

1. Exam Controller creates a blueprint for a course/exam and selects eligible syllabus scope.
2. Blueprint defines total questions, section counts, marks, duration, question types, difficulty distribution, cognitive-skill distribution, negative marking and duplicate policy.
3. System validates that rule totals are internally consistent before generation.
4. System selects only approved, eligible question versions.
5. System checks exclusions (previous exposure, same paper duplicates, same-student recent items) according to configured policy.
6. If eligible inventory is insufficient, system generates a shortage report by subject/topic/type/difficulty. It does not silently relax constraints.
7. For a successful generation, system records seed, generator version, blueprint version, question version IDs and selection criteria.
8. Teacher previews candidate paper and answer key. Reviewer approves the final version.
9. Approved paper becomes immutable. A correction creates a new paper version and requires review.
10. Controller schedules exam, sets audience, open/close window, duration, attempt allowance and result visibility.
11. Student dashboards show exam title, instructions, schedule, duration and eligibility; questions remain hidden until the allowed start.

**Paper states:** Draft → Validated → In Review → Approved → Scheduled → Published → In Progress → Closed → Evaluated → Results Published → Archived. Cancelled/Withdrawn can be a terminal state with an audit reason.

## 9. End-to-end workflow G — Online examination

1. Student authenticates and opens their assigned exam.
2. Server verifies membership, batch/enrolment, exam assignment, eligibility, attempt limit, access window and any accommodations.
3. Student reviews instructions and confirms start. Server writes authoritative started_at and deadline_at.
4. Exam player displays remaining time derived from the server deadline; browser clock is display-only.
5. Answers are saved as revisions. The UI shows “Saved” only after the server confirms transaction commit.
6. On network loss, retain a local pending draft and clearly label it “Not yet synced.” On reconnect, reconcile revisions and show any conflict; do not claim an unacknowledged answer was saved.
7. Student submits. API uses an idempotency key and locks the attempt transactionally.
8. If deadline is reached first, server auto-submits or applies the configured overdue rule using database time.
9. Attempt is finalised and its question/answer-key/scoring-policy snapshots remain fixed.
10. If a submission races with auto-submit or the user retries, the system returns the same final attempt and must not create duplicate grading.

**Attempt states:** Not Started → In Progress → Submitted / Auto Submitted → Evaluated → Result Published. Interrupted/Expired is an operational state only if policy defines how it resolves.

**Exam-integrity principles**

- Tab switches, fullscreen exit and disconnects are signals, not proof of misconduct.
- Server time and server-side permissions decide eligibility and deadlines.
- Accommodation (extra time, reader or other approved adjustment) must be recorded explicitly.
- No student should see the answer key or results before the exam's release policy allows it.

## 10. End-to-end workflow H — Evaluation and result publication

1. Submitted objective responses are graded using the frozen answer key and scoring-policy version.
2. The scoring engine records correct, incorrect, unanswered, partial and negative-mark components separately.
3. Subjective answers enter an assigned marking queue.
4. Teacher marks each answer against a rubric, maximum marks and feedback field.
5. Moderation is required for configured exams, unusual score changes or second-marker policies.
6. Regrade creates a new evaluation version, captures reason, actor, before/after marks and time.
7. Exam Controller reviews completion and grade exceptions.
8. Authorised user publishes results; the system creates an immutable Result Publication snapshot.
9. Student sees marks, status, permitted answer review and feedback. Parent sees only what the institute permits.
10. Analytics aggregate results by student, batch, subject, topic, question, section and exam set.

**Result states:** Pending Evaluation → Evaluated → Awaiting Approval (optional) → Published → Superseded by a later audited publication (if regraded). A published result is never silently overwritten.

## 11. End-to-end workflow I — Fees and financial control

1. Configure fee components and effective-dated fee plans by course/batch/academic cycle.
2. Assign a fee plan to an enrolment; calculate charges and instalment due dates.
3. Apply authorised scholarship/discount/concession and preserve reason and approver.
4. Record payment against one or more charges; support partial and split allocation.
5. Post the payment transaction and create a receipt with unique receipt number.
6. Recalculate outstanding balance from charges less posted allocations and valid adjustments.
7. Generate due/ageing reports and reminders; do not auto-debit or mark paid from a reminder event.
8. Correct mistakes through reversal/refund/adjustment records, not deletion of posted history.
9. Reconcile manual cash/UPI/bank/cheque entries against a bank statement or payment provider report.
10. Produce daily collection, fee due, student ledger and expense reports.

**Financial invariants:** money uses fixed-precision decimal; payment amount and allocations reconcile; duplicate posting is blocked by idempotency; receipt is immutable; refund links to original payment; permissions and audit are mandatory.

## 12. End-to-end workflow J — Communication and notifications

1. A business event occurs (exam scheduled, class changed, payment posted, due date approaching, result published).
2. System resolves intended recipients from tenant, branch, batch, role and guardian links.
3. System creates an in-app notification/outbox event with template version and deduplication key.
4. Optional provider adapter sends email/SMS/WhatsApp/push where configured and consent/policy permit.
5. Provider result is recorded as queued/sent/delivered/failed where available; retry is bounded and idempotent.
6. Sensitive content is minimised in notification text; full account or result details require authenticated portal access.

Core operations must work without third-party messaging APIs. External delivery is an optional integration, not the source of truth.

## 13. End-to-end workflow K — Reporting and intervention

Role-based dashboards should support decisions, not just display vanity totals.

- **Owner:** enrolment movement, branch comparisons, fee receivables, attendance risk, batch outcomes and teacher workload.
- **Branch Admin:** current active students, daily attendance, due follow-up, classes and exam schedule.
- **Counsellor:** assigned lead ageing, next actions, conversion by source and follow-up SLA.
- **Accountant:** collections, outstanding dues, receipts, refunds, adjustments and reconciliation exceptions.
- **Academic Coordinator:** syllabus progress, attendance, homework, test coverage and marking backlog.
- **Teacher:** assigned classes, students needing attention, question quality and pending marking.
- **Exam Controller:** blueprint shortages, paper approvals, exam participation, auto-submit exceptions and result publication status.
- **Student:** own schedule, learning tasks, attempts, marks, topic strengths/gaps and history.
- **Parent:** linked learner schedule, permitted attendance, dues and published performance.

Every analytics definition must state its denominator, date range, cohort and inclusion/exclusion rules. Rank and percentile must declare the comparison population, tie policy and missing-attempt handling.

## 14. Cross-workflow events and audit requirements

Important domain events include:

- MembershipInvited, MembershipActivated, MembershipSuspended, RoleChanged
- StudentCreated, GuardianLinked, EnrollmentCreated, EnrollmentTransferred, EnrollmentEnded
- FeeChargePosted, PaymentPosted, ReceiptIssued, RefundPosted, AdjustmentPosted
- AttendanceRecorded, AttendanceCorrected, MaterialPublished, HomeworkSubmitted
- QuestionVersionCreated, QuestionApproved, QuestionRetired
- BlueprintValidated, PaperGenerated, PaperApproved, ExamPublished, ExamCancelled
- AttemptStarted, AnswerSaveAcknowledged, AttemptSubmitted, AttemptAutoSubmitted
- EvaluationCompleted, RegradeCreated, ResultPublished, ResultPublicationSuperseded

Each audit record should include actor, tenant, branch where applicable, entity type/id, action, timestamp, correlation/request ID and safe before/after metadata. Never log passwords, raw session secrets, private payment credentials or unnecessary child data.

## 15. Operational exceptions that must be designed, not improvised

- Duplicate student/enquiry or conflicting identity match.
- Student transfers batch after an exam was assigned.
- Teacher leaves or changes branch while grading is pending.
- Exam schedule changes after students have seen the notice.
- Question is flagged after being used in a published paper.
- Student loses connectivity during an exam.
- Two tabs attempt to submit one exam.
- Deadline auto-submit races with manual submit.
- Refund or fee correction occurs after a receipt was issued.
- Result requires regrade after students have viewed it.
- Guardian relationship is revoked or disputed.
- Branch is suspended while students have future exam assignments.

## 16. Pilot walkthrough

Before production readiness, run this scenario with real institute staff using non-production sample data:

1. Owner creates institute and two branches.
2. Owner invites one branch admin, two teachers, one accountant and one exam controller.
3. Admin creates a course, subject and two batches.
4. Teacher creates and submits questions; coordinator reviews and approves them.
5. Exam Controller creates a blueprint, generates a paper, reviews shortage report and publishes an exam.
6. Admin admits sample students and links guardians; students receive login access and exam assignment.
7. Accountant posts full and partial payments and prints receipts.
8. Teacher records attendance and releases a resource.
9. Students attempt exams on desktop and mobile, including refresh and simulated network interruption.
10. Objective grading runs; subjective responses are marked and moderated.
11. Controller publishes results; students/guardians see only permitted records.
12. Owner checks branch, batch, fee, attendance and topic-level performance reports.
13. Tester tries cross-branch and cross-student access; every unauthorised request is denied and logged.
14. Restore the environment from backup and verify that paper, attempt, payment and result history remains consistent.

**Pilot exit:** no critical data leakage, no lost acknowledged answers, no duplicate financial posting, no un-audited result change and no unresolved critical workflow blocker.
