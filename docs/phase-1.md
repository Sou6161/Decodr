# Phase 1 — Foundation

Project setup, application architecture, database, and base UI.

## What was built

- **Monorepo** via npm workspaces: `apps/api`, `apps/web`, `packages/types`.
- **`@arcloom/types`** — the shared contract package. Domain models and HTTP DTOs
  live here once and are imported by both client and server, so the API can never
  drift from the UI's expectations.
- **Backend** (`apps/api`) — Express + strict TypeScript in a clean-architecture
  layout: `controllers → services → repositories`, with independent `parser`,
  `graph`, and `ai` modules (the latter two seeded this phase).
- **Database** — PostgreSQL + Prisma. The full schema (Repository, File,
  Component, Hook, Route, ComponentEdge) is modeled and migrated now, even though
  most tables are populated in later phases.
- **AI abstraction** — `AIProvider` interface + `OpenAIProvider` + a
  `providerFactory`. Business logic depends only on the interface.
- **Frontend** (`apps/web`) — React 19 + Vite + Tailwind v4 (dark design system) +
  React Router v7 + TanStack Query + Zustand. App shell with sidebar/topbar,
  animated route transitions, and hand-built UI primitives (no component library).

## Key design decisions

| Decision | Rationale |
| --- | --- |
| Shared `@arcloom/types` package | Single source of truth for contracts; compile-time guarantee that client and server agree. |
| Full DB schema up front | The data model is the backbone; migrating it now keeps later phases additive, not destructive. |
| Denormalized counts on `Repository` | Cheap list/dashboard rendering without aggregate queries on every request. |
| `AIProvider` interface + factory | Swapping OpenAI → Claude/Gemini/Ollama is one class + one factory branch; no business-logic changes. |
| Controllers throw typed `AppError` | One terminal error middleware turns every failure into a consistent `ApiError` envelope. |
| 501 stubs for later-phase endpoints | The API contract is visible and stable from day one; phases stay honest about what works. |
| TanStack Query owns server state; Zustand only UI state | Avoids duplicating server data in a global store; clear ownership boundaries. |
| Hand-built UI primitives | Demonstrates component craft; zero lock-in to a design system. |

## Trade-offs

- **Synchronous processing model (planned):** the pipeline will run inline on the
  request rather than via a job queue. Simpler for the MVP; the `status`/`progress`
  fields already anticipate a future move to background jobs.
- **No auth:** intentionally out of scope; every repository is currently global.
- **Local filesystem storage:** extracted repos live on disk under `storage/`.
  Fine for single-node dev; object storage is a later concern.
- **Coarse progress percentages:** progress is derived from lifecycle status, not
  real per-file counters. Good enough for a believable UX now.

## Possible improvements

- Add ESLint + Prettier + a pre-commit hook and CI typecheck.
- Add request logging middleware and a request-id for traceability.
- Introduce a result/`ApiResult` pattern on the client for non-throwing flows.
- Containerize Postgres via docker-compose for one-command setup.

## Verification

- `npm install` clean (0 vulnerabilities).
- `npm run typecheck` passes for api + web.
- `npm run build --workspace @arcloom/web` produces a production bundle.
- Prisma migration `init` applied to local `arcloom` DB.
- API boots; `/api/health` reports `database: up`; `/api/repositories` returns
  `[]`; later-phase endpoints return `501`; unknown routes return a `404` envelope.
