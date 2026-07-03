import type { Hook as HookModel, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export const hookRepository = {
  createMany(rows: Prisma.HookCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return prisma.hook.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string): Promise<HookModel[]> {
    return prisma.hook.findMany({
      where: { repositoryId },
      orderBy: { name: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.hook.deleteMany({ where: { repositoryId } });
  },
};
