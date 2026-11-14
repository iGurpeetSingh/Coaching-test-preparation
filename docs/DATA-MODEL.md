# Logical Data Model

This is a logical model; SQL types, indexes, partitions and migration details will be confirmed during implementation.

## Entity groups

### Platform and IAM
Tenant, Branch, User, Membership, Role, Permission, MembershipRole, Session, AuditEvent.

### Admissions and academics
Lead, Enquiry, Application, Student, Guardian, GuardianLink, AcademicYear, Course, Subject, Chapter, Topic, Batch, FacultyAssignment, Enrollment, ClassSession, Attendance, Homework, HomeworkSubmission, StudyMaterial.

### Finance
FeePlan, FeeComponent, InstallmentSchedule, StudentCharge, Payment, PaymentAllocation, Receipt, Refund, Adjustment, Expense. LedgerAccount, JournalEntry and JournalLine may be introduced for a later double-entry module.

### Question bank
Question, QuestionVersion, QuestionOption, QuestionTag, QuestionVersionTag, QuestionMedia, ReviewEvent.

### Assessment
Blueprint, BlueprintRule, Paper, PaperVersion, PaperSection, PaperQuestion, Exam, ExamAssignment, ExamAttempt, AttemptQuestion, AnswerRevision, ScoringPolicyVersion, Evaluation, RubricScore, RegradeEvent, ResultSnapshot, ResultPublication.

### Governance
PrivacyNoticeVersion, ConsentRecord, DataRequest, RetentionRule, IncidentRecord, Notification, OutboxEvent.

## Key relationships

- Tenant has branches, memberships, students, courses and academic years.
- Student has guardian links and multiple historical enrollments.
- Batch belongs to a branch and course; enrollment links student, batch and course.
- Class session belongs to batch/subject/faculty; attendance joins session and student.
- Student charges are settled via payment allocations; one payment can settle multiple charges.
- Question has many immutable QuestionVersions.
- Blueprint generates a PaperVersion from selected QuestionVersions.
- Exam assignments bind a student/group to a frozen paper version.
- ExamAttempt stores the assigned version/snapshot and has many AnswerRevisions.
- Evaluation references frozen scoring and question versions; publication creates a result snapshot.

## Integrity rules

1. All tenant-owned entities carry tenant_id.
2. Tenant-aware composite FKs prevent references across tenants.
3. Use unique (tenant_id, entity_id) pairs for referenced tenant records.
4. Use branch scope where workflows are branch-specific.
5. QuestionVersion is immutable once approved/used.
6. PaperVersion, PaperQuestion snapshots and answer key freeze at approval.
7. Attempt answer revisions are append-only or versioned; final attempt is immutable except audited correction.
8. Published result is a snapshot; regrade creates a new version with history.
9. Posted payment, receipt, refund and adjustment records are append-only.
10. Store money as NUMERIC/decimal, never binary floating-point.
11. Idempotency keys protect payment and exam submission from duplicate requests.
12. AuditEvent records actor, tenant, action, entity, timestamp and safe metadata.

## High-level flow

Lead → Application → Student → Enrollment → Batch/ClassSession → Attendance/Homework → QuestionVersion → Blueprint → PaperVersion → ExamAssignment → ExamAttempt → AnswerRevision → Evaluation → ResultSnapshot → ResultPublication.

Financial flow:
FeePlan → StudentCharge/Installment → Payment → PaymentAllocation → Receipt; refund/reversal remains a separately recorded financial event.
