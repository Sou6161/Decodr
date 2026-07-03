import type { Id } from './common.js';
import type { ExportKind } from './analysis.js';

/** The kind of node rendered in the relationship graph. */
export const GraphNodeKind = {
  Component: 'COMPONENT',
} as const;
export type GraphNodeKind =
  (typeof GraphNodeKind)[keyof typeof GraphNodeKind];

/** Why two nodes are connected. */
export const GraphEdgeKind = {
  /** Source file imports/renders the target component. */
  Renders: 'RENDERS',
} as const;
export type GraphEdgeKind =
  (typeof GraphEdgeKind)[keyof typeof GraphEdgeKind];

/** Metadata shown when a node is selected in the UI. */
export interface GraphNodeData {
  name: string;
  filePath: string;
  kind: GraphNodeKind;
  exportKind: ExportKind;
  importedByCount: number;
  lineCount: number;
}

export interface GraphNode {
  id: Id;
  data: GraphNodeData;
}

export interface GraphEdge {
  id: Id;
  source: Id;
  target: Id;
  kind: GraphEdgeKind;
}

/** The full relationship graph for a repository. */
export interface RepositoryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
