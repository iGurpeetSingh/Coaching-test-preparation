import express, { type ErrorRequestHandler } from "express";
import { admissionRouter } from "./admissions.js";
import { ApiError } from "./enquiry-service.js";
import { enquiryRouter } from "./enquiries.js";
import { followupRouter } from "./followups.js";
import { authRouter } from "./auth.js";
import { checkDatabase, closeDatabase } from "./db.js";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// Process liveness deliberately does not depend on the database.
app.get("/api/v1/health", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    status: "ok",
    service: "coaching-api",
    timestamp: new Date().toISOString()
  });
});

// Deployment platforms should use this endpoint for readiness checks.
app.get("/api/v1/ready", async (_request, response) => {
  const databaseReady = await checkDatabase();
  response.setHeader("Cache-Control", "no-store");
  response.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? "ready" : "not_ready",
    checks: { database: databaseReady }
  });
});

app.get("/api/v1", (_request, response) => {
  response.status(200).json({
    name: "Coaching & Test Preparation API",
    version: "v1",
    status: "foundation",
    modules: ["auth", "enquiries", "admissions", "followups"]
  });
});

// Authentication exposes CSRF bootstrap, login, logout and current-user routes.
app.use("/api/v1/auth", authRouter);

// Business routers provide their own authentication, CSRF and permission middleware.
app.use("/api/v1", enquiryRouter);
app.use("/api/v1/admissions", admissionRouter);
app.use("/api/v1/followups", followupRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested API route was not found." }
  });
});

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message }
    });
    return;
  }

  // express.json raises SyntaxError for malformed request bodies.
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." }
    });
    return;
  }

  console.error("Unhandled API error", error);
  if (!response.headersSent) {
    response.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." }
    });
  }
};

app.use(errorHandler);

const server = app.listen(port, () => {
  console.log("Coaching API listening on http://localhost:" + port);
});

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Received " + signal + "; shutting down API server.");
  server.close(async (error) => {
    if (error) {
      console.error("Error while closing HTTP server", error);
      process.exitCode = 1;
    }
    try {
      await closeDatabase();
    } catch (closeError) {
      console.error("Error while closing database pool", closeError);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { app };
