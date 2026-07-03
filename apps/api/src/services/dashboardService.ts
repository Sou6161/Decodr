import type {
  DashboardStats,
  FolderSummary,
  RankedComponent,
} from '@arcloom/types';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { fileRepository } from '../repositories/fileRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import type { ComponentWithPath } from '../repositories/componentRepository.js';
import { AppError } from '../utils/AppError.js';

const RANK_LIMIT = 8;

const lineSpan = (c: ComponentWithPath): number =>
  Math.max(1, c.endLine - c.startLine + 1);

/** Parent directory of a repo-relative path (POSIX), or "." for root files. */
const dirOf = (path: string): string => {
  const i = path.lastIndexOf('/');
  return i === -1 ? '.' : path.slice(0, i);
};

/**
 * Aggregates repository insights for the dashboard. Totals come from the
 * denormalized counts on the repository; rankings and the folder breakdown are
 * computed from the component/file rows.
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

  // Folder breakdown: file + component counts grouped by immediate directory.
  const folderMap = new Map<string, { fileCount: number; componentCount: number }>();
  const bump = (path: string, key: 'fileCount' | 'componentCount'): void => {
    const folder = dirOf(path);
    const entry = folderMap.get(folder) ?? { fileCount: 0, componentCount: 0 };
    entry[key] += 1;
    folderMap.set(folder, entry);
  };
  for (const file of files) bump(file.path, 'fileCount');
  for (const component of components) bump(component.file.path, 'componentCount');

  const folders: FolderSummary[] = [...folderMap.entries()]
    .map(([path, counts]) => ({ path, ...counts }))
    .sort((a, b) => b.fileCount - a.fileCount || a.path.localeCompare(b.path));

  return {
    totalFiles: repo.fileCount,
    totalComponents: repo.componentCount,
    totalHooks: repo.hookCount,
    totalRoutes: repo.routeCount,
    totalLines: repo.totalLines,
    largestComponents,
    mostImportedComponents,
    folders,
  };
}
