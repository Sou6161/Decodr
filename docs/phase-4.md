# Phase 4 — Interactive Relationship Graph

Turns the persisted component graph into an explorable React Flow visualization.

## Backend

`GET /api/repositories/:id/graph` → `RepositoryGraph { nodes, edges }`
(`services/graphService.ts`). Component rows become nodes carrying display
metadata (name, file, export kind, in-degree, line span); `ComponentEdge` rows
become directed edges. **No positions are stored** — layout is computed
client-side so the graph stays a pure data structure server-side.

## Frontend

```
GraphPage (lazy)                       route: /repositories/:id/graph
  → useRepositoryGraph(id)             TanStack Query
  → GraphView
       layoutGraph(graph)              dagre top-down DAG layout
       <ReactFlow<ComponentFlowNode>>  custom nodes, minimap, controls, dots bg
         · ComponentNode               name · file · in-degree · export dot
         · search overlay              dims non-matching nodes, shows match count
         · NodeDetailPanel             slide-in metadata on node click
```

Users can **zoom, pan, drag nodes, search, and click** a node to inspect its
file, export kind, in-degree, and line count.

## Key design decisions

| Decision | Rationale |
| --- | --- |
| **Layout computed client-side (dagre)** | Positions are a view concern; deriving them on render keeps the backend graph position-free and deterministic. dagre is a layout algorithm, not a UI kit — consistent with the "hand-built components" rule. |
| **Custom React Flow node** | Full control over the premium dark look and the metadata shown; no node-styling library. |
| **Tabbed repository layout + nested routes** | `RepositoryLayout` owns loading/processing gating and passes the loaded repo to children via Outlet context. Overview/Graph today; Dashboard/Explain slot in for Phases 5–6 with zero refactor. |
| **Lazy-loaded graph route** | React Flow + dagre (~230 KB) load only when the graph tab is opened, keeping the initial bundle lean. |
| **Search dims rather than filters** | Preserves the graph's shape and spatial memory while highlighting matches — clearer than removing nodes. |
| **Mapped-type node data** | React Flow requires `Record<string, unknown>` data; a mapped type over `GraphNodeData` satisfies it where the shared interface can't, without `any`. |

## Trade-offs

- **Client-side layout cost:** very large graphs (thousands of nodes) lay out on
  the main thread. Fine for typical repos; a web worker or server-side layout is
  the scale path.
- **No edge bundling / clustering yet:** dense graphs can look busy. Grouping by
  folder is a natural enhancement.
- **Search highlights but doesn't auto-focus:** could add fit-to-matches later.

## Verification

- `typecheck` (api + web) and the web build pass; graph is a separate lazy chunk.
- Graph endpoint on the sample repo returns 5 nodes with correct in-degree /
  export kind / line span and the 4 expected directed edges
  (`App→Dashboard`, `App→Login`, `Dashboard→UserCard`, `UserCard→Avatar`).
- Test data cleaned; app starts empty.
