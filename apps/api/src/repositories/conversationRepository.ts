import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

/** A conversation row with its message count (for the list view). */
export type ConversationWithCount = Prisma.ConversationGetPayload<{
  include: { _count: { select: { messages: true } } };
}>;

/** A conversation row with all messages ordered oldest-first. */
export type ConversationWithMessages = Prisma.ConversationGetPayload<{
  include: { messages: true };
}>;

export const conversationRepository = {
  create(repositoryId: string, title: string): Promise<ConversationWithCount> {
    return prisma.conversation.create({
      data: { repositoryId, title },
      include: { _count: { select: { messages: true } } },
    });
  },

  listByRepository(repositoryId: string): Promise<ConversationWithCount[]> {
    return prisma.conversation.findMany({
      where: { repositoryId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  },

  findWithCount(
    id: string,
    repositoryId: string,
  ): Promise<ConversationWithCount | null> {
    return prisma.conversation.findFirst({
      where: { id, repositoryId },
      include: { _count: { select: { messages: true } } },
    });
  },

  findWithMessages(
    id: string,
    repositoryId: string,
  ): Promise<ConversationWithMessages | null> {
    return prisma.conversation.findFirst({
      where: { id, repositoryId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  },

  /** Renames a conversation, scoped to its repository so ids cannot be probed. */
  rename(id: string, repositoryId: string, title: string) {
    return prisma.conversation.updateMany({ where: { id, repositoryId }, data: { title } });
  },

  /** Sets or clears the read-only share token, scoped to its repository. */
  setShareToken(id: string, repositoryId: string, shareToken: string | null) {
    return prisma.conversation.updateMany({ where: { id, repositoryId }, data: { shareToken } });
  },

  /**
   * Looks a conversation up by its share token alone.
   *
   * The only path into a conversation that does not go through the owner's
   * session, so it is deliberately narrow: an exact token match, and the
   * repository name comes along only to label the page.
   */
  findByShareToken(shareToken: string) {
    return prisma.conversation.findFirst({
      where: { shareToken },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        repository: { select: { name: true } },
      },
    });
  },

  /** Persists the rolling summary and how many messages it now covers. */
  saveSummary(id: string, summary: string, summarizedCount: number): Promise<unknown> {
    return prisma.conversation.update({
      where: { id },
      data: { summary, summarizedCount },
    });
  },

  /** Bumps updatedAt so the conversation sorts to the top of the list. */
  touch(id: string): Promise<unknown> {
    return prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  },

  delete(id: string, repositoryId: string): Promise<Prisma.BatchPayload> {
    return prisma.conversation.deleteMany({ where: { id, repositoryId } });
  },
};
