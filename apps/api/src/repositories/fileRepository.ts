import type { File as FileModel, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

/** Data-access layer for scanned files. */
export const fileRepository = {
  /** Bulk-inserts scanned files. Skips duplicates on (repositoryId, path). */
  createMany(rows: Prisma.FileCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return prisma.file.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string): Promise<FileModel[]> {
    return prisma.file.findMany({
      where: { repositoryId },
      orderBy: { path: 'asc' },
    });
  },

  /** Fetches specific files by path, for on-demand reads during an answer. */
  findByPaths(
    repositoryId: string,
    paths: string[],
  ): Promise<{ path: string; content: string | null }[]> {
    return prisma.file.findMany({
      where: { repositoryId, path: { in: paths } },
      select: { path: true, content: true },
    });
  },

  /** One file's stored source, for the in-app viewer. */
  findByPath(
    repositoryId: string,
    path: string,
  ): Promise<{ path: string; content: string | null; lineCount: number } | null> {
    return prisma.file.findFirst({
      where: { repositoryId, path },
      select: { path: true, content: true, lineCount: true },
    });
  },

  /** Every path in the repository, for @-mention autocomplete and the viewer. */
  listPaths(repositoryId: string): Promise<{ path: string; lineCount: number }[]> {
    return prisma.file.findMany({
      where: { repositoryId },
      select: { path: true, lineCount: true },
      orderBy: { path: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.file.deleteMany({ where: { repositoryId } });
  },
};
