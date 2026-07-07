import dagre from '@dagrejs/dagre';
import { MarkerType, Position, type Edge, type Node } from '@xyflow/react';
import type { GraphNodeData, RepositoryGraph } from '@arcloom/types';

/**
 * React Flow requires node data to satisfy Record<string, unknown> (a mapped
 * type does; an interface does not). `dimmed` is a UI-only flag toggled by search.
 */
export type ComponentNodeData = { [K in keyof GraphNodeData]: GraphNodeData[K] } & {
  dimmed?: boolean;
};
export type ComponentFlowNode = Node<ComponentNodeData, 'component'>;

const NODE_WIDTH = 210;
const NODE_HEIGHT = 66;

/**
 * Computes a top-down layered layout for the component graph with dagre.
 * Positions are derived at render time (nothing is persisted), so the same
 * graph always lays out deterministically.
 */
export function layoutGraph(graph: RepositoryGraph): {
  nodes: ComponentFlowNode[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 64, ranksep: 120, marginx: 24, marginy: 24 });

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: ComponentFlowNode[] = graph.nodes.map((node) => {
    const { x, y } = g.node(node.id);
    return {
      id: node.id,
      type: 'component',
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
      data: node.data,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    };
  });

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  }));

  return { nodes, edges };
}
