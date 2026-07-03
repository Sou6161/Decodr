# Phase 6 — Context-Aware AI Explanations

The finale: ask how a feature works and get a focused, senior-engineer-style
explanation generated from **only** the relevant files — never the whole repo.

## Flow

```
POST /api/repositories/:id/explain  { question }
  → buildExplanationContext(id, question)      [ai/contextBuilder.ts]
       locate focus  → component name match / routing intent / hub fallback
       gather files  → focus file + graph neighbors (renders / rendered-by)
       truncate      → ≤ 8 files, ≤ 6000 chars each
  → buildMessages(context, question)            [ai/promptBuilder.ts]
       senior-engineer persona + focused files + question
  → provider.complete(...)                      [ai/providerFactory → OpenAIProvider]
  → { answer, provider, model, contextPaths }
```

## How the focused context is chosen

1. **Named component** — if the question mentions a component (whole-word match,
   ties broken by graph in-degree), that's the focus. Context = its file + the
   components it renders + the components that render it (graph neighbors).
2. **Routing intent** — questions about routes/navigation pull the route-declaring
   files plus the route target components' files.
3. **General fallback** — architecture questions lead with the most-imported
   "hub" components' files.

Everything is capped (≤ 8 files, each truncated) so the model receives a small,
relevant slice. **The whole repository is never sent.**

## The "senior engineer, not an AI" voice

The persona is enforced in the system prompt (`ai/promptBuilder.ts`): lead with
the point, name real files/components/hooks, talk like a code walkthrough, use
bullets only for genuinely list-like things — and hard bans on AI filler
("As an AI", "Certainly!", "I hope this helps", restating the question, inventing
files). Temperature 0.4 keeps it natural but grounded.

## Frontend

New **Explain** tab (Dashboard · Graph · Explain):

- Focused Q&A (not a chat) with example questions — one seeded from the graph's
  most-central component.
- "Reading the relevant files…" thinking state; graceful error card that shows
  the provider's message (e.g. missing key / insufficient credits).
- Answers rendered by a **hand-built markdown component** (paragraphs, headings,
  lists, fenced code, inline code, bold) — no markdown library.
- Each answer shows its **context files** and the model/provider used, so the
  explanation is transparent and auditable.

## Key design decisions

| Decision | Rationale |
| --- | --- |
| **Graph-driven context** | The Phase 3/4 component graph *is* the retrieval index — neighbors are exactly "directly related files", no embeddings needed. |
| **Persona in the system prompt** | The human, senior-engineer tone is a product requirement; encoding it server-side keeps every provider consistent. |
| **Provider stays behind `AIProvider`** | The service depends on the interface; swapping OpenAI for Claude/Gemini/Ollama is unchanged business logic. |
| **Transparent sources** | Showing the exact files sent builds trust and demonstrates the "focused context" claim. |
| **Hand-built markdown** | Consistent with the no-UI-library rule; full control over the dark styling. |

## Trade-offs & limitations

- **Keyword focus resolution:** robust for named components/routing; a vague
  question falls back to hubs. Embeddings/semantic search is the documented
  future upgrade (intentionally out of MVP scope).
- **Single-turn:** each question builds its own context; no follow-up memory.
- **Requires provider credits:** wiring is verified to the auth boundary; the
  api-hub.ai gateway returns `insufficient credits` until the account is funded.

## Verification

- `typecheck` (api + web) and web build pass.
- **Focused context proven:** "Explain how the Dashboard works" on the sample
  resolved focus → `Dashboard`, related → `UserCard`, `App`, and sent **3 files**
  (`Dashboard.tsx`, `UserCard.tsx`, `App.tsx`) — **not** the other 3 in the repo.
- **Endpoint wiring proven:** the live call built context, reached the provider,
  and returned a clean `AI_PROVIDER_ERROR` envelope (gateway has no credits).
- The generated answer text itself is pending gateway credits.
