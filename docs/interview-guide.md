# Decodr — Interview Guide

How every part of Decodr works, written from the source (October 2026) and updated after the weakness-fixing pass described in section 9. All numbers are what the code says **today**. The `docs/phase-*.md` files are the historical build log; section 11 lists where they describe older behaviour.

---

## 1. The pitch

### 30 seconds
> Decodr helps you understand any React + TypeScript codebase in minutes. You drop in a project folder. The backend parses every file with the TypeScript Compiler API, pulls out components, hooks, routes and imports, and builds a component dependency graph in PostgreSQL. On top of that you get a dashboard, an interactive graph, and an AI chat that answers questions using the files that actually matter. It doesn't send the whole repo to the model. It uses the graph to pick related files, gives the model a one-line-per-file map of the project, and lets it open more files itself through tool calls. There's no login: each visitor gets a 256-bit session cookie, and uploads are deleted after 48 hours.

### 2 minutes (add these)
- **Monorepo:** npm workspaces with `apps/api` (Express + Prisma), `apps/web` (React 19 + Vite) and `packages/types`, a shared contract package that both sides compile against.
- **Static analysis comes first, the AI second.** Most of the intelligence is deterministic: the parser, the graph and the ranking. The LLM is one module behind an `AIProvider` interface.
- **Retrieval without embeddings.** Questions are keyword-scored against component names and paths. The best match becomes the focus, and the graph is walked one hop in both directions. The model also sees a compact *project map* of every file, plus 4 tools: `read_files`, `search_code`, `find_usages` and `get_component`.
- **Streaming:** Server-Sent Events over a POST. Stop really cancels the upstream model call through an `AbortController`.
- **Hosting:** Vercel (web), Render (API), Neon (Postgres). It's built for free tiers: source text lives in Postgres because Render's disk is ephemeral, and a GitHub Action pings `/api/ping` every 10 minutes so the free instance doesn't spin down.

### Why I built it / what it shows
Clean architecture, strict typing end to end, and practical AI engineering: retrieval, tool use, fallbacks, streaming, cost control and prompt design. It's also a real product with real security limits, even without a login.

---

## 2. Architecture at a glance

```
Browser (React 19, Vite, TanStack Query, Zustand, React Flow)
   │  fetch(credentials:'include')  +  SSE over fetch POST
   ▼
Express API (Render)  ── helmet → cors(credentials) → json(1mb) → cookieParser
   │                     → attachOwner (session cookie) → generalLimiter → routes
   │                     → notFound → errorHandler
   ├─ controllers/   thin: zod-parse → service → typed DTO
   ├─ services/      business logic (upload, processor, analysis, dashboard, graph,
   │                 conversation, explanation, retention, file)
   ├─ repositories/  all Prisma queries + mappers (row → DTO)
   ├─ scanner/       walk the extracted dir, read files, count lines
   ├─ parser/        TypeScript Compiler API: components, hooks, imports, exports, routes
   ├─ graph/         RENDERS edges between components
   ├─ routing/       file-based routes (Next app/pages, Expo Router) from paths
   └─ ai/            provider abstraction, retrieval, repo map, intent, mentions,
                     prompts, tools, summarizer, titler, follow-ups
   ▼
PostgreSQL (Neon) via Prisma  — Repository, File(+content), Component, Hook, Route,
                                ComponentEdge, Conversation, Message
   ▼
OpenAI-compatible gateway (OpenRouter) — primary model + fallback chain
```

**Layering rule:** controllers → services → repositories. The parser, graph and AI modules are independent. Business logic depends on the `AIProvider` interface, not on the OpenAI SDK, and services never call Prisma directly (except one spot: the AI tools in `codeTools.ts` query Prisma directly, which is an honest nit).

---

## 3. The two main flows, end to end

### 3a. Upload → analysis (async pipeline)

1. **Client collects files** (`features/upload/collectFiles.ts`). There are three ways in:
   - `showDirectoryPicker()` (Chrome/Edge, File System Access API). We walk the directory handles ourselves and never open `node_modules`, so a 113k-entry project becomes a walk of a few hundred entries. Progress is reported every 200 entries.
   - The `<input webkitdirectory>` fallback. The browser enumerates everything first, which is unavoidable, so we filter in a single pass.
   - Drag and drop with `webkitGetAsEntry`. `readEntries` returns batches, so we keep calling it until it returns an empty batch. A single dropped `.zip` takes the ZIP path.
   - Kept: `.ts/.tsx/.js/.jsx/.mjs/.cjs` plus `package.json`, `.env.example`, `.env.sample` and `tsconfig*.json`/`jsconfig.json` (so path aliases can be resolved). A real `.env` is **never** uploaded, so secrets never leave the browser. Files over 2 MB are skipped and the total is capped at 8000 files.
2. **Upload** (`uploadApi.uploadFolder`): multipart with `name`, a `manifest` (JSON array of relative paths) and `files`. The manifest exists because multipart filenames lose folder structure. The server pairs paths with files **by index**.
3. **Server middleware** (`middleware/upload.ts`): multer `diskStorage` streams to `storage/_uploads/<uuid>.src`. Limits are 4 MB per file and 12,000 files, and a `fileFilter` applies the same extension rules as the client. ZIPs take a separate multer instance: `.zip` name **and** an allowed MIME type, size up to `MAX_UPLOAD_MB`.
4. **Controller** (`repositoryController.uploadFolder`): parse the manifest. If `manifest.length !== files.length` it returns 400 **and deletes the temp files** (they used to be left in `_uploads` forever). `sanitizeRelative()` drops `..`, `.` and leading slashes.
5. **uploadService**: `repositoryRepository.createUnderLimit` checks the 10-projects-per-visitor cap and creates the `PENDING` row **atomically**: a transaction takes `pg_advisory_xact_lock(hashtext(ownerToken))`, counts, then inserts, so two parallel uploads can't both slip under the cap. A rejected upload's temp files are deleted. Then `void processFolder(...)` (fire and forget) and **202 Accepted** right away.
6. **repositoryProcessor** (in-process background work):
   - `EXTRACTING`: ZIP via `extractZipFile` (zip-slip guard, 20k entry cap, only source/manifest entries written, **4 MB per entry and 512 MB per archive measured while streaming**, ignored dirs skipped), or folder via `fs.rename` of each temp file to `storage/<id>/<path>`. A `startsWith(projectDir + sep)` guard applies, and `copyFile` is the fallback when the rename crosses devices.
   - `SCANNING`: `scanRepository` unwraps single-folder wrappers (up to 8 levels), walks the tree skipping ignored dirs, and reads content, size and line count. File rows are bulk-inserted **with content** (capped at `STORED_CONTENT_LIMIT` = 64,000 chars).
   - `ANALYZING`: `analyzeAndPersist`. It parses every file, **reusing the content the scanner already read** (no second disk read), with tsconfig `paths` loaded first. Then **one transaction** (120 s timeout) does all the writes: clear old rows (edges first because of the FK) → `createMany` components, hooks and routes → read components back to build a `path::name → id` map → `createMany` edges → one raw SQL `UPDATE … FROM (SELECT targetId, COUNT(*) … GROUP BY targetId)` recomputes `importedByCount`. Either the whole analysis lands or none of it does.
   - `READY` with the counts. On any throw: `FAILED` plus the error message, and the temp files and directory are cleaned up. If the **process dies** mid-pipeline, the 10-minute sweep marks any project stuck in progress for 15+ minutes as `FAILED` with "Processing was interrupted… upload again".
7. **Client polls** `GET /:id/progress` every 1 s through TanStack Query's `refetchInterval`, which returns `false` once the status is READY or FAILED. The progress percentage comes from the status (5/25/50/80/100). `RepositoryLayout` invalidates the detail query when processing ends.

### 3b. Ask → streamed answer

1. **Composer** (`ExplainPage.tsx`): 3–4000 chars (this must match the server's zod schema), `@`-mention autocomplete, Enter sends, Esc stops, ⌘K starts a new chat. The thread id lives in `?c=<id>`.
2. **`askStream`** (`features/explain/api.ts`) uses `fetch` POST with `credentials:'include'`, then reads `res.body.getReader()`. A `TextDecoder` runs with `{stream:true}`, frames are split on `\n\n`, and the `event:` / `data:` lines are parsed out of each frame. It's hand-rolled because **EventSource can't send a POST body** and it auto-reconnects.
3. **Route:** `owned` (session check) → `askLimiter` (40/hour) → `conversationController.askStream`. It writes SSE headers, including `X-Accel-Buffering: no`. `res.on('close')` triggers `AbortController.abort()` (it listens on `res` rather than `req`, because `req` closes as soon as the body has been read).
4. **conversationService.ask:**
   - Loads the history if it's an existing thread (scoped by repositoryId, so you get a 404 if the thread isn't yours).
   - Loads up to 5 other thread **titles**.
   - **Creates the conversation row before the model call** and sends `event: conversation`, so stopping the first answer still leaves you in a saved thread. If the call fails with nothing to keep, the new thread is deleted (orphan prevention).
   - Mirrors the streamed text into `partial`, so a stopped answer is saved as `…\n\n_(stopped)_`.
5. **explanationService.explainRepository:**
   - `mightReferenceFiles` is a cheap pre-check. Only if it passes does `extractMentions` run (`@path` or paths inside a pasted stack trace).
   - The intent is `code` if anything was mentioned, otherwise `classifyQuestion` decides: `smalltalk | general | overview | code`. `event: start {intent}` goes out so the UI can say something true ("Typing…" vs "Reading the relevant files…").
   - **smalltalk:** the chat persona plus a few project facts, temperature 0.6, 400 tokens, no tools.
   - **general:** `answerFromKnowledge`, which gets the general persona, the project map and the tools, but no retrieved files.
   - **code:** the retrieval query is the **last 2 user questions plus this one** (no answers, because they would swamp the keyword scores). `buildExplanationContext` runs. If it finds 0 files, it falls back to `answerFromKnowledge` (this used to be a hard error). Otherwise `event: context {paths}`, then `buildMessages` and `runAnswerLoop`.
6. **runAnswerLoop:**
   - Call the model with 4 tools, temperature 0.4, `maxTokens` 4000.
   - Up to **3 tool rounds**. Each round runs all tool calls **in parallel** (`Promise.all`) with the read budget split evenly. Results are appended as `role:'tool'` messages with `toolCallId`. `event: files` goes out, then `event: reset`, which drops any preamble streamed before the tool call. On the last round a system message says "No further file reads are available… do not write out a tool call".
   - Up to **2 continuations** while `finishReason === 'length'`: "Continue from exactly where you stopped", joined with no space. If it's still cut off, `truncated: true` is set and the UI shows a **Continue** button.
   - `stripTextToolCalls` removes `<tool_call>` leaks. An empty answer returns 502 `AI_EMPTY_RESPONSE`.
7. **Persist** the user message and the assistant message (`contextPaths`, `openedPaths`, `model`, `truncated`), then touch the conversation. Then **fire-and-forget**: extend the rolling summary, generate follow-ups, and generate a title (skipped for smalltalk).
8. **`event: done`** carries the same payload as the JSON endpoint. The client writes both messages into the TanStack cache with `setQueryData` (no flicker), and **1.5 s later** re-invalidates the list and detail queries to pick up the AI title and follow-up chips.

---

## 4. Folder-by-folder, file-by-file

### Root
| File | What it is |
|---|---|
| `package.json` | name `decodr`, workspaces `packages/*`, `apps/*`. `dev` runs api + web in parallel via npm-run-all. `build` order: **types → api → web** (types must compile first). |
| `tsconfig.base.json` | ES2022, `strict`, **`noUncheckedIndexedAccess`** (why the code has `arr[i]!`), `noUnusedLocals/Parameters`, `isolatedModules`. `display: "Arcloom base config"` is left over from the rename. |
| `.env.example` | All config: DB URL, storage, AI provider/model/fallbacks/base URL (OpenRouter), reasoning flag, `VITE_*`. Documents the trade-off between gpt-4o-mini (~5 s, paid) and the free NVIDIA model (~50 s, 1M context, logs data). |
| `.github/workflows/keep-alive.yml` | cron `*/10 * * * *`, curls `https://decodr-api.onrender.com/api/ping`. It hits the DB-free ping so Neon can still autosuspend. GitHub cron is best-effort and auto-disables after 60 days of repo inactivity. |
| `.github/workflows/ci.yml` | On every push to main and every PR: `npm ci` → build types → `prisma generate` → typecheck → tests (API + web). No database needed; `DATABASE_URL` is a dummy that only passes env validation. |
| `.nvmrc` | 20 |
| `docs/phase-1..7.md` | The build log: Foundation → Upload → Parser/Graph → Graph UI → Dashboard → AI → Polish. They still say `@arcloom/types`. |

### `packages/types` (`@decodr/types`)
Compiled with `tsc` to `dist`. Uses the **`as const` object + derived union type** pattern instead of TS `enum` (`RepositoryStatus`, `ExportKind`, `MessageRole`, `AIProviderName`, `GraphNodeKind`, `GraphEdgeKind`). That gives runtime values and a string union type, works with `isolatedModules`, and the values match the Prisma enum strings, so rows map straight across.
- `common.ts`: `Id`, `ISODateString`, `ApiError {code,message,details?}`, `ApiResult<T>` (declared, not used yet).
- `repository.ts`: status, progress, `Repository` DTO (no `ownerToken` or `storagePath`, so they're never leaked).
- `analysis.ts`: File/Component/Hook/Route nodes, `ImportEdge` (declared, but file-import edges aren't persisted).
- `graph.ts`, `dashboard.ts` (recursive `FolderTreeNode`), `ai.ts` (`ExplanationContext`, `ExplainResponse`), `conversation.ts` (`Message` has **no `model` field**, removed on purpose), `api.ts` (every request/response DTO).

### `apps/api/src`
| Path | Key points |
|---|---|
| `server.ts` | connect DB → `startRetentionSweep()` → `listen(port, '0.0.0.0')` (so Render can route to it). Graceful SIGINT/SIGTERM: close server, disconnect Prisma, exit. |
| `app.ts` | `createApp()` doesn't bind a port, which keeps it testable. `trust proxy 1` (behind Render's proxy), helmet with cross-origin resource policy, CORS with `credentials:true`, JSON limit 1 MB, cookieParser, `attachOwner`, then `generalLimiter` (**after** `attachOwner` so it can key by session), routes, 404, error handler. |
| `config/env.ts` | zod-validated env, fails fast at boot. `port = PORT ?? API_PORT`. `modelChain` = primary + fallbacks, deduped. `allowedOrigins` comes from comma-separated `WEB_ORIGIN`. `primaryOrigin` exists because a comma list is an illegal header value (this was a real bug). |
| `database/prisma.ts` | Singleton PrismaClient cached on `globalThis` in dev, so tsx-watch hot reloads don't exhaust the pool. Exports `type Db = Prisma.TransactionClient`, which repository functions accept so the same query code runs inside or outside a transaction. |
| `types/express.d.ts` | Global augmentation: `req.ownerToken: string`. |
| `middleware/owner.ts` | Session cookie `decodr_sid`, regex `^[a-f0-9]{64}$`, minted with `randomBytes(32)`. httpOnly, 90 days. **SameSite=None; Secure** in prod while the API is on another site; set `COOKIE_DOMAIN` (e.g. `.imsrb.in`, with the API at `api.imsrb.in`) and it becomes a first-party **Lax** cookie that Safari/ITP won't block. `requireOwnedRepository` returns a **404, not a 403**, for someone else's repo, so ids can't be probed. |
| `middleware/rateLimit.ts` | Two layers per limiter (each export is an array of middleware). Layer 1 is keyed by **session token** (fair for shared IPs): general 120/min, upload 20/h, ask 40/h. Layer 2 is keyed by **IP** at 5× those numbers, closing the hole where a script that drops the cookie got a fresh token and a fresh bucket on every request. `ipKeyGenerator` normalizes IPv6 to /64. Throws `AppError 429`. |
| `middleware/upload.ts` | Two multer instances (ZIP single file / folder array). Both write to disk, not memory. `translateMulterError`. |
| `middleware/errorHandler.ts` | `asyncHandler` (Express 4 doesn't catch rejected promises). The error handler maps AppError → its status, ZodError → 422 with per-field details and the real reasons joined, anything else → 500 with the message hidden in prod. The envelope is always `{error:{code,message,details?}}`. |
| `middleware/notFound.ts` | Forwards a 404 `ROUTE_NOT_FOUND`. |
| `routes/index.ts` | `/ping` (no DB), `/health` (`SELECT 1`), `/repositories`, `/shared/:token` (the only route with no session). |
| `routes/repository.routes.ts` | Collection routes, then every `/:id` route behind `owned`. Conversations: list, ask, ask/stream, detail, rename, delete, feedback, rewind (DELETE message), share/unshare. |
| `controllers/*` | Thin. zod schemas: Ask (question 3–4000, raised from 500), Rename (1–120), Feedback (`1 \| -1 \| null`, note ≤500). `askStream` contains the SSE and abort logic. `sanitizeRelative`. |
| `services/uploadService.ts` | `createProject` → `repositoryRepository.createUnderLimit` (advisory-lock transaction, atomic 10-project cap). Deletes temp files of a rejected upload. `cleanName`, `void process…`, 202. |
| `services/repositoryProcessor.ts` | The pipeline described above. `STORED_CONTENT_LIMIT` 64k. `markFailed`. Cleanup on failure. |
| `services/analysisService.ts` | `analyzeAndPersist`: parse outside any transaction (CPU work), then **all writes in one `prisma.$transaction`** (120 s timeout). Idempotent (clears first). Bulk inserts. Reads back the id map. Raw SQL for in-degree. Takes the scanner's content map so files aren't read twice. |
| `services/repositoryService.ts` | list/get/progress map/remove (DB cascade, then storage dir)/entities. |
| `services/dashboardService.ts` | Totals from denormalized counts. Top 8 largest (line span) and top 8 most imported. Builds a **folder tree** from a Map of mutable nodes with counts rolled up to ancestors; folders sort before files. |
| `services/graphService.ts` | nodes and edges. No positions stored. |
| `services/fileService.ts` | listPaths, getContent. A null content means a legacy row and returns 404 `FILE_CONTENT_UNAVAILABLE`. |
| `services/retentionService.ts` | Sweep every **10 min** plus once at boot, timer `unref()`ed. In order: `failStaleProcessing` (in-progress with no stage change for 15 min → FAILED; 15 min rather than "at boot" so a zero-downtime deploy doesn't kill the old instance's work), `purgeExpiredRepositories` (older than **48 h**: DB row first, then the dir), `purgeOrphanedDirectories` (dirs with no row), `purgeStaleTempUploads` (files in `_uploads` older than 1 h). |
| `services/conversationService.ts` | list/get/rename/remove/rate/rewind/share/unshare/getShared/ask, all scoped by `(id, repositoryId)`. |
| `services/explanationService.ts` | The AI orchestration: intent routing, `runAnswerLoop`, tool dispatch, continuations, `stripTextToolCalls`. |
| `scanner/fileScanner.ts` | `detectProjectRoot` (unwraps wrappers), recursive walk, `countLines` (a trailing newline isn't counted), POSIX relative paths, sorted. |
| `parser/analyzer.ts` | Reads every `tsconfig*.json`/`jsconfig.json` first (`readAliasConfigs`), then parses `.ts/.tsx/.js/.jsx` with `Promise.all`, using the scanner's content map (disk only as a fallback). `knownFiles` = all scanned paths. |
| `parser/astUtils.ts` | `scriptKindFor` (.js → JSX, .ts → TS so `<T>x` parses), `lineAt`, `isComponentName` `/^[A-Z]/`, `isHookName` `/^use[A-Z0-9]/`, `containsJsx` (JSX **or** a `createElement` call), `collectRenderedTags` (PascalCase roots, `UI.Button` member tags, and `createElement(Header, …)` first arguments), `rootTagIdentifier` (shared with the route parser), `hasModifier`, `nameFromPath` (index.tsx → parent folder name). |
| `parser/fileParser.ts` | `ts.createSourceFile(..., setParentNodes=true, kind)`, **syntax only, no type checker**. Passes: import declarations, `lazy(() => import())`/`require()` bindings, re-exports (`export {X} from`, `export *`, `export * as NS`), local exports, declarations, routes. |
| `parser/moduleResolver.ts` | `resolveModule(from, spec, knownFiles, aliases)`. Relative: exact → `.js`→`.ts/.tsx` (NodeNext style) → +ext → `/index.ext`. Non-relative: nearest tsconfig's `paths` (exact pattern first, then longest prefix before `*`; targets from `baseUrl`, or from the declaring config's dir when there is none), then `baseUrl`, then the `@/`/`~/` → `src/` convention. `readAliasConfigs` parses configs with `ts.parseConfigFileTextToJson` (comments and trailing commas allowed) and follows relative `extends`. Bare npm names stay unresolved. |
| `parser/routeParser.ts` | `<Route>` (JSX) and route config objects, visited with the parent's path so **nested routes are stored as full URLs** (`/dash` + `settings` → `/dash/settings`; index routes take the parent URL). An object counts as a route only if it has `path`/`index` **and** a route-only key (`element`, `Component`, `children`, `loader`, …), which stopped nav configs from becoming routes. |
| `parser/types.ts` | `ParsedImport/Component/Hook/Route/File`. |
| `graph/graphBuilder.ts` | `buildComponentEdges`: same-file component first, otherwise the import binding. `resolveExport(path, name)` follows **re-exports** through barrels (named before `export *`, up to 6 hops, cycle-safe). `UI.Button` resolves through a namespace import or an `export * as UI`. A default import maps to the target's default export. Self-edges and duplicates are dropped. |
| `routing/fileRoutes.ts` | Next App Router (`page.*`), Expo Router (an `app/` containing `_layout.*`; skips `_*` and `+*`), Next Pages (`pages/` with `_app`/`_document`/index; skips `api/`). `(group)` is omitted, `[id]` becomes `:id`, `[...x]` becomes `*`. |
| `repositories/*` | All Prisma access. `createMany({skipDuplicates})`. Derived row types via `Prisma.XGetPayload`. Mutations use `updateMany/deleteMany` with `{id, repositoryId}`, so the count doubles as an authorization check. Mappers turn rows into DTOs. |
| `ai/types.ts` | `ChatMessage`, `ToolCall`, `ToolSpec`, `CompletionRequest` (with `signal`), `CompletionResult` (`finishReason`, `toolCalls`), `StreamHandlers {onDelta, onRestart}`, the `AIProvider` interface. |
| `ai/providerFactory.ts` | `switch` with an exhaustive `never` check. Only OpenAI is implemented; claude/gemini/ollama throw. Lazy singleton. |
| `ai/providers/OpenAIProvider.ts` | Model fallback chain, retry classification, stream reassembly of tool-call fragments by `index`, `reasoning` fallback for content, error mapping that **never leaks vendor names**. |
| `ai/contextBuilder.ts` | Keyword retrieval, graph neighbours, manifests for stack questions, budgets, and the call to `buildRepoMap`. |
| `ai/repoMap.ts` | The one-line-per-file project map (≤14,000 chars). |
| `ai/intent.ts` | Rule-based classifier: a cost optimisation, not a correctness mechanism. |
| `ai/mentions.ts` | `@path` and stack-trace path extraction, tolerant resolution (shortest suffix match). |
| `ai/promptBuilder.ts` | Three personas (code / chat / general) plus composable notes, history trimming, code stripping. |
| `ai/fileReader.ts` | The `read_files` tool. Synchronous claim before the first await (race fix). |
| `ai/codeTools.ts` | `search_code` (ILIKE), `find_usages` (graph, falling back to search), `get_component`. |
| `ai/summarizer.ts` | Rolling summary of turns that have aged out of the 12-turn window, done in batches of 4. |
| `ai/titler.ts` | Background 2–5 word title. Rejects titles that narrate ("The user said…"). |
| `ai/followUps.ts` | Background: up to 3 chips, each ending in `?`, ≤60 chars. |
| `utils/AppError.ts` | Status + stable code + safe message. Static factories. |
| `utils/archive.ts` | `extractZipFile`: unzipper.Open.file reads the central directory from disk. 20k entry cap. Writes only source/manifest entries outside ignored dirs. Checks declared sizes up front, then measures real output through a counting `Transform` (4 MB per entry, 512 MB per archive), because headers can lie. Zip-slip guard. Also `removeDir`, `removeFile`. |
| `utils/logger.ts` | Coloured in dev, JSON lines in prod. Built so it can be swapped for pino. |
| `utils/sourceFiles.ts` | Extensions, ignored dirs (including `storage` and `_uploads`, so Decodr analysing itself skips uploads), manifest list (never `.env`). |
| `prisma/schema.prisma` + 7 migrations | See section 5. |
| `vitest.config.ts` | Includes only `src/**/*.test.ts` (dist copies were making every test run twice). `src/__tests__/app.test.ts` tests the real Express app over HTTP with only the repository layer mocked. |

### `apps/web/src`
| Path | Key points |
|---|---|
| `main.tsx` | `StrictMode > ErrorBoundary > App`. |
| `app/App.tsx`, `app/router.tsx` | `QueryClientProvider > RouterProvider`. Routes: `/` landing, `/shared/:token` (outside the shell), then the AppShell with `/app`, `/upload` and `/repositories/:id` (index Dashboard, `graph` **lazy**, `explain`), plus `*`. |
| `services/apiClient.ts` | `fetch` wrapper: `credentials:'include'`, JSON or FormData (the browser sets the multipart boundary itself), 204 handling, throws `ApiClientError(status, apiError)`. |
| `services/queryClient.ts` | `staleTime` 30 s. **No retry on 4xx**, up to 2 retries otherwise. No refetch on window focus. |
| `stores/toastStore.ts`, `stores/uiStore.ts` | Zustand holds **only UI state**. The imperative `toast.success()` uses `getState()` so it works outside React. |
| `utils/cn.ts`, `motion.ts`, `time.ts` | `twMerge(clsx())`, framer variants, relative time. |
| `layouts/AppShell.tsx` | Sidebar, mobile drawer (uiStore), Topbar, animated `<Outlet>`, Toaster. |
| `layouts/RepositoryLayout.tsx` | Loads the repo, polls progress until settled, **redirects to /app on a 404**, gates on status (shows ProcessingView), passes the repo to children via `<Outlet context={repo}>` (`useOutletContext` in the pages), Suspense for the lazy graph. |
| `layouts/Sidebar.tsx` | Project nav plus the saved conversations for the active repo, with search, inline rename and delete. |
| `pages/*` | Landing (marketing, HeroGraph SVG, AnimeBackdrop), Repositories, Upload, Shared (read-only; citations are **plain text** so a share link never serves source), NotFound, and repository/Dashboard, Graph (tabs: "overview" = CodeMap, "graph" = GraphView), Explain. |
| `features/upload/*` | collectFiles, Dropzone (hand-built, keyboard accessible, scanning vs uploading states), `useUploadRepository`. |
| `features/repositories/*` | API, centralized **query key factory**, `useRepositoryProgress` (self-stopping poll), delete mutation with toasts, STATUS_META, ProcessingView, RepositoryCard (the delete button sits **outside** the `<Link>`, which fixed a bubbling bug). |
| `features/dashboard/*` | `useDashboard`, StatTile, RankedList, collapsible FolderTree. |
| `features/graph/*` | `layout.ts` (dagre TB layout, node 210×66), GraphView (search dims non-matches, click focuses the 1-hop neighbourhood, connected-only by default with a toggle to show isolated nodes, fullscreen, minimap, **nodes not draggable**), ComponentNode (`memo`), NodeDetailPanel, CodeMap (two single-hue bar charts, "Biggest" and "Most depended-on", with an "unused?" hint; clicking a bar goes to Explain with `?q=`). (A card-based `FeatureMap` and its palette helpers were removed as dead code; CodeMap replaced them.) |
| `features/explain/*` | `api.ts` (SSE client), `hooks.ts` (useAsk etc.), `useMentions`, `Markdown.tsx` (hand-built), `ChatMessages`, `FileViewer` (slide-in source panel, scrolls to the cited line, wrap and copy), `exportChat` (Markdown download). |
| `components/*` | Hand-built UI: Button, Card, Badge, Dialog/ConfirmDialog (portal, Esc, scroll lock), ProgressBar (`role=progressbar`), Skeleton, Spinner, Empty/Error states, Toaster, inline SVG icons, ErrorBoundary (a **class** component, because render errors can only be caught with `getDerivedStateFromError`/`componentDidCatch`). |
| `styles/index.css` | Tailwind v4 **CSS-first config** (`@theme` tokens in OKLCH, dark only), keyframes. |
| `vite.config.ts` | `@` alias, **manualChunks** (react-vendor, motion, query), and a dev proxy from `/api` to `:4000`. |
| `vercel.json` | SPA rewrite of everything to `/index.html`, so deep-link refreshes work. |

---

## 5. Data model

```
Repository 1─* File 1─* Component *─* (ComponentEdge) Component
           1─* Hook (fileId)       1─* Route (filePath string, no FK to File)
           1─* Conversation 1─* Message
```
- **Repository** is the aggregate root: `status` enum, `error`, `ownerToken` (indexed), `storagePath`, and **denormalized counts** (files, components, hooks, routes, lines) so lists and the dashboard need no aggregate queries.
- **File**: `path` unique per repo, `sizeBytes`, `lineCount`, `content` (nullable; null for legacy rows).
- **Component**: `exportKind`, `isExported`, `startLine/endLine`, `importedByCount` (in-degree, precomputed). Unique on `(repositoryId, name, fileId)`.
- **ComponentEdge**: `sourceId → targetId`, kind `RENDERS`, unique on `(source, target, kind)`.
- **Conversation**: `title`, `summary` + `summarizedCount` (rolling memory), `shareToken` (unique, nullable = private).
- **Message**: `role`, `content`, `contextPaths[]`, `openedPaths[]`, `model`, `feedback` (1/-1/null), `feedbackNote`, `followUps[]`, `truncated`.
- Every child has `onDelete: Cascade`, so deleting a repo removes everything. ids are `cuid()`. Arrays are Postgres `TEXT[]`.
- **Migration history:** init (30 Jun 2026) → conversations (4 Jul) → owner_token (7 Jul, `DEFAULT ''` so existing rows survive) → conversation_summary (20 Jul) → file_content (7 Sep, the move off ephemeral disk) → message_opened_paths (28 Sep) → chat_feedback_and_sharing (22 Oct, hand-written SQL). The `start` script runs `prisma migrate deploy` before boot.

---

## 6. Deep dives

### 6.1 The parser: why the TypeScript Compiler API, and how components are found
- `ts.createSourceFile` gives a full AST **per file with no Program and no type checker**. It's fast, needs no `tsconfig` or `node_modules`, and is **error-tolerant**: broken syntax still produces an AST, and a test checks it doesn't throw.
- Regex can't tell JSX inside a string or comment from real JSX, can't scope rendered tags to the component that renders them, and can't handle nesting. An AST can.
- **Component rules** (top-level statements only):
  - `function Foo()` PascalCase whose body contains JSX
  - `const Foo = () => <…/>` or a function expression
  - `const Foo = memo(() => …)` / `forwardRef(...)`: a call whose argument is a JSX-returning function
  - `class Foo extends (Pure)Component` or a class that contains JSX
  - Anonymous `export default () => …`, named from the file (`index.tsx` takes the parent folder's name)
  - Any of the above that renders through `React.createElement(...)` instead of JSX syntax
- **Hooks:** `use[A-Z0-9]…` function declarations or arrow assignments.
- **Imports it understands:** `import` declarations, `const X = lazy(() => import('./X'))` (code-split routes), `require('./x')`, and re-exports (`export { X } from`, `export { default as X } from`, `export *`, `export * as NS`).
- **Module resolution** mirrors the TypeScript compiler: relative paths with extension inference and `index.*`; `./x.js` meaning `./x.ts` (the NodeNext convention, which Decodr's own API uses); the project's tsconfig/jsconfig `paths` and `baseUrl` (read with the compiler's own JSON parser, following `extends`, nearest config wins in a monorepo); and the `@/` → `src/` convention when no config describes it.
- **Exports:** inline `export`/`export default`, `export {A, B as default}`, `export default Name`. (There was a bug where inline `export function Foo` was reported as not exported; it's fixed.)
- **Be precise in interviews:** the *structure* is parsed with the AST. Naming conventions (`/^[A-Z]/`, `/^use[A-Z0-9]/`) use tiny regexes. That's fine and honest.

### 6.2 Graph construction
For each component, `collectRenderedTags` walks only **that component's span**, so a file with several components still gets precise `A renders B` edges. Each tag is resolved: (1) a component in the same file, (2) otherwise the local import binding. A default import goes to the target file's default-export component (the alias doesn't matter), and a named import goes to the imported name (handles `{A as B}`).

When the import lands on a **barrel** (`components/index.ts` that only re-exports), `resolveExport` follows the re-export chain to the file that actually declares the component: explicit `export { X } from` first, then `export *`, up to 6 hops so a cycle can't loop. `<UI.Button>` is resolved by its member name through `import * as UI` or through a barrel's `export * as UI`. In-degree is then computed by one SQL statement.

Real effect: analysing Decodr's own web app, which imports almost everything through `@/…`, went from **44 edges to 142**.

### 6.3 Retrieval (`contextBuilder.ts`): "RAG without embeddings"
- **Keywords:** lowercase, split on non-alphanumerics, minimum length **2** (it was 3, which dropped "ai" and "db"), a stopword list.
- **Scoring a component** per keyword: exact name +12, name contains +7, file basename contains +5, a path segment equals +4, a segment contains +2. Then **+0.1 × min(in-degree, 10)** as a tie-breaker that favours central components.
- **Scoring a file:** segment equals +6, basename equals +8, basename contains +5, segment contains +2.
- **Four branches:** pinned (`@` mentions or trace paths, which bypass scoring, plus their graph neighbours) → keyword focus plus **one-hop neighbours in both directions** → routing intent (route files plus route targets) → the "guessed" hubs fallback, where the prompt is **told** the files are a guess.
- **Stack questions** ("which AI / db / auth…") front-load up to 4 manifests, **shallowest first** (the root `package.json` describes the project).
- **Budget:** 14 files, 12,000 chars each, 110,000 total (≈27k tokens). Content comes from the DB, with disk only as a legacy fallback.
- **Why no embeddings:** the import graph already *is* a relevance index for code ("the files directly related to X"). It's deterministic, debuggable, costs nothing and needs no extra infrastructure. Where it's weak (synonyms, "how do users log in" when the file is `session.ts`), the **project map** and `search_code` cover it. The upgrade path is hybrid search with pgvector in the same Postgres.

### 6.4 The project map (`repoMap.ts`)
One line per file: `src/pages/Dashboard.tsx (120L) [route /] :: Dashboard(3), useStats() -> src/api/client.ts`. That's about 1% of the tokens of the source. It's capped at 14k chars: entries are ranked by "declarations×100 + lines" so the least informative are dropped first, then sorted alphabetically for reading, with a footer "…and N more files omitted". It's what lets the model call `read_files` with exact paths.

### 6.5 Tools and the answer loop
| Tool | Backed by | Notes |
|---|---|---|
| `read_files {paths}` | `File.content` | ≤6 per call, 22,000 chars per file (larger than retrieval's cap so the model doesn't invent the rest), skips already-seen files, **claims paths synchronously before awaiting** so parallel calls can't double-read, releases the claim if the file is missing or over budget |
| `search_code {query}` | Prisma `contains, mode:'insensitive'` → ILIKE | 12 files × 4 matching lines, each `N: line` |
| `find_usages {name}` | ComponentEdge in and out | Falls back to search for non-components (it used to say "not used anywhere", confidently wrong) |
| `get_component {name}` | Component | `path:start-end · imported by N` |

Limits: **3 tool rounds**, a **90,000-char read budget** split evenly across parallel calls, **4000 answer tokens**, **2 continuations**. Worst case is 6 model calls per question, plus background calls for title, follow-ups and summary.

### 6.6 Provider abstraction and resilience (`OpenAIProvider.ts`)
- One class that speaks to OpenAI **or any OpenAI-compatible gateway** (production uses OpenRouter). Sends `HTTP-Referer` and `X-Title` attribution headers and an optional `reasoning:{enabled:true}` (an OpenRouter extension, so the body is cast).
- **Fallback chain:** `[AI_MODEL, ...AI_FALLBACK_MODELS]`. `worthRetryingElsewhere` retries on 429, 402, 404, ≥500, a 400 that mentions "model" (an unknown model name), and network errors **except AbortError**. It never retries 401/403 (a bad key fails everywhere). When it switches models mid-stream, `onRestart` makes the client clear the text already shown.
- **Streaming tool calls** arrive in fragments, so they're reassembled by `index`. A missing id is replaced with `call_${index}` (some providers never send ids, and requiring one silently dropped reads). Errors are **re-thrown raw** so `withFallback` can see the status (an early bug converted them and lost it).
- **Error messages:** `userFacingMessage` maps status to safe text. It never passes the upstream text through (that names the vendor and model). Details go to the logs, with `describeCause` unwrapping ENOTFOUND/ECONNRESET.
- **Adding Claude** means one class implementing `AIProvider` and one factory branch. The TS `never` check forces the switch to stay exhaustive.

### 6.7 Prompt design (`promptBuilder.ts`)
- **Three personas:** code (senior engineer walking a teammate through the code, with a GOOD and a BAD example, bans file-by-file "Purpose:/Key Functions:" catalogs, quote snippets faithfully, cite `path:line`, answer factual questions in the first line), chat (one-line greetings), general (answer from knowledge, may write fresh code).
- **Composable notes:** ERROR, MENTION, LENGTH (replaced the Quick/Detailed toggle: the question decides the depth), STYLE_MEMORY ("explain like an interview" holds across turns), GUESSED, MAP, FOLLOWUP, RELATED_THREADS.
- **Message order:** system persona → system summary (if any) → last **12** turns of history (with **code blocks stripped** from past answers, since those files are re-attached anyway, and answers clipped to 1200 chars) → one user message holding the notes, map, header, files and question. Retrieved context is rebuilt every turn and never piles up in the history.

### 6.8 Conversation memory
- Verbatim window: 12 turns. Older turns fold into a **rolling summary**: only once ≥4 turns are pending, incrementally ("Existing memo + fold these newer turns"), ≤150 words, run **in the background after the answer** (it used to be awaited, which added a model call in front of every question on a long thread).
- Retrieval query = last 2 user questions + the current one, so follow-ups like "why?" stay on topic.
- Related thread titles (≤5) give continuity cheaply, and the model is told it doesn't know what was said in them.

### 6.9 Streaming and Stop
- Server events: `conversation` → `start` → `context` → `delta`* → (`files`, `reset`)* → `done` | `error`.
- **Stop:** the client aborts its `fetch` → the server's `res` emits `close` → `controller.abort()` → the signal is passed to the OpenAI SDK request → **the upstream generation stops and stops being billed**. The partial text is saved as `_(stopped)_`, and the client invalidates the thread and switches to it if it was new (`recovered`).
- Errors after the headers are sent can't change the HTTP status, so they're sent as `event: error`. Errors before the stream starts come back as normal JSON.

### 6.10 Security model (no login)
| Threat | Defence |
|---|---|
| Seeing another visitor's code | 256-bit httpOnly session cookie. Every `/:id` route checks ownership and returns **404** on a mismatch. Conversation and message queries are scoped by `(id, repositoryId)` / `(id, conversationId)`. |
| Id probing | 404, not 403, so the response doesn't reveal whether an id exists. Ids are cuid. |
| Path traversal / zip-slip | `sanitizeRelative`, `path.resolve` + `startsWith(dir + sep)` checks on both intake paths. |
| Zip bombs / huge uploads | 20k entry cap; bytes measured while streaming (4 MB per entry, 512 MB per archive) because ZIP headers can lie; only source entries written; file count caps; an atomic 10-project cap; upload limit of 20/h. |
| Secrets leaking | Only `.env.example`/`.env.sample` are ever uploaded or stored. Error messages are sanitized. `model`, `ownerToken` and `storagePath` are never sent to the browser. |
| Runaway AI bill | ask limit of 40/h per session **and** 200/h per IP (so dropping the cookie doesn't reset the bucket), bounded tool rounds, read budget, continuations and tokens. Stop cancels upstream. |
| XSS from model output | The Markdown renderer produces React elements (no `dangerouslySetInnerHTML`), and links are allowed only for `https?://`. |
| Data retention | 48 h sweep, orphaned-directory sweep, and stranded temp-upload sweep (`_uploads` files older than 1 h): no code is kept, by construction. |
| Shared links | 192-bit base64url token, opt-in, revocable. Returns only the transcript and project name, and citations aren't clickable. |
| Headers | helmet; CORS allow-list with credentials. |
| Third-party cookie blocking | Optional `COOKIE_DOMAIN`: serve the API from the web app's own site and the cookie becomes first-party (SameSite=Lax). |

---

## 7. Numbers to remember
| Thing | Value |
|---|---|
| Session token | 32 bytes (256-bit), cookie `decodr_sid`, 90 days |
| Share token | 24 bytes base64url |
| Rate limits | per session: 120/min general · 20/h uploads · 40/h questions; per IP: 5× each |
| Projects per visitor | 10 |
| Retention | 48 h; sweep every 10 min · stuck "in progress" → FAILED after 15 min · temp uploads deleted after 1 h |
| ZIP limits | 20,000 entries · 4 MB per entry · 512 MB extracted per archive |
| Folder upload | server: 12,000 files × 4 MB · client: 8,000 files × 2 MB |
| Stored content per file | 64,000 chars |
| Retrieval budget | 14 files × 12,000 chars, 110,000 total (~27k tokens) |
| Project map | ≤14,000 chars, ≤4 imports per line |
| read_files | ≤6 paths/call, 22,000 chars/file, 90,000 total read budget |
| Loop | 3 tool rounds · 2 continuations · 4000 answer tokens · temp 0.4 (0.6 chat) |
| History | 12 turns verbatim, answers clipped to 1200 chars, summary in batches of 4, ≤150 words |
| Title | 2–5 words, ≤48 chars · fallback ≤70 chars |
| Follow-ups | ≤3, ≤60 chars, must end with "?" |
| Question length | 3–4000 chars |
| Progress poll | 1 s until READY/FAILED |
| Dashboard rankings | top 8 |
| Keep-alive | every 10 min to `/api/ping` |
| Tests | API: 12 files, 89 cases (incl. HTTP-level app tests) · web: 2 files, 6 cases · run in CI on every push/PR |
| Analysis write transaction | one `$transaction`, 120 s timeout |
| SSE heartbeat | `: ping` comment every 15 s |
| Title/follow-up refetch | at 1.5 s, 4 s, 9 s; stops once follow-ups arrive |

---

## 8. Design decisions and trade-offs (the "why" answers)
1. **Shared types package:** one source of truth. Rename a field and both apps fail to compile. *Trade-off:* compile-time only; responses aren't validated at runtime on the client.
2. **202 + polling instead of a job queue:** simple, no Redis, fast responses. *Trade-off:* a restart mid-analysis loses that job. It no longer hangs: the sweep fails projects with no progress for 15 min so the reader can re-upload. The real fix for scale is a job queue (pg-boss in the same Postgres, or BullMQ) with retries.
3. **Polling for progress, SSE for answers:** progress is coarse and short-lived, so polling is simplest. Answers need token-level push.
4. **Source in Postgres:** Render's free disk is ephemeral and wiped on redeploy. The DB copy makes explanations, the viewer and the tools survive restarts. *Trade-off:* DB size (capped at 64k per file, deleted after 48 h).
5. **No embeddings:** see 6.3.
6. **Rule-based intent:** an LLM classifier would double latency and cost. Misclassifying towards `code` is harmless because the prompt handles any message anyway.
7. **One context budget instead of Quick/Detailed modes:** users can't predict how much context they need. The model sets the depth (LENGTH_NOTE) and fetches more with tools.
8. **Background title, follow-ups and summary:** never delay the answer. The client re-reads the thread at 1.5 s, 4 s and 9 s, stopping as soon as the follow-ups are in.
9. **Creating the conversation before the model call:** the browser learns the thread id immediately, so stopping the first answer isn't lost. Empty threads are cleaned up on failure.
10. **TanStack Query for server state, Zustand only for UI state:** no duplicated server data, and caching, retries and invalidation come for free.
11. **Hand-built UI, Markdown and charts:** shows the craft, gives full control of the dark theme, smaller bundle, no lock-in. *Trade-off:* more code to maintain, and the Markdown parser is a subset.
12. **Client-side layout (dagre):** layout is a view concern, so the backend graph stays pure data. *Trade-off:* thousands of nodes lay out on the main thread (fix: a web worker, or ELK).
13. **Lazy graph route + manual vendor chunks:** React Flow and dagre load only when needed, and vendor chunks cache across deploys.
14. **Rate limits keyed by session first, IP second:** session keys are fair for shared IPs; a 5× per-IP ceiling stops a script that never sends the cookie back.
15. **404 instead of 403 for foreign ids:** doesn't confirm that an id exists.

---

## 9. Weaknesses: what was fixed, and what is left

A review of the code turned up 20 weaknesses. They were fixed in one pass (October 2026), each with a test where it can be tested. This list is good interview material: it shows you can find and close your own gaps.

### Fixed
| # | Weakness | Fix | Where |
|---|---|---|---|
| 1 | Path aliases (`@/…`) not resolved, so no edges | Reads every tsconfig/jsconfig (comments allowed, `extends` followed), applies `paths`/`baseUrl`, nearest config wins; `@/`→`src/` fallback | `parser/moduleResolver.ts`, `analyzer.ts`; tsconfig files now uploaded |
| 2 | `./x.js` meaning `./x.ts` (NodeNext) not resolved | `.js`→`.ts/.tsx`, `.jsx`→`.tsx` | `moduleResolver.ts` |
| 3 | Barrels, namespace imports, `lazy`, `require` not followed | Re-exports parsed and followed (≤6 hops); `UI.Button` member tags; `lazy(() => import())` and `require` bindings | `fileParser.ts`, `graphBuilder.ts`, `astUtils.ts` |
| 4 | `createElement` components missed | Counted as rendering, and `createElement(X)` counts as rendering X | `astUtils.ts` |
| 5 | Any `{ path }` object was a route; nested paths not joined | Needs a route-only key; nested routes stored as full URLs; index routes take the parent URL | `routeParser.ts` |
| 6 | Analysis writes not transactional | All writes in one `$transaction`; parsing kept outside it | `analysisService.ts`, repositories take a `Db` client |
| 7 | Restart mid-pipeline left projects spinning | Sweep marks in-progress projects idle for 15 min as FAILED with a reason | `retentionService.failStaleProcessing`, `repositoryRepository.failStale` |
| 8 | `_uploads` temp files never cleaned (~300 locally) | Rejected uploads delete their temp files; sweep deletes temp files older than 1 h | `uploadService`, `repositoryController`, `retentionService` |
| 9 | ZIP bomb guard counted entries only | Declared sizes checked, real bytes measured while streaming (4 MB/entry, 512 MB/archive); non-source entries never written | `utils/archive.ts` |
| 10 | Dropping the cookie reset rate limits | Second, per-IP layer at 5× the per-session limits | `middleware/rateLimit.ts` |
| 11 | Cross-site cookie can be blocked | `COOKIE_DOMAIN` option makes it first-party (Lax) once the API is on the same site | `middleware/owner.ts`, `config/env.ts` (needs a DNS change to take effect) |
| 12 | Project cap race | Count + insert in one transaction under a per-owner advisory lock | `repositoryRepository.createUnderLimit` |
| 13 | `search_code` scanned every row | `pg_trgm` GIN index on `File.content` | migration `20261029120000_file_content_trigram`, `schema.prisma` |
| 14 | No SSE heartbeat | `: ping` comment every 15 s while streaming | `conversationController.askStream` |
| 15 | Markdown re-parsed the whole answer per token | Finished blocks (before the last blank line outside a fence) render through a memoised component; only the tail is re-parsed | `Markdown.tsx` (`splitSettled`) |
| 16 | Every file read twice | Scanner content passed to the parser | `repositoryProcessor` → `analysisService` → `analyzer` |
| 17 | One 1.5 s refetch for title/follow-ups | Re-reads at 1.5/4/9 s, stopping once follow-ups arrive | `features/explain/hooks.ts` |
| 18 | No HTTP tests, no web tests, no CI | HTTP-level app tests, web vitest suite, GitHub Actions CI | `src/__tests__/app.test.ts`, `apps/web/vitest.config.ts`, `.github/workflows/ci.yml` |
| 19 | Dead `FeatureMap.tsx` | Removed with its palette helpers | — |
| 20 | Duplicated `rootTagIdentifier` | One export in `astUtils.ts` | — |

Also cleaned up: the stale "Try Quick mode" error text, the processor's "22k" comment, the README's Quick/Detailed and Feature-map wording, and the services that reached into Prisma directly (`retentionService` now goes through the repository).

### Still open (say these honestly)
1. **In-process jobs.** Stuck jobs now fail cleanly, but a restart still loses the work. The next step is a queue with retries (pg-boss keeps it in the same Postgres).
2. **Top-level declarations only.** Components defined inside objects or factories aren't found, and a PascalCase function that returns JSX but isn't used as a component is a false positive. It's a heuristic, documented as one.
3. **`COOKIE_DOMAIN` needs infrastructure.** The code is ready, but the API has to move to `api.imsrb.in` (a custom domain on Render plus a DNS record) before the cookie becomes first-party.
4. **Rate limits are in memory.** Each instance counts separately, and a restart resets them. Running several instances would need a shared store (Redis, or Postgres).
5. **No captcha.** The per-IP ceiling bounds abuse but doesn't stop a distributed bot. Proof-of-work or a captcha on ask/upload is the next layer.
6. **Retrieval is keyword-based.** Synonyms ("how do users log in" vs `session.ts`) depend on the map and `search_code`. Hybrid search with pgvector is the upgrade.
7. **No end-to-end browser tests** (Playwright for upload → ask) and no tests against a real database.

---

## 10. How the project evolved (good storytelling material)
- **Phases 1–7** (Jun–Jul 2026): foundation → ZIP upload and scan → parser and graph → React Flow UI → dashboard → AI explanations → polish (toasts, dialogs, delete, chunk splitting). Later-phase endpoints first returned `501` so the API contract was visible from day one.
- **The AI then evolved a lot**, and most of the comments in the code describe the bug that drove each change:
  - Single-turn Q&A → persistent conversations with history → rolling summary.
  - **8 files × 6k chars** → Quick (8) / Detailed (34) modes → **one budget (14 × 12k) plus tools**. The modes were removed because users can't judge how much context they need.
  - Added the project map, `read_files`, then `search_code`, `find_usages` and `get_component`.
  - Added intent routing ("hi" used to get a code walkthrough of a file containing "hi").
  - `@` mentions and stack-trace pinning (asking about `WhereIsEveryoneMap` returned `ProfileImage`).
  - Moved source into Postgres (Render's disk wiped uploads on redeploy).
  - Model fallback chain for free-tier rate limits; vendor names removed from user-facing errors.
  - Streaming, Stop that really cancels upstream, saving partial answers, a Continue button for truncated answers.
  - Background titles, follow-up chips, feedback thumbs, edit-as-rewind, share links, Markdown export, the file viewer for citations.
- **Upload evolved** from ZIP only (multer memoryStorage) → disk streaming → direct folder upload with client-side filtering → the File System Access API for big folders.
- **Hardening pass (Oct 2026):** the 20 fixes in section 9: alias and barrel-aware resolution, nested routes, transactional analysis, stale-job recovery, temp-file and ZIP-byte limits, layered rate limits, an atomic project cap, a trigram index, an SSE heartbeat, faster streaming Markdown, HTTP and web tests, and CI.
- **Renamed Arcloom → Decodr.** Leftovers: the folder name, `docs/*` (`@arcloom/types`), `tsconfig.base.json` display string, the comment in `schema.prisma`, and the loom-themed logomark comment in `icons.tsx`.

---

## 11. Phase docs vs today's code
The README is now current. The `docs/phase-*.md` files are the historical build log (each now says so at the top), so they describe what shipped at the time:

| Phase doc says | Today |
|---|---|
| phase-1: "No auth; every repository is global" | Session isolation (owner_token migration, 7 Jul). |
| phase-2: multer **memoryStorage**, ZIP ≤ 50 MB | **diskStorage**; default 50 MB in code, 500 MB in `.env.example`. Folder upload added. |
| phase-3: "path aliases out of scope", relative imports only | Aliases, `.js`→`.ts`, barrels, namespaces, `lazy`, `require` all resolved. |
| phase-4: users can "drag nodes" | `nodesDraggable={false}`. |
| phase-5: "flat folder list, not a tree" | A **nested tree**. |
| phase-6: "≤ 8 files, ≤ 6000 chars each", "single-turn" | 14 files × 12k, multi-turn with summary and tools. |
| README AI line: "OpenAI gpt-4o-mini" | Configurable; `.env.example` defaults to an NVIDIA free model via OpenRouter, falling back to gpt-4o-mini. |

---

## 12. Interview question bank

**Product and overview**
1. *What problem does it solve?* Onboarding onto an unfamiliar React codebase is slow. Decodr gives you the structure (graph, dashboard, size and dependency charts) and a chat grounded in the real files.
2. *Who's it for?* Developers joining a project, reviewers, interview candidates reading take-home repos, and people who've inherited a codebase.
3. *Why only React + TS?* Focus. The parser understands JSX and component conventions. It sits behind its own module, so adding other languages means a new parser.
4. *What's the hardest part you built?* The answer loop: retrieval that guesses well, tools as the escape hatch, parallel tool calls without double-reading (the synchronous claim), resuming at the token limit, and streaming that resets correctly across tool rounds and model fallbacks.

**Architecture**

5. *Walk me through the backend layers.* Controllers parse and validate with zod and shape typed DTOs. Services hold the use cases. Repositories hold all Prisma access. Parser, graph and AI are independent modules. This made the AI code unit-testable by mocking the repository modules with `vi.mock`.
6. *Why a monorepo?* The shared `@decodr/types` package, one install, one `.env`, and build ordering.
7. *How do frontend and backend stay in sync?* Both import DTO types from `@decodr/types`. Controllers annotate `const body: XResponse`, and the client calls `apiClient.get<XResponse>`.
8. *Why ESM `.js` extensions in TS imports?* The API compiles with `module: NodeNext`, and Node's ESM resolver requires explicit file extensions; TS maps `.js` to the `.ts` source.
9. *Why `createApp()` separate from `listen`?* Testability (supertest could mount it) and a clean boot sequence.
10. *What does `trust proxy 1` do?* It trusts one hop of `X-Forwarded-For`, so `req.ip` is the client's IP behind Render's proxy. That matters for the IP fallback in rate limiting and for secure cookies.

**Parser and graph**

11. *How do you detect a component?* PascalCase plus contains JSX (function, arrow, HOC call, class), and anonymous default exports named from the file. See 6.1.
12. *Why no type checker?* It's not needed for structure. A Program needs tsconfig and node_modules and is much slower. A syntax-only parse works on any uploaded folder.
13. *How are imports resolved?* Like the TypeScript compiler, but syntax-only: relative paths with extension inference and `index.*`, `.js` specifiers mapped to `.ts` sources, tsconfig/jsconfig `paths` and `baseUrl` (nearest config, `extends` followed), and an `@/`→`src/` fallback. Then the graph follows barrel re-exports to the declaring file. On Decodr's own web app that took the graph from 44 to 142 edges.
14. *How do you build edges?* Per-component rendered tags, resolved same-file first and then through import bindings, with default vs named handled. See 6.2.
15. *How is `importedByCount` computed?* One raw SQL `UPDATE … FROM (SELECT targetId, COUNT(*) GROUP BY targetId)`, parameterized through Prisma's tagged template.
16. *What about Next.js / Expo routes?* `fileRoutes.ts` derives them from paths with framework markers, mapping `(group)`, `[id]` and `[...rest]`.
17. *Complexity?* Parsing is linear in source size. Edge building is O(components × tags) with Map lookups. The dashboard sorts are O(n log n).

**AI**

18. *Why not send the whole repo?* A mid-size project is 150k–600k tokens: over the context window, slow and expensive on every message. And more context makes answers worse, not better.
19. *How do you choose files?* See 6.3: keyword scoring, a focus component, graph neighbours, manifests, pins, fallbacks, budgets.
20. *What if retrieval guesses wrong?* The prompt says the files may be irrelevant. The map shows everything that exists. The model can `search_code` or `read_files`. `@` mentions let the user pin files. The guessed flag tells the model when nothing matched.
21. *Why no vector DB?* See 6.3. The upgrade path is pgvector.
22. *How do tool calls work?* OpenAI function calling with JSON Schema parameters. The assistant message's `tool_calls` are echoed back, and each result goes in a `role:'tool'` message with a matching `tool_call_id`. While streaming, the fragments are reassembled by index.
23. *How do you bound cost?* Rate limit, max rounds, read budget, answer tokens, continuations, intent shortcuts (a greeting costs a few hundred tokens), code stripped from history, a summary instead of replaying everything, and Stop cancels upstream.
24. *How do you handle provider outages?* The model fallback chain with retry classification (6.6); `onRestart` clears partly streamed text.
25. *How do you stop hallucinated code?* The prompt says to copy snippets faithfully, never describe files that weren't opened, and say "can't tell from these files". Citations are clickable so users can verify them. Tool calls the model wrote as prose are stripped out.
26. *How does conversation memory work?* See 6.8.
27. *Why is intent rule-based?* See section 8, item 6.
28. *What's `finishReason: 'length'`?* The token cap was hit, so we ask the model to continue (up to 2 times), then flag the answer as truncated.
29. *How would you add Claude?* Implement `AIProvider` with the Anthropic SDK (map tool use and streaming events) and add a factory branch. Business logic doesn't change.
30. *How do you evaluate answer quality?* Feedback thumbs (with an optional note) stored per message. Next steps: a golden question set per sample repo, and checking which files were cited against the expected ones.

**Streaming**

31. *Why SSE and not WebSockets?* It's one-way server → client, plain HTTP, works through proxies and needs no connection management. *Why not EventSource?* It can't POST a body and it auto-reconnects.
32. *How does Stop work end to end?* See 6.9.
33. *What if a frame is split across chunks?* We buffer and only parse once we see `\n\n`. `TextDecoder` with `stream:true` handles multi-byte characters split across chunks.

**Data and DB**

34. *Why denormalized counts?* O(1) reads for lists and the dashboard; they're written once per analysis.
35. *Why store file content in the DB?* Ephemeral disk. See section 8, item 4.
36. *How do you keep re-analysis idempotent?* Delete the repo's prior rows (edges first), then bulk insert; `skipDuplicates` relies on the unique constraints.
37. *What does cascade delete give you?* Deleting a repo, by the user or the retention sweep, removes all child data in one statement.
38. *Why cuid?* Collision-resistant, URL-safe, roughly time-ordered, and not sequential (harder to guess than auto-increment).

**Security**

39. *How is there privacy without login?* See 6.10.
40. *Why SameSite=None?* The web (Vercel) and API (Render) are different sites, and cross-site cookies on credentialed fetch require `None; Secure`.
41. *How do you prevent zip-slip?* Resolve every entry against the destination directory and reject anything outside it.
42. *What stops someone from reading another user's conversation by guessing ids?* Every query is scoped by repositoryId, which itself is gated by ownerToken. A mismatch returns a 404.
43. *What's the weakest part of your security?* There's no login, so a distributed bot can still spread requests across many IPs. Per-session plus per-IP limits bound it, and a captcha or proof-of-work is the next layer. Rate-limit counters are also per instance and in memory. And until the API moves to the same site, the cookie is cross-site; the `COOKIE_DOMAIN` switch is built, but it needs a DNS change.

**Frontend**

44. *State management?* TanStack Query for server state (with a key factory, invalidation, optimistic updates for ratings, and `setQueryData` after asking). Zustand for UI-only state (toasts, mobile nav).
45. *How does progress polling stop?* `refetchInterval` is a function returning `false` once the status is terminal.
46. *How do you upload huge folders fast?* The File System Access API lets us skip ignored folders without enumerating them. There's a fallback for other browsers. See 3a.
47. *Why `useOutletContext`?* `RepositoryLayout` loads and gates the repo once, and the child routes receive it without refetching or prop drilling.
48. *Performance work?* Lazy graph route, manual vendor chunks, `memo` on the custom node, `useMemo` for layout and adjacency, mention suggestions capped at 50, the scan yields once before blocking, passive scroll listeners, `staleTime: Infinity` for file lists.
49. *Accessibility?* Keyboard-operable dropzone (role=button, Enter/Space), `role=progressbar`, `role=dialog` + Esc, listbox/option ARIA for mentions, focus-visible on hover-only actions, `aria-label`s on icon buttons.
50. *Why is ErrorBoundary a class?* Only class components can implement `getDerivedStateFromError`/`componentDidCatch`.
51. *How is model Markdown kept safe?* See 6.10 (React elements, an allow-list for links).
52. *How does edit work without losing data?* Clicking Edit only stores the message id. On send, rewind first (delete that message and everything after it), *then* ask, in sequence, to avoid a race where the rewind deletes the new answer.

**Deployment / ops**

53. *How is it deployed?* Vercel builds `apps/web` with an SPA rewrite. Render runs `prisma migrate deploy && node dist/server.js`. Neon serves Postgres. Env vars set CORS origins, the API base URL, AI keys and models.
54. *Cold starts?* The free Render instance sleeps. A GitHub Action pings `/api/ping` (no DB) every 10 minutes; an UptimeRobot-style monitor would be more reliable.
55. *Logging?* JSON lines in prod. AI failures log the status, model, base URL and the underlying cause.
56. *How would you scale it?* Move processing to a queue with workers (pg-boss in the same Postgres), put source in object storage (S3/R2) with a DB pointer, add pgvector for hybrid retrieval (the trigram index is already there), cache the map per repo, move rate-limit counters to a shared store so several API instances agree, and lay out big graphs in a web worker.

**Testing**

57. *What's tested?* 95 tests. API: retrieval, error sanitizing, fallback classification, the file reader (including concurrency), intent, mentions, the repo map, tool-call stripping, the titler, the parser and resolver (aliases, `.js`→`.ts`, barrels, namespaces, lazy, routes), plus HTTP-level tests of the real Express app (session cookie, error envelope, 404-not-403 isolation, validation, per-session rate limiting). Web: the streaming Markdown splitter and the upload filter. CI runs typecheck and tests on every push and PR.
58. *How do you test without a DB?* `vi.mock` on the repository modules, then `await import()` of the module under test after the mocks are registered (ESM).
59. *What would you add?* A Postgres test container so repository queries (the advisory lock, the trigram search, the transaction) run against a real database, Playwright for the upload → ask flow, and component tests for the chat page.

**Behavioural / reflection**

60. *A bug you're proud of fixing?* The parallel `read_files` race. Two tool calls in one round both saw a file as unread, so it was sent twice and the budget charged twice. The fix was to claim the paths synchronously before the first `await` and release the claim on a miss, with a test that runs both calls concurrently.
61. *Another?* Stop used to only mute the output while the model kept generating (and billing). Now the abort travels from the client fetch → `res.on('close')` → AbortController → the SDK request. I listen on `res` rather than `req`, because `req` closes as soon as the body has been read.
62. *Something you'd do differently?* Build the job queue and the analysis transaction in from the start, write the resolver to match the TypeScript compiler from day one rather than relative-only, and add HTTP tests alongside each route. Most of the hardening pass was closing gaps that are cheaper never to open.

---

## 13. Sixty-second whiteboard version
"The browser filters a folder down to source files and uploads them with a path manifest. The API returns 202 and processes them in the background: extract → scan → parse each file with the TypeScript AST into components, hooks, imports and routes → build RENDERS edges → store everything, including the source text, in Postgres. The UI polls progress every second. For questions, a rule-based classifier routes small talk and general questions cheaply. Code questions get keyword-plus-graph retrieval of up to 14 files, a one-line-per-file project map, and four tools the model can call for up to three rounds. The answer streams over SSE, can be stopped with real upstream cancellation, resumes automatically at the token limit, and is saved with its sources. Titles, follow-ups and the conversation summary are generated in the background. Visitors are isolated by a 256-bit cookie, and their uploads are deleted after 48 hours."
