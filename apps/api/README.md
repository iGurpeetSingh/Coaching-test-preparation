# API workspace

Express + TypeScript API foundation.

## Commands

Run from the repository root:

- npm run dev:api — start API at http://localhost:4000
- npm run typecheck — typecheck all workspaces
- npm run build — build all workspaces

## Initial routes

- GET /api/v1 — API metadata
- GET /api/v1/health — process health check

The current health endpoint confirms the API process is responding. It does not yet check PostgreSQL because database integration is a later foundation step.
