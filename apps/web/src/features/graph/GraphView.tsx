import { useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { AnimatePresence } from 'framer-motion';
import '@xyflow/react/dist/style.css';
import type { RepositoryGraph } from '@arcloom/types';
import { SearchIcon } from '@/components/icons';
import { ComponentNode } from './ComponentNode';
import { NodeDetailPanel } from './NodeDetailPanel';
import { layoutGraph, type ComponentFlowNode } from './layout';

const nodeTypes = { component: ComponentNode };

function GraphViewInner({ graph }: { graph: RepositoryGraph }) {
  const laidOut = useMemo(() => layoutGraph(graph), [graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<ComponentFlowNode>(laidOut.nodes);
  const [edges, , onEdgesChange] = useEdgesState(laidOut.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Reflect search (dimming) and selection onto node state, keeping positions.
  useEffect(() => {
    const q = search.trim().toLowerCase();
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        data: {
          ...node.data,
          dimmed: q.length > 0 && !node.data.name.toLowerCase().includes(q),
        },
      })),
    );
  }, [search, selectedId, setNodes]);

  const selectedData = useMemo(
    () => nodes.find((n) => n.id === selectedId)?.data ?? null,
    [nodes, selectedId],
  );

  const matchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return nodes.filter((n) => n.data.name.toLowerCase().includes(q)).length;
  }, [nodes, search]);

  return (
    <div className="relative h-[calc(100vh-15rem)] min-h-[460px] overflow-hidden rounded-2xl border border-border bg-surface/40">
      {/* Search overlay */}
      <div className="absolute left-3 top-3 z-10 w-64">
        <div className="flex items-center gap-2 rounded-xl border border-border glass px-3 py-2">
          <SearchIcon width={16} height={16} className="text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search components…"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-subtle"
          />
        </div>
        {matchCount !== null && (
          <p className="mt-1.5 pl-1 text-xs text-subtle">
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </p>
        )}
      </div>

      <AnimatePresence>
        {selectedData && (
          <NodeDetailPanel data={selectedData} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>

      <ReactFlow<ComponentFlowNode>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => setSelectedId(node.id)}
        onPaneClick={() => setSelectedId(null)}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-border)" />
        <Controls className="!border-border !bg-surface-raised" showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="!bg-surface"
          maskColor="oklch(0.16 0.006 285 / 0.7)"
          nodeColor={() => 'var(--color-primary-soft)'}
        />
      </ReactFlow>
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
