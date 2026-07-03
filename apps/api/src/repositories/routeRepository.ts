import type { Prisma, Route as RouteModel } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export const routeRepository = {
  createMany(rows: Prisma.RouteCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return prisma.route.createMany({ data: rows });
  },

  listByRepository(repositoryId: string): Promise<RouteModel[]> {
    return prisma.route.findMany({
      where: { repositoryId },
      orderBy: { path: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.route.deleteMany({ where: { repositoryId } });
  },
};
