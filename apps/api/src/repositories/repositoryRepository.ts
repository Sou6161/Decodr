import { RepositoryStatus, type Prisma, type Repository as RepositoryModel } from '@prisma/client';
import { prisma } from '../database/prisma.js';

/** Statuses a project passes through while the pipeline is still working on it. */
const IN_PROGRESS: RepositoryStatus[] = [
  RepositoryStatus.PENDING,
  RepositoryStatus.EXTRACTING,
  RepositoryStatus.SCANNING,
  RepositoryStatus.ANALYZING,
];

/**
 * Data-access layer for repositories. Encapsulates all Prisma queries so
 * services stay persistence-agnostic.
 */
export const repositoryRepository = {
  create(data: Prisma.RepositoryCreateInput): Promise<RepositoryModel> {
    return prisma.repository.create({ data });
  },

  /**
   * Creates a project only if the owner has fewer than `limit`, atomically.
   *
   * Counting and then creating as two statements let two uploads sent at the
   * same moment both see 9 and both insert. A transaction-scoped advisory lock
   * on the owner token serialises a single visitor's creates — other visitors
   * take different locks and are never blocked — and is released on commit.
   * Returns null when the owner is already at the limit.
   */
  createUnderLimit(
    data: Prisma.RepositoryCreateInput & { ownerToken: string },
    limit: number,
  ): Promise<RepositoryModel | null> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.ownerToken}))`;
      const existing = await tx.repository.count({ where: { ownerToken: data.ownerToken } });
      if (existing >= limit) return null;
      return tx.repository.create({ data });
    });
  },

  findById(id: string): Promise<RepositoryModel | null> {
    return prisma.repository.findUnique({ where: { id } });
  },

  list(ownerToken: string): Promise<RepositoryModel[]> {
    return prisma.repository.findMany({
      where: { ownerToken },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** How many projects a visitor currently has. */
  countByOwner(ownerToken: string): Promise<number> {
    return prisma.repository.count({ where: { ownerToken } });
  },

  /** Projects older than `cutoff`, for scheduled cleanup. */
  findOlderThan(cutoff: Date): Promise<RepositoryModel[]> {
    return prisma.repository.findMany({ where: { createdAt: { lt: cutoff } } });
  },

  /** Which of these ids still have a project row. */
  async existingIds(ids: string[]): Promise<Set<string>> {
    const rows = await prisma.repository.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  },

  /**
   * Marks as FAILED every project still "in progress" that has not moved since
   * `cutoff`. Each pipeline stage bumps `updatedAt`, so a project idle that long
   * is one whose worker died — a restart or a deploy mid-analysis — and would
   * otherwise show a spinner forever.
   */
  async failStale(cutoff: Date, message: string): Promise<number> {
    const { count } = await prisma.repository.updateMany({
      where: { status: { in: IN_PROGRESS }, updatedAt: { lt: cutoff } },
      data: { status: RepositoryStatus.FAILED, error: message },
    });
    return count;
  },

  update(
    id: string,
    data: Prisma.RepositoryUpdateInput,
  ): Promise<RepositoryModel> {
    return prisma.repository.update({ where: { id }, data });
  },

  delete(id: string): Promise<RepositoryModel> {
    return prisma.repository.delete({ where: { id } });
  },
};
