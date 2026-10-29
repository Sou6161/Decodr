import { GraphEdgeKind, type Prisma } from '@prisma/client';
import { analyzeRepository } from '../parser/analyzer.js';
import { buildComponentEdges } from '../graph/graphBuilder.js';
import { deriveFileBasedRoutes } from '../routing/fileRoutes.js';
import { prisma } from '../database/prisma.js';
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
 * Upper bound on the write transaction. Inserts are bulk, so even a large
 * project takes seconds; Prisma's 5s default was the risk, not the work.
 */
const TRANSACTION_TIMEOUT_MS = 120_000;

/**
 * Parses the repository's source, persists components/hooks/routes/edges, and
 * recomputes graph in-degrees. Idempotent: existing analysis rows for the
 * repository are cleared first, so re-analysis is safe.
 *
 * Parsing happens first, outside any transaction — it is CPU work and holds no
 * locks. Every write then runs in ONE transaction: the deletes, the inserts,
 * the edges and the in-degree update commit together or not at all. Before,
 * they were separate statements, so a failure halfway (a dropped connection,
 * a deploy) could leave a project with components but no edges, or with its
 * old analysis deleted and no new one.
 */
export async function analyzeAndPersist(
  repositoryId: string,
  projectRoot: string,
  files: { id: string; path: string }[],
  /** Source the scanner already read, so the parser does not read it again. */
  contents: ReadonlyMap<string, string> = new Map(),
): Promise<AnalysisCounts> {
  const fileIdByPath = new Map(files.map((f) => [f.path, f.id]));
  const { files: parsed } = await analyzeRepository(
    projectRoot,
    files.map((f) => f.path),
    contents,
  );

  // 1. Components + hooks (both need a fileId).
  const componentRows: Prisma.ComponentCreateManyInput[] = [];
  const hookRows: Prisma.HookCreateManyInput[] = [];
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

  const edgeRefs = buildComponentEdges(parsed);

  const edgeCount = await prisma.$transaction(
    async (tx) => {
      // Clear any prior analysis (edges first — FK to components).
      await edgeRepository.deleteByRepository(repositoryId, tx);
      await componentRepository.deleteByRepository(repositoryId, tx);
      await hookRepository.deleteByRepository(repositoryId, tx);
      await routeRepository.deleteByRepository(repositoryId, tx);

      if (componentRows.length) await componentRepository.createMany(componentRows, tx);
      if (hookRows.length) await hookRepository.createMany(hookRows, tx);
      if (routeRows.length) await routeRepository.createMany(routeRows, tx);

      // 3. Edges — map component refs to the ids just inserted.
      const persistedComponents = await componentRepository.listByRepository(repositoryId, tx);
      const idByKey = new Map(
        persistedComponents.map((c) => [componentKey(c.file.path, c.name), c.id]),
      );
      const edgeRows = [];
      for (const edge of edgeRefs) {
        const sourceId = idByKey.get(componentKey(edge.source.path, edge.source.name));
        const targetId = idByKey.get(componentKey(edge.target.path, edge.target.name));
        if (!sourceId || !targetId) continue;
        edgeRows.push({ repositoryId, sourceId, targetId, kind: GraphEdgeKind.RENDERS });
      }
      if (edgeRows.length) await edgeRepository.createMany(edgeRows, tx);

      // 4. Recompute in-degrees for node metadata.
      await componentRepository.updateImportedByCounts(repositoryId, tx);
      return edgeRows.length;
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
  );

  return {
    componentCount: componentRows.length,
    hookCount: hookRows.length,
    routeCount: routeRows.length,
    edgeCount,
  };
}
