# Student Exam Papers — Local Demo Workflow

The Student Exam Portal and Paper Management now run entirely inside this Coaching repository. The paper workflow does not call the Python/Guri repository, Render, or an external exam API.

## Where papers are created

Open the Coaching workspace and choose **Paper** in the sidebar. The Paper Management screen supports:

- Separate Objective Exam and Written Exam paper modes.
- Title, subject, class/batch, scheduled date/time, duration and student instructions.
- Pasted question-paper text and parser validation.
- Teacher preview, answer-key visibility and print/PDF preview.
- Save Draft, Publish, Edit/Load and Unpublish.
- Student submissions, automatic Objective scoring and Written marking.

## Question format and validation

Objective format:

- Exactly 50 questions.
- Four options for every question: A), B), C), D).
- One answer-key line per question: `Answer: A`, `Answer: B`, `Answer: C`, or `Answer: D`.
- 2 marks per question, total 100.

Written format:

- Each question has a `Marks: 2`, `Marks: 4`, or `Marks: 6` line.
- The sum of all written-question marks must equal 100.
- If one pasted document contains both MCQs and Written questions, the Objective parser ignores numbered blocks without options/answer keys, and the Written parser ignores MCQ blocks.

The parser does not silently change the paper's question count or marks. A validation error must be fixed before saving or publishing.

## Publish and student visibility

- Publish makes the latest published paper of that type available in **Tests & Exams**.
- Objective and Written publish states are independent.
- A saved draft does not replace an already-published paper.
- A new published paper replaces the previous published version of the same type; historical attempts keep their own paper snapshot.
- A future scheduled paper shows **Coming Soon**.
- During the scheduled exam window, the card shows **Start Exam**.
- When the scheduled duration ends, the paper shows **Exam Closed**.
- The Student Exam Portal refreshes the list automatically and also has a manual Refresh papers control.

## Student attempts and results

Students enter their name and roll number in demo mode. Answers are stored as they are entered. The attempt timer uses the stored scheduled deadline.

- Objective attempts are scored automatically using the paper's saved answer key.
- Written submissions remain **Awaiting teacher evaluation**.
- The teacher opens **Paper**, enters marks for each written question within that question's maximum marks, and selects **Save marks & publish result**.
- The student's written result changes to Graded after the teacher saves the marks.

## Demo storage boundary

This is intentionally a same-browser demonstration:

- Papers and attempts are stored in that browser profile's `localStorage`.
- Refreshing the page or navigating between Paper and Tests & Exams keeps the records.
- Other tabs on the same origin receive updates.
- A different phone, computer, browser profile or incognito session has separate storage and will not see those records.
- Browser storage can be cleared and is not a secure production store.

No Python repository, Android Publish button, Render URL, Vercel API environment variable or separate paper service is needed for this demo. Cross-device or multi-user synchronization would require this Coaching application to add its own authenticated backend storage in a later phase.
