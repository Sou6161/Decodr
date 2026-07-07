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
