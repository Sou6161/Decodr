import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
} from '@xyflow/react';
import { AnimatePresence } from 'framer-motion';
import '@xyflow/react/dist/style.css';
import type { RepositoryGraph } from '@decodr/types';
import { CompressIcon, ExpandIcon, SearchIcon } from '@/components/icons';
import { cn } from '@/utils/cn';
import { ComponentNode } from './ComponentNode';
import { NodeDetailPanel } from './NodeDetailPanel';
import { layoutGraph, type ComponentFlowNode } from './layout';

const nodeTypes = { component: ComponentNode };

function GraphViewInner({ graph }: { graph: RepositoryGraph }) {
  const { fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showIsolated, setShowIsolated] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Which nodes take part in at least one relationship.
  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of graph.edges) {
      set.add(e.source);
      set.add(e.target);
    }
    return set;
  }, [graph.edges]);

  const isolatedCount = graph.nodes.length - connectedIds.size;

  // Adjacency for neighborhood focus.
  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      (map.get(a) ?? map.set(a, new Set()).get(a)!).add(b);
    };
    for (const e of graph.edges) {
      add(e.source, e.target);
      add(e.target, e.source);
    }
    return map;
  }, [graph.edges]);

  // Filter to the connected subgraph unless the user opts to see everything.
  const filteredGraph = useMemo<RepositoryGraph>(() => {
    if (showIsolated) return graph;
    return { nodes: graph.nodes.filter((n) => connectedIds.has(n.id)), edges: graph.edges };
  }, [graph, showIsolated, connectedIds]);

  const laidOut = useMemo(() => layoutGraph(filteredGraph), [filteredGraph]);

  const query = search.trim().toLowerCase();
  const focusSet = useMemo(() => {
    if (!selectedId) return null;
    return new Set<string>([selectedId, ...(neighbors.get(selectedId) ?? [])]);
  }, [selectedId, neighbors]);

  // Derive display nodes (pure — nodes aren't draggable, so no local node state).
  const nodes: ComponentFlowNode[] = useMemo(
    () =>
      laidOut.nodes.map((node) => {
        const searchMiss = query.length > 0 && !node.data.name.toLowerCase().includes(query);
        const focusMiss = focusSet !== null && !focusSet.has(node.id);
        return {
          ...node,
          selected: node.id === selectedId,
          data: { ...node.data, dimmed: searchMiss || focusMiss },
        };
      }),
    [laidOut.nodes, query, focusSet, selectedId],
  );

  // Edges: subtle by default; the selected node's edges light up.
  const edges: Edge[] = useMemo(
    () =>
      laidOut.edges.map((edge) => {
        const active = selectedId !== null && (edge.source === selectedId || edge.target === selectedId);
        const base = selectedId ? 0.1 : 0.4;
        return {
          ...edge,
          animated: active,
          style: {
            stroke: active ? 'var(--color-primary)' : 'var(--color-border-strong)',
            strokeWidth: active ? 2 : 1.5,
            opacity: active ? 1 : base,
          },
        };
      }),
    [laidOut.edges, selectedId],
  );

  const selectedData = useMemo(
    () => nodes.find((n) => n.id === selectedId)?.data ?? null,
    [nodes, selectedId],
  );

  // Re-fit whenever the visible set or the container size changes.
  useEffect(() => {
    const id = window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    return () => window.clearTimeout(id);
  }, [showIsolated, fullscreen, fitView]);

  // Escape exits fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const nothingConnected = !showIsolated && connectedIds.size === 0;

  return (
    <div
      className={cn(
        'relative overflow-hidden border border-border bg-surface/40',
        fullscreen
          ? 'fixed inset-0 z-[80] h-screen w-screen rounded-none bg-background'
          : 'h-[calc(100vh-15rem)] min-h-[460px] rounded-2xl',
      )}
    >
      {/* Controls overlay */}
      <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
        <div className="flex w-56 items-center gap-2 rounded-xl border border-border glass px-3 py-2">
          <SearchIcon width={16} height={16} className="text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components…"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
          />
        </div>
        {isolatedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowIsolated((v) => !v)}
            className={cn(
              'rounded-xl border px-3 py-2 text-xs font-medium transition-colors glass',
              showIsolated
                ? 'border-primary/40 text-primary'
                : 'border-border text-muted hover:text-foreground',
            )}
            title="Isolated components have no detected relationships"
          >
            {showIsolated ? 'Hide' : 'Show'} {isolatedCount} unconnected
          </button>
        )}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="rounded-xl border border-border glass p-2 text-muted transition-colors hover:text-foreground"
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {fullscreen ? <CompressIcon width={16} height={16} /> : <ExpandIcon width={16} height={16} />}
        </button>
      </div>

      <AnimatePresence>
        {selectedData && (
          <NodeDetailPanel data={selectedData} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>

      {nothingConnected ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-medium text-foreground">No relationships detected</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            None of the {graph.nodes.length} components import one another (they may be routed by
            the framework rather than rendered directly).
          </p>
          <button
            type="button"
            onClick={() => setShowIsolated(true)}
            className="mt-4 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
          >
            Show all components
          </button>
        </div>
      ) : (
        <ReactFlow<ComponentFlowNode>
          key={showIsolated ? 'all' : 'connected'}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          onNodeClick={(_, node) => setSelectedId(node.id)}
          onPaneClick={() => setSelectedId(null)}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-border)" />
          <Controls className="!border-border !bg-surface-raised" showInteractive={false} />
          <MiniMap
            pannable
            className="!hidden !bg-surface sm:!block"
            maskColor="oklch(0.16 0.006 285 / 0.7)"
            nodeColor={() => 'var(--color-primary-soft)'}
          />
        </ReactFlow>
      )}
    </div>
  );
}

/** Provider wrapper so React Flow hooks work and layout is isolated per repo. */
export function GraphView({ graph }: { graph: RepositoryGraph }) {
  return (
    <ReactFlowProvider>
      <GraphViewInner graph={graph} />
    </ReactFlowProvider>
  );
}
