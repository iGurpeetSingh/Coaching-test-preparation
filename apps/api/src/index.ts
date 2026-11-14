import express, { type ErrorRequestHandler } from "express";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.get("/api/v1/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "coaching-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/v1", (_request, response) => {
  response.status(200).json({
    name: "Coaching & Test Preparation API",
    version: "v1",
    status: "foundation"
  });
});

app.use((_request, response) => {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested API route was not found." }
  });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error("Unhandled API error", error);
  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred." }
  });
};

app.use(errorHandler);

const server = app.listen(port, () => {
  console.log("Coaching API listening on http://localhost:" + port);
});

const shutdown = (signal: string) => {
  console.log("Received " + signal + "; shutting down API server.");
  server.close((error) => {
    if (error) {
      console.error("Error during graceful shutdown", error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
