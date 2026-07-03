# Phase 3 — React Parser & Component Graph

Static analysis via the **TypeScript Compiler API** (no regular expressions).
This is the analytical core: it turns extracted source into components, hooks,
routes, imports, and the component relationship graph.

## Pipeline (the `ANALYZING` stage)

```
scanned files (Phase 2)
  → analyzeRepository(projectRoot, paths)     [parser/analyzer.ts]
       parseFile per source file              [parser/fileParser.ts]
         · imports        (+ module resolution)
         · components      (JSX-returning fns/classes/HOCs)
         · hooks           (useX functions)
         · routes          (JSX <Route> + data-router objects)
  → buildComponentEdges(parsedFiles)           [graph/graphBuilder.ts]
  → analyzeAndPersist(...)                      [services/analysisService.ts]
       persist components / hooks / routes / edges
       recompute importedByCount (in-degree)
```

## How each thing is extracted (AST, not regex)

| Entity | Detection |
| --- | --- |
| **Components** | PascalCase function/arrow declarations whose body contains JSX; class components (extends `Component`/`PureComponent` or render JSX); HOC-wrapped (`memo`/`forwardRef`) functions; anonymous `export default () => <jsx/>` named from the file. |
| **Hooks** | Functions named `use[A-Z…]` (declaration or arrow-assigned). |
| **Imports** | `ImportDeclaration` clauses — default, named, and namespace bindings — each resolved to a repo file. |
| **Exports** | Inline `export`/`export default` modifiers, `export { … }`, `export { X as default }`, and `export default Name`. Drives `isExported` / `exportKind`. |
| **Routes** | `<Route path="…" element={<X/>} \| component={X} />` **and** data-router config objects `{ path, element }` inside `createBrowserRouter([...])`. |

## Module resolution

`resolveModule()` mirrors Node/TS resolution for **relative** specifiers:
extension inference (`.tsx/.ts/.jsx/.js/.mjs/.cjs`) and `index.*` files, matched
against the scanned file set. Bare specifiers (`react`) are external. Path
aliases (`@/…`) are intentionally out of scope for the MVP.

## The graph

For each component, its rendered PascalCase JSX tags are resolved to a target
component — first same-file, then through the file's imports (honoring **default
vs named** so `import Login from './Login'` maps to that file's default export).
Each resolved pair is a directed **RENDERS** edge. Self-edges (recursion),
duplicates, and external tags are dropped. `importedByCount` (in-degree) is then
recomputed with a single SQL statement.

## Key design decisions

| Decision | Rationale |
| --- | --- |
| **Syntactic AST only (no type-checker)** | `ts.createSourceFile` per file is fast and needs no `tsconfig`/`node_modules`; type info isn't required to find components, imports, or JSX usage. |
| **Attribute edges to the enclosing component** | Walking each component's own JSX (not the whole file) yields precise `A renders B` edges even when a file declares several components. |
| **Default-export tracking per file** | Correctly resolves default imports to the right target regardless of the local alias used at the import site. |
| **`analyzeAndPersist` clears prior rows first** | Re-analysis is idempotent and safe to re-run. |
| **`createMany` + read-back id map** | Bulk insert, then map `path::name → id` to wire edges — avoids N round-trips. |

## Trade-offs & known limitations

- **No path-alias resolution** (`@/…`): such imports won't produce cross-file
  edges. Documented; a tsconfig-paths reader is a clean follow-up.
- **Heuristic component detection:** a PascalCase function returning JSX is a
  component. Non-rendering PascalCase factories could be misclassified; rare in
  practice and acceptable for an overview tool.
- **Static routes only:** dynamically-generated route arrays or spread configs
  are not resolved.
- **`.js`-with-JSX** is parsed as JSX (best-effort for non-TS React projects).

## API surface

`GET /api/repositories/:id/components` now returns the extracted
`{ files, components, hooks, routes }`. `.../graph` and `.../dashboard` remain
`501` until Phases 4–5. The repository detail page already reflects the new
component/hook/route counts.

## Verification

Analyzed a multi-folder sample (App → Dashboard → UserCard → Avatar, plus Login
and a `useUser` hook, wired with React Router):

- **5 components, 1 hook, 2 routes, 4 edges** — exactly as authored.
- Cross-folder relative imports resolved; **external** `react-router-dom` tags
  excluded; **duplicate** `<UserCard/>` deduped to one edge.
- Default (`Login`) vs named (`Dashboard`) imports both resolved correctly.
- `importedByCount` correct across the graph.
- `npm run typecheck` + `npm run build` (api) pass; web unaffected.
