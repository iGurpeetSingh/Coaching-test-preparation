# Student Exam Papers Connection

The Tests & Exams page is a student-facing paper library. It does not create, edit, publish, or store draft papers.

## Frontend API configuration

Set the Vite environment variable in the Vercel project:

```text
VITE_EXAMS_API_URL=https://<deployed-guri-api-host>
```

Use the base URL only (no `/api` suffix and no trailing slash). Redeploy the website after setting the variable.

## Runtime behavior

- The page always renders separate Objective Exam and Written Exam cards.
- It requests `GET /api/exams/published` from the Python FastAPI service when the page opens or the student clicks Refresh papers.
- The response contains only published paper objects. A missing/unpublished paper remains Coming Soon.
- A published paper with a future `startAt` remains Coming Soon and its questions are not shown.
- Once the scheduled time is reached, the page shows the published paper and allows the student to view its questions.
- No paper is read from browser LocalStorage.
- The website does not receive objective answer keys or written marking guides.

The Python backend stores source files in its private GitHub repository under `data/exams/`. No database is used by this paper publishing flow.

## Start and submit flow

When the scheduled start time arrives, the card displays **Start Exam** until the end of the configured duration. Starting requires the student's name and roll number (self-entered at this stage; there is no authenticated student session in the current project). The browser requests a server-created attempt and receives a private receipt token. The exam timer uses the server-provided deadline.

Objective responses are submitted to the Python service and scored server-side. Written responses are submitted to the same service and saved with an `awaiting_marking` status. Attempt JSON files live in the private GitHub repository, not in browser LocalStorage and not in a database. The student receives a result receipt after submission.
