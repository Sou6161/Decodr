# Phase 2 — Upload, Extraction & Scanning

ZIP upload → extraction → repository scan, with live progress.

## Flow

```
POST /api/repositories (multipart "file")
  → validate ZIP (type + size)          [middleware/upload.ts]
  → create Repository (PENDING)          [services/uploadService.ts]
  → respond 202 with the repository
  → process in background:               [services/repositoryProcessor.ts]
       EXTRACTING  unzip (zip-slip + bomb safe)   [utils/archive.ts]
       SCANNING    detect root, walk source files [scanner/fileScanner.ts]
       ANALYZING   (Phase 3 hook — parser)
       READY       persist File rows + counts
  → client polls GET /api/repositories/:id/progress until terminal
```

## Key design decisions

| Decision | Rationale |
| --- | --- |
| **Background processing, 202 response** | Upload returns immediately; the UI polls `/progress`. Keeps the request fast and models a real async pipeline without a job queue yet. |
| **In-memory upload (multer memoryStorage)** | ZIPs are ≤ 50 MB; avoids temp-file lifecycle. The buffer is handed straight to the extractor. |
| **Processor owns its failures** | `processRepository` catches everything and records `FAILED` + an error message, so a repo can never get stuck mid-pipeline. |
| **Project-root unwrapping** | ZIPs usually wrap the project in one folder; the scanner unwraps nested single-folder layers so paths read `src/App.tsx`, not `my-app/src/App.tsx`. |
| **Ignore lists applied twice** | Junk dirs (`node_modules`, `.git`, `dist`, …) are skipped both during extraction (don't waste disk) and scanning (don't waste time). |
| **Reuse the existing status/progress contract** | No new lifecycle concepts — Phase 1's `RepositoryStatus` + `RepositoryProgress` already modeled this. |

## Security hardening (extraction)

- **Zip-slip:** every entry path is resolved and must stay within the target dir, else the upload is rejected.
- **Zip bombs:** entry count is capped (20k); empty archives are rejected.
- **No-source guard:** a ZIP with zero React/TS source files fails with a clear message rather than producing an empty "ready" repo.

## Frontend

- **`Dropzone`** — hand-built drag-and-drop + click-to-browse, client-side type/size validation, uploading state. No dropzone library.
- **Upload flow** — `useUploadRepository` (TanStack mutation) → on success navigates to the repository, which shows…
- **`ProcessingView`** — animated progress bar + per-stage checklist, driven by `useRepositoryProgress`, which **polls every second and stops at a terminal status**. On completion it invalidates the summary query so the real counts appear.

## Trade-offs

- **In-process background work:** if the server restarts mid-processing, an in-flight repo is left non-terminal. Acceptable for a single-node MVP; a job queue (BullMQ/Redis) is the documented next step.
- **Whole file read for line counts:** fine for source files; a streaming counter would matter only for very large repos.
- **Coarse, status-derived progress percentages:** believable UX without per-file counters.

## Possible improvements

- Persist an upload record / original filename and checksum for idempotency.
- Stream extraction progress (bytes/entries) for a true percentage.
- Add a `DELETE /api/repositories/:id` to remove a repo and reclaim disk.
- Validate "is a React project" via `package.json` dependencies, not just file presence.

## Verification

- `npm run typecheck` (api + web) and the web production build pass.
- Happy path: uploaded a sample React+TS ZIP → `SCANNING → READY`, `fileCount: 4`
  (`node_modules` and `package.json` correctly excluded; project root unwrapped).
- Failure path: a ZIP with no source files → `FAILED` with a clear message.
- Rejection: a non-ZIP upload → `400`.
- Test data truncated; the app starts with an empty repository list.
