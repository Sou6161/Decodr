import type { ComponentEdge as EdgeModel, Prisma } from '@prisma/client';
import { prisma, type Db } from '../database/prisma.js';

export const edgeRepository = {
  createMany(rows: Prisma.ComponentEdgeCreateManyInput[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.componentEdge.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string): Promise<EdgeModel[]> {
    return prisma.componentEdge.findMany({ where: { repositoryId } });
  },

  deleteByRepository(repositoryId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.componentEdge.deleteMany({ where: { repositoryId } });
  },
};
