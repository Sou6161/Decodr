# Phase 5 — Repository Dashboard

Aggregate insights for an analyzed repository.

## Backend

`GET /api/repositories/:id/dashboard` → `DashboardStats`
(`services/dashboardService.ts`):

- **Totals** — files, components, hooks, routes, lines. Read from the
  denormalized counts on the `Repository` row (O(1), no aggregation).
- **Largest components** — top 8 by line span (`endLine − startLine + 1`).
- **Most imported components** — top 8 by `importedByCount` (graph in-degree).
- **Folder structure** — file + component counts grouped by each file's
  immediate directory, sorted by file count.

## Frontend

New **Dashboard** tab, now the repository's index view (Dashboard · Graph):

- **Stat tiles** — five headline metrics with compact formatting for large
  numbers.
- **Ranked lists** — largest / most-imported components with proportional
  magnitude bars and file paths.
- **Folder overview** — scrollable directory breakdown with file-count bars.

All widgets are hand-built with the existing design tokens — no chart library.
The bars are single-hue magnitude indicators (not multi-series), so they use the
established primary/accent colors directly.

## Key design decisions

| Decision | Rationale |
| --- | --- |
| **Totals from denormalized counts** | The counts were already maintained during analysis; the dashboard reads them directly instead of re-aggregating. |
| **Rankings computed in the service** | Simple in-memory sorts over the component rows — clearer and more portable than SQL window functions for these sizes. |
| **Dashboard replaces a separate "overview"** | Avoids two near-identical stat views; the dashboard *is* the repository's landing view. |
| **Folder grouping by immediate directory** | A flat, readable breakdown that conveys structure without rendering a full tree (a tree is a clean future enhancement). |
| **Single-hue magnitude bars** | These encode one quantity each, so they don't need a categorical palette; they stay on-brand and accessible in dark mode. |

## Trade-offs

- **Flat folder list, not a tree:** simpler and scannable; a nested tree with
  roll-up totals is the natural next step.
- **Fixed top-8 rankings:** enough for an overview; could become "show more".
- **In-memory sorting:** trivial at repo scale; very large repos could push
  ranking into SQL.

## Verification

- `typecheck` (api + web) and web build pass.
- Dashboard endpoint on the sample repo returns correct totals
  (6 files · 5 components · 1 hook · 2 routes · 27 lines), largest components by
  line span, most-imported by in-degree, and the expected folder breakdown
  (`src/components` 2f/2c, `src/pages` 2f/2c, `src` 1f/1c, `src/hooks` 1f/0c).
- Test data cleaned; app starts empty.
