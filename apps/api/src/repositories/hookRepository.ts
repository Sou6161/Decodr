import type { Hook as HookModel, Prisma } from '@prisma/client';
import { prisma, type Db } from '../database/prisma.js';

export const hookRepository = {
  createMany(rows: Prisma.HookCreateManyInput[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.hook.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string): Promise<HookModel[]> {
    return prisma.hook.findMany({
      where: { repositoryId },
      orderBy: { name: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.hook.deleteMany({ where: { repositoryId } });
  },
};
