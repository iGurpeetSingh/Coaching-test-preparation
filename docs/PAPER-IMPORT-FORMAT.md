# Paper Import Format and Exam Workflow

The Tests & Exams import tool accepts one pasted text document and creates two independent draft papers under one shared exam group.

## Required section headings

Use these exact headings on separate lines:

- `[OBJECTIVE]` for the 50 MCQ section.
- `[WRITTEN]` for descriptive questions.

## Header fields

```text
Exam: Science Unit Test 01
Subject: Science
Class: Class 10
Date: 20-11-2026
Time: 10:00 AM
Objective Duration: 60
Written Duration: 150
```

Date accepts `DD-MM-YYYY` or another date string JavaScript can parse. Time accepts 24-hour `HH:MM` or 12-hour `HH:MM AM/PM`.

## Objective section

Each question must have a number, prompt, four options and a correct answer.

```text
[OBJECTIVE]
Q1. What is the SI unit of electric current?
A) Volt
B) Ampere
C) Ohm
D) Watt
Answer: B

Q2. Which device measures electric current?
A) Voltmeter
B) Thermometer
C) Ammeter
D) Barometer
Answer: C

... continue through Q50 ...

Answer Key:
1-B, 2-C, 3-A, 4-D
```

The importer assigns 2 marks to every objective question. Publishing is blocked unless there are exactly 50 questions, four complete options per question, a correct answer key for every question, and a total of 100 marks. The answer key must not be shown to students in the online paper.

## Written section

Add marks to every question using `(2 marks)`, `(4 marks)` or `(6 marks)`.

```text
[WRITTEN]
Q1. Define electric current. (2 marks)
Q2. Explain Ohm's law with its mathematical expression. (4 marks)
Q3. Describe the factors affecting resistance of a conductor. (6 marks)
... add questions until the written total is exactly 100 marks ...
```

The written total must equal 100 marks. Student responses are saved as text in the browser. Submitted answers enter the teacher marking queue; a teacher assigns marks per question before a written result is final.

## Publish and student visibility

- Import creates both papers as drafts.
- Objective and Written publish states are independent.
- Unpublishing one paper does not unpublish or delete the other.
- A published paper scheduled in the future appears to students as **Coming Soon**.
- The Start button is enabled only during the published exam window.
- Objective answers are scored automatically against the answer key.
- Written answers remain pending until teacher marking is saved.
- Combined results match both attempts by exam group and roll number.

## Current storage scope

The current website implementation stores imported exams and attempts in that browser's localStorage. It survives refresh in the same browser but does not synchronize data across devices or users. Cross-device publishing from the separate Python/Guri mobile app requires a shared authenticated API and persistent database connection; that connection is not configured by this change.
