# Decodr

**Understand any React codebase in minutes.**

Decodr is a codebase-analysis platform for React + TypeScript projects. Pick a project folder and Decodr parses it with the TypeScript Compiler API (never regex), models the architecture as a component dependency graph, surfaces insights on a dashboard, and answers questions about the code with explanations grounded in the files that actually matter.

**Live:** https://decodr-web.imsrb.in

> This is a portfolio project built to demonstrate clean architecture, strong typing, and pragmatic AI integration. The AI is one module — most of the intelligence comes from static analysis and graph modeling.

---

## Features (MVP)

1. **Folder upload** — pick a project folder; the browser walks it, skips `node_modules` and build output, and uploads only source files and manifests. ZIP upload is also supported.
2. **Static parser** — the TypeScript Compiler API extracts components, imports/exports, custom hooks, React Router routes (nested ones joined to full URLs) and file-based routes (Expo Router, Next App Router, Next Pages Router). Imports resolve through tsconfig/jsconfig `paths` (`@/…`), NodeNext-style `.js` specifiers, barrel re-exports, namespace imports and `lazy()`/`require`. Syntax-only, so a project parses without installing its dependencies.
3. **Component graph** — dependency graph persisted in PostgreSQL and visualised with React Flow.
4. **Dashboard** — files, components, hooks, routes, largest and most-imported components, folder tree.
5. **Code map** — the biggest and most depended-on components as two bar charts, each bar a link into Explain.
6. **Explain** — ask about the code and get a streamed answer grounded in real source, with conversation memory, `@file` mentions, pasted-error diagnosis, clickable citations, and tools the model uses to open and search files itself. Answers match the depth the question asks for.
7. **Session isolation** — no login. Each visitor gets a 256-bit token in an httpOnly cookie and only ever sees their own uploads, which are deleted automatically after 48 hours.

A full walkthrough of how every part works, with interview-style Q&A, is in [docs/interview-guide.md](docs/interview-guide.md).

---

## Tech stack

| Layer    | Tech |
| -------- | ---- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router v7, Zustand, TanStack Query, React Flow, dagre, Framer Motion (all UI primitives hand-built) |
| Backend  | Node.js, Express, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| AI       | OpenAI `gpt-4o-mini` behind a provider abstraction (any OpenAI-compatible endpoint) |
| Hosting  | Vercel (web), Render (API), Neon (database) |

---

## Monorepo layout

```
decodr/
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
- An **API key** for explanations (everything except Explain works without one)

---

## Getting started

```bash
# 1. Install dependencies (npm workspaces)
npm install

# 2. Configure environment
cp .env.example .env
#    -> set DATABASE_URL and OPENAI_API_KEY

# 3. Create the database and run migrations
createdb decodr            # one-time, if it doesn't exist
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
| `npm test` | Run the test suite (vitest) |

---

## How the AI reaches the whole codebase

A mid-size project is 150k–600k tokens of source — past the model's context window, and expensive to send on every message. Decodr gets whole-repo reach a different way:

**Graph-driven retrieval, no embeddings.** A question is scored against component names and file paths, the best match becomes the focus, and the import graph is walked outward to pull in its neighbours:

```ts
const outgoing = edges.filter((e) => e.sourceId === focus.id);
const incoming = edges.filter((e) => e.targetId === focus.id);
```

Those files are sent — up to 14, each capped at 12,000 characters, 110,000 in total — under one budget for every question. There used to be Quick and Detailed modes; they were removed because nobody can judge how much context a question needs before reading the answer. The model matches depth to the question and fetches more itself when it needs to.

**A project map.** Every file in the repository is listed on one line each (path, size, what it declares, what it imports) for roughly 1% of the tokens the source would cost, so the model knows what exists even though it has only read a few files.

**On-demand tools.** The model can call `read_files` to open any path from the map, `search_code` to find a string anywhere (backed by a trigram index), `find_usages` to walk the import graph and `get_component` to locate a definition — bounded to 3 rounds and a read budget. Retrieval guesses up front; the tools are the escape hatch when it guesses wrong.

Source text is stored in PostgreSQL at analysis time, so explanations keep working after the host wipes its ephemeral disk.

## Architecture principles

- **Strict TypeScript** everywhere, shared contracts in `@decodr/types`.
- **Clean architecture** on the backend: controllers → services → repositories; the parser, graph, and AI layers are independent modules.
- **Provider-agnostic AI**: business logic depends on an `AIProvider` interface, never on a concrete SDK.
- **Static-analysis first**: the AI receives a small, focused context — never the whole repository.

## Roadmap (post-MVP)

Languages beyond React/TypeScript (the parser sits behind its own module), an MCP server so the analysis works inside coding agents, GitHub import, a job queue so processing runs on separate workers, and hybrid keyword + embedding retrieval (pgvector) for questions whose wording shares nothing with file names.
