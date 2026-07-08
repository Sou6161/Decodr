import type { RepositoryGraph } from '@decodr/types';
import { GraphNodeKind } from '@decodr/types';
import { componentRepository } from '../repositories/componentRepository.js';
import { edgeRepository } from '../repositories/edgeRepository.js';

/**
 * Assembles the persisted relationship graph for a repository: component nodes
 * (with display metadata) and RENDERS edges. Positions are computed client-side
 * at render time, so none are stored.
 */
export async function getRepositoryGraph(
  repositoryId: string,
): Promise<RepositoryGraph> {
  const [components, edges] = await Promise.all([
    componentRepository.listByRepository(repositoryId),
    edgeRepository.listByRepository(repositoryId),
  ]);

  return {
    nodes: components.map((c) => ({
      id: c.id,
      data: {
        name: c.name,
        filePath: c.file.path,
        kind: GraphNodeKind.Component,
        exportKind: c.exportKind,
        importedByCount: c.importedByCount,
        lineCount: Math.max(1, c.endLine - c.startLine + 1),
      },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      kind: e.kind,
    })),
  };
}
