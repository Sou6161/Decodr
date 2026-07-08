import type {
  DashboardStats,
  FolderTreeNode,
  RankedComponent,
} from '@decodr/types';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { fileRepository } from '../repositories/fileRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import type { ComponentWithPath } from '../repositories/componentRepository.js';
import { AppError } from '../utils/AppError.js';

const RANK_LIMIT = 8;

const lineSpan = (c: ComponentWithPath): number =>
  Math.max(1, c.endLine - c.startLine + 1);

/** Mutable tree node used while building; converted to the DTO at the end. */
interface MutableNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  fileCount: number;
  componentCount: number;
  children: Map<string, MutableNode>;
}

/**
 * Aggregates repository insights for the dashboard. Totals come from the
 * denormalized counts; rankings and the folder *tree* are computed from the
 * component/file rows.
 */
export async function getDashboard(repositoryId: string): Promise<DashboardStats> {
  const repo = await repositoryRepository.findById(repositoryId);
  if (!repo) {
    throw AppError.notFound('Repository not found', 'REPOSITORY_NOT_FOUND');
  }

  const [files, components] = await Promise.all([
    fileRepository.listByRepository(repositoryId),
    componentRepository.listByRepository(repositoryId),
  ]);

  const largestComponents: RankedComponent[] = [...components]
    .sort((a, b) => lineSpan(b) - lineSpan(a))
    .slice(0, RANK_LIMIT)
    .map((c) => ({ name: c.name, filePath: c.file.path, value: lineSpan(c) }));

  const mostImportedComponents: RankedComponent[] = [...components]
    .filter((c) => c.importedByCount > 0)
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, RANK_LIMIT)
    .map((c) => ({ name: c.name, filePath: c.file.path, value: c.importedByCount }));

  // Components-per-file, so each file/folder node carries a component count.
  const componentsByPath = new Map<string, number>();
  for (const c of components) {
    componentsByPath.set(c.file.path, (componentsByPath.get(c.file.path) ?? 0) + 1);
  }

  const { tree, folderCount } = buildTree(
    files.map((f) => f.path),
    componentsByPath,
  );

  return {
    totalFiles: repo.fileCount,
    totalComponents: repo.componentCount,
    totalHooks: repo.hookCount,
    totalRoutes: repo.routeCount,
    totalLines: repo.totalLines,
    totalFolders: folderCount,
    largestComponents,
    mostImportedComponents,
    tree,
  };
}

/** Builds a nested folder tree from file paths, rolling up counts to ancestors. */
function buildTree(
  paths: string[],
  componentsByPath: Map<string, number>,
): { tree: FolderTreeNode[]; folderCount: number } {
  const root = new Map<string, MutableNode>();
  const folderPaths = new Set<string>();

  for (const filePath of paths) {
    const segments = filePath.split('/');
    const componentCount = componentsByPath.get(filePath) ?? 0;
    let level = root;
    let currentPath = '';

    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;

      let node = level.get(segment);
      if (!node) {
        node = {
          name: segment,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          fileCount: 0,
          componentCount: 0,
          children: new Map(),
        };
        level.set(segment, node);
      }

      if (isFile) {
        node.fileCount = 1;
        node.componentCount = componentCount;
      } else {
        node.fileCount += 1;
        node.componentCount += componentCount;
        folderPaths.add(currentPath);
      }
      level = node.children;
    });
  }

  return { tree: convert(root), folderCount: folderPaths.size };
}

/** Converts the mutable map tree into sorted DTO nodes (folders first, then files). */
function convert(level: Map<string, MutableNode>): FolderTreeNode[] {
  return [...level.values()]
    .map((node): FolderTreeNode => {
      const base = {
        name: node.name,
        path: node.path,
        type: node.type,
        fileCount: node.fileCount,
        componentCount: node.componentCount,
      };
      return node.type === 'folder' ? { ...base, children: convert(node.children) } : base;
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
