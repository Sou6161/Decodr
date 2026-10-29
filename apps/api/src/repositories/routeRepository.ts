import type { Prisma, Route as RouteModel } from '@prisma/client';
import { prisma, type Db } from '../database/prisma.js';

export const routeRepository = {
  createMany(rows: Prisma.RouteCreateManyInput[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.route.createMany({ data: rows });
  },

  listByRepository(repositoryId: string): Promise<RouteModel[]> {
    return prisma.route.findMany({
      where: { repositoryId },
      orderBy: { path: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.route.deleteMany({ where: { repositoryId } });
  },
};
