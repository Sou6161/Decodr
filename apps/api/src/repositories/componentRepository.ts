import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

/** A component row joined with its file path (for key building + DTOs). */
export type ComponentWithPath = Prisma.ComponentGetPayload<{
  include: { file: { select: { path: true } } };
}>;

export const componentRepository = {
  createMany(rows: Prisma.ComponentCreateManyInput[]): Promise<Prisma.BatchPayload> {
    return prisma.component.createMany({ data: rows, skipDuplicates: true });
  },

  listByRepository(repositoryId: string): Promise<ComponentWithPath[]> {
    return prisma.component.findMany({
      where: { repositoryId },
      include: { file: { select: { path: true } } },
      orderBy: { name: 'asc' },
    });
  },

  deleteByRepository(repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.component.deleteMany({ where: { repositoryId } });
  },

  /** Recomputes each component's in-degree from persisted edges. */
  updateImportedByCounts(repositoryId: string): Promise<number> {
    return prisma.$executeRaw`
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
