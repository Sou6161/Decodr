import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '../database/prisma.js';

/** A component row joined with its file path (for key building + DTOs). */
export type ComponentWithPath = Prisma.ComponentGetPayload<{
  include: { file: { select: { path: true } } };
}>;

export const componentRepository = {
  createMany(rows: Prisma.ComponentCreateManyInput[], db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.component.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string, db: Db = prisma): Promise<ComponentWithPath[]> {
    return db.component.findMany({
      where: { repositoryId },
      include: { file: { select: { path: true } } },
      orderBy: { name: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string, db: Db = prisma): Promise<Prisma.BatchPayload> {
    return db.component.deleteMany({ where: { repositoryId } });
  },

  /** Recomputes each component's in-degree from persisted edges. */
  updateImportedByCounts(repositoryId: string, db: Db = prisma): Promise<number> {
    return db.$executeRaw`
      UPDATE "Component" c
      SET "importedByCount" = sub.cnt
      FROM (
        SELECT "targetId" AS id, COUNT(*)::int AS cnt
        FROM "ComponentEdge"
        WHERE "repositoryId" = ${repositoryId}
        GROUP BY "targetId"
      ) sub
      WHERE c.id = sub.id
    `;
  },
};
