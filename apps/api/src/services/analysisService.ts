import { GraphEdgeKind } from '@prisma/client';
import { analyzeRepository } from '../parser/analyzer.js';
import { buildComponentEdges } from '../graph/graphBuilder.js';
import { deriveFileBasedRoutes } from '../routing/fileRoutes.js';
import { componentRepository } from '../repositories/componentRepository.js';
import { hookRepository } from '../repositories/hookRepository.js';
import { routeRepository } from '../repositories/routeRepository.js';
import { edgeRepository } from '../repositories/edgeRepository.js';

export interface AnalysisCounts {
  componentCount: number;
  hookCount: number;
  routeCount: number;
  edgeCount: number;
}

const componentKey = (path: string, name: string): string => `${path}::${name}`;

/**
 * Parses the repository's source, persists components/hooks/routes/edges, and
 * recomputes graph in-degrees. Idempotent: existing analysis rows for the
 * repository are cleared first, so re-analysis is safe.
 */
export async function analyzeAndPersist(
  repositoryId: string,
  projectRoot: string,
  files: { id: string; path: string }[],
): Promise<AnalysisCounts> {
  const fileIdByPath = new Map(files.map((f) => [f.path, f.id]));
  const { files: parsed } = await analyzeRepository(
    projectRoot,
    files.map((f) => f.path),
  );

  // Clear any prior analysis (edges first — FK to components).
  await edgeRepository.deleteByRepository(repositoryId);
  await componentRepository.deleteByRepository(repositoryId);
  await hookRepository.deleteByRepository(repositoryId);
  await routeRepository.deleteByRepository(repositoryId);

  // 1. Components + hooks (both need a fileId).
  const componentRows = [];
  const hookRows = [];
  for (const file of parsed) {
    const fileId = fileIdByPath.get(file.path);
    if (!fileId) continue;
    for (const c of file.components) {
      componentRows.push({
        repositoryId,
        fileId,
        name: c.name,
        exportKind: c.exportKind,
        isExported: c.isExported,
        startLine: c.startLine,
        endLine: c.endLine,
      });
    }
    for (const h of file.hooks) {
      hookRows.push({
        repositoryId,
        fileId,
        name: h.name,
        isExported: h.isExported,
        startLine: h.startLine,
        endLine: h.endLine,
      });
    }
  }
  if (componentRows.length) await componentRepository.createMany(componentRows);
  if (hookRows.length) await hookRepository.createMany(hookRows);

  // 2. Routes — React Router (from JSX/config) plus file-based conventions
  //    (Expo Router / Next.js). The route file's default-export component names
  //    each file-based route.
  const defaultComponentByPath = new Map<string, string>();
  for (const file of parsed) {
    const def = file.components.find((c) => c.isDefaultExport);
    if (def) defaultComponentByPath.set(file.path, def.name);
  }

  const reactRouterRows = parsed.flatMap((file) =>
    file.routes.map((r) => ({
      path: r.path,
      componentName: r.componentName,
      filePath: file.path,
    })),
  );
  const fileBasedRows = deriveFileBasedRoutes(files.map((f) => f.path)).map((r) => ({
    path: r.routePath,
    componentName: defaultComponentByPath.get(r.filePath) ?? null,
    filePath: r.filePath,
  }));

  // Merge and dedupe by URL path (a project uses one routing system in practice).
  const routesByPath = new Map<string, { path: string; componentName: string | null; filePath: string }>();
  for (const row of [...reactRouterRows, ...fileBasedRows]) {
    if (!routesByPath.has(row.path)) routesByPath.set(row.path, row);
  }
  const routeRows = [...routesByPath.values()].map((r) => ({ repositoryId, ...r }));
  if (routeRows.length) await routeRepository.createMany(routeRows);

  // 3. Edges — map component refs to persisted ids.
  const persistedComponents = await componentRepository.listByRepository(repositoryId);
  const idByKey = new Map(
    persistedComponents.map((c) => [componentKey(c.file.path, c.name), c.id]),
  );

  const edgeRefs = buildComponentEdges(parsed);
  const edgeRows = [];
  for (const edge of edgeRefs) {
    const sourceId = idByKey.get(componentKey(edge.source.path, edge.source.name));
    const targetId = idByKey.get(componentKey(edge.target.path, edge.target.name));
    if (!sourceId || !targetId) continue;
    edgeRows.push({ repositoryId, sourceId, targetId, kind: GraphEdgeKind.RENDERS });
  }
  if (edgeRows.length) await edgeRepository.createMany(edgeRows);

  // 4. Recompute in-degrees for node metadata.
  await componentRepository.updateImportedByCounts(repositoryId);

  return {
    componentCount: componentRows.length,
    hookCount: hookRows.length,
    routeCount: routeRows.length,
    edgeCount: edgeRows.length,
  };
}
