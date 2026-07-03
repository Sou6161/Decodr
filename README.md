# Arcloom

**Understand any React codebase in minutes.**

Arcloom is an intelligent codebase-analysis platform for React + TypeScript projects. Upload a repository as a ZIP and Arcloom statically analyzes it (via the TypeScript Compiler API — never regex), models its architecture as a component dependency graph, surfaces repository insights on a dashboard, and answers architecture questions with **context-aware** AI explanations that only ever see the files relevant to your question.

> This is a portfolio project built to demonstrate clean architecture, strong typing, and pragmatic AI integration. The AI is one module — most of the intelligence comes from static analysis and graph modeling.

---

## Features (MVP)

1. **Repository upload** — ZIP upload with extraction and live scan progress.
2. **React project parser** — TypeScript Compiler API extracts components, imports/exports, custom hooks, and React Router routes.
3. **Component relationship graph** — dependency graph persisted in PostgreSQL and visualized with React Flow (zoom, pan, search, node metadata).
4. **Repository dashboard** — files, components, hooks, routes, largest/most-imported components, folder structure.
5. **Intelligent code explanation** — locates a feature, builds a focused context from related files only, and asks the LLM to explain it.
6. **Professional UX** — skeletons, loading/error/empty states, smooth transitions, fully responsive dark UI.

---

## Tech stack

| Layer    | Tech |
| -------- | ---- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7, Zustand, TanStack Query, React Flow, Framer Motion (UI primitives hand-built) |
| Backend  | Node.js, Express, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| AI       | Provider abstraction (OpenAI first; Claude / Gemini / Ollama as future providers) |

---

## Monorepo layout

```
arcloom/
├── apps/
│   ├── api/      # Express backend — clean architecture
│   └── web/      # React frontend — feature-based
├── packages/
│   └── types/    # Shared TypeScript contracts (API DTOs, domain types)
├── package.json  # npm workspaces
└── tsconfig.base.json
```

### Backend (`apps/api`)
```
src/
├── controllers/   # HTTP request/response handlers (thin)
├── services/      # Business logic / use cases
├── repositories/  # Data access (Prisma)
├── parser/        # TypeScript Compiler API analysis
├── graph/         # Dependency-graph modeling
├── ai/            # Provider abstraction + context builder
├── middleware/    # Cross-cutting concerns (errors, uploads, validation)
├── database/      # Prisma client + connection
├── routes/        # Express route definitions
├── types/         # Backend-internal types
└── utils/         # Helpers
```

### Frontend (`apps/web`)
```
src/
├── features/      # Feature modules (upload, graph, dashboard, explain)
├── components/    # Reusable hand-built UI primitives
├── layouts/       # App shell / page layouts
├── pages/         # Route-level pages
├── hooks/         # Shared hooks
├── services/      # API client (TanStack Query)
├── stores/        # Zustand stores
├── types/         # Frontend types
└── utils/         # Helpers
```

---

## Prerequisites

- **Node.js ≥ 20** (developed on Node 25)
- **PostgreSQL ≥ 14** running locally (developed on PostgreSQL 17 via Homebrew)
- An **OpenAI API key** (only needed for Feature 5 — the rest works without it)

---

## Getting started

```bash
# 1. Install dependencies (npm workspaces)
npm install

# 2. Configure environment
cp .env.example .env
#    -> set DATABASE_URL and OPENAI_API_KEY

# 3. Create the database and run migrations
createdb arcloom            # one-time, if it doesn't exist
npm run db:migrate

# 4. Run both apps
npm run dev
#    web -> http://localhost:5173
#    api -> http://localhost:4000
```

---

## Scripts (root)

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Run api + web together |
| `npm run build` | Build types, api, then web |
| `npm run typecheck` | Typecheck all workspaces |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:studio` | Open Prisma Studio |

---

## Architecture principles

- **Strict TypeScript** everywhere, shared contracts in `@arcloom/types`.
- **Clean architecture** on the backend: controllers → services → repositories; the parser, graph, and AI layers are independent modules.
- **Provider-agnostic AI**: business logic depends on an `AIProvider` interface, never on a concrete SDK.
- **Static-analysis first**: the AI receives a small, focused context — never the whole repository.

## Roadmap (post-MVP)

Auth, GitHub import, embeddings/pgvector, background jobs, dead-code & complexity analysis, multi-language support. These are intentionally left as extension points.
