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

  deleteByRepository(repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.file.deleteMany({ where: { repositoryId } });
  },
};
