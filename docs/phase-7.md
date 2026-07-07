# Phase 7 — Polish

UX polish, animations, responsiveness, performance, and cleanup.

## What was added

### Feedback & interactions
- **Hand-built toast system** — a Zustand queue (`stores/toastStore.ts`) with an
  imperative `toast.success/error/info` helper and an animated `Toaster` mounted
  once in the app shell. Auto-dismiss, dismiss button, variant accent bar.
- **Hand-built Dialog / ConfirmDialog** — portal, backdrop, Escape-to-close,
  scroll-lock, spring-in animation. No dialog library.
- **Delete repository** — `DELETE /api/repositories/:id` cascades the row and
  reclaims its extracted storage. In the UI: a hover-revealed trash action on
  each repository card → confirmation dialog → toast, with the list refreshed.
- **Upload feedback** — success toast when a ZIP is accepted.

### Motion
- Reusable `staggerContainer` / `fadeUpItem` variants (`utils/motion.ts`).
- Staggered entrance on the repositories grid and the dashboard
  (tiles → lists → folders), on top of the existing page transitions.

### Responsive
- Repository tabs scroll horizontally on narrow screens (`overflow-x-auto`).
- Verified the grids, sticky Explain composer, and graph canvas hold up on
  mobile widths; the sidebar already collapses to an animated drawer.

### Performance
- **Vendor chunk splitting** (`vite.config.ts`): `react-vendor`, `motion`, and
  `query` are separated from app code, and the graph view stays lazy. The
  500 KB bundle warning is gone; heavy libs are cached independently.

## Key design decisions

| Decision | Rationale |
| --- | --- |
| **Everything hand-built** | Toasts, dialogs, and animations use Zustand + Framer Motion + Tailwind only — consistent with the no-component-library rule, and shows the craft. |
| **Imperative `toast` helper** | Lets mutation callbacks fire toasts without prop-drilling a context. |
| **Delete reclaims storage** | A real tool shouldn't leak extracted repos on disk; the service removes `storage/{id}` alongside the cascaded row. |
| **Manual vendor chunks** | Better long-term caching than one large bundle; app updates don't invalidate the React/motion chunks. |

## Trade-offs

- **Toasts aren't queued/collapsed** beyond auto-dismiss; fine for this app's
  volume.
- **Confirm dialog is generic** rather than per-action bespoke — reused for
  delete, ready for future destructive actions.

## Verification

- Full `typecheck` (types + api + web) and both builds pass; no bundle warning.
- Delete verified end-to-end: `204`, row gone, `storage/{id}` removed, `404` on
  a missing id.
- Chunks split as intended (react-vendor / motion / query / lazy GraphPage).
