import type { ComponentEdge as EdgeModel, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export const edgeRepository = {
  createMany(rows: Prisma.ComponentEdgeCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return prisma.componentEdge.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string): Promise<EdgeModel[]> {
    return prisma.componentEdge.findMany({ where: { repositoryId } });
  },

  deleteByRepository(repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.componentEdge.deleteMany({ where: { repositoryId } });
  },
};
