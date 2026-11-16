# Paper Text Format — Coaching Demo Paper Management

Paper text is created and published from the **Paper** page inside this Coaching application. No Python app or external paper API is involved.

## Objective Exam

The Objective parser requires exactly 50 MCQs. Every question has four options and an answer-key line. Each question is worth 2 marks, giving 100 marks total.

```text
1. What does CPU stand for?
A) Central Processing Unit
B) Computer Personal Unit
C) Central Program Utility
D) Control Processing User
Answer: A

2. Which device is used to type text?
A) Monitor
B) Keyboard
C) Speaker
D) Printer
Answer: B

... continue through question 50 ...
```

Accepted question numbering includes `1.`, `1)`, `1:`, or `Q1.`. Options must be labelled A through D. Accepted answer-key examples include `Answer: B` and `उत्तर: B`.

## Written Exam

Every written question must have a marks line. Allowed values are 2, 4 or 6. The total of all written questions must equal exactly 100 marks.

```text
1. Define computer hardware.
Marks: 2

2. Explain the role of an operating system.
Marks: 4

3. Describe the main functions of a CPU.
Marks: 6

... continue until the written total is 100 marks ...
```

## One mixed pasted document

The parser can process a document containing both sections even if question numbering restarts at 1:

- Objective parsing keeps numbered blocks that contain A-D options or an answer key, then checks all 50 MCQs.
- Written parsing excludes MCQ blocks and keeps numbered descriptive questions with valid Marks lines.
- You can switch between Objective Exam and Written Exam in Paper Management to validate each section from the same pasted text.

## Save, publish and exam

1. Enter the paper title, subject, class/batch, schedule, duration and instructions.
2. Select Objective Exam or Written Exam.
3. Paste the question text and select **Preview parsed paper**.
4. Review the count, total marks, questions and (for Objective) answer key.
5. Select **Save Draft** or **Publish Objective Exam / Publish Written Exam**.
6. Open **Tests & Exams** in the same browser profile. The published paper appears there; future papers show **Coming Soon**, live papers show **Start Exam**.

Objective submissions are auto-scored. Written submissions are marked per question by the teacher from Paper Management. After marks are saved, the Written result is published.

## Demo storage boundary

The current demo stores papers and attempts in browser LocalStorage. It survives refreshes in the same browser profile and syncs between same-origin tabs. It does not sync to a different phone, computer or browser profile. This is intentionally a demo implementation, not production student-data storage.
