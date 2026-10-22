import type { Message as MessageModel, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export const messageRepository = {
  create(data: Prisma.MessageUncheckedCreateInput): Promise<MessageModel> {
    return prisma.message.create({ data });
  },

  /** Attaches follow-up suggestions, which are generated after the answer is sent. */
  saveFollowUps(id: string, followUps: string[]): Promise<unknown> {
    return prisma.message.update({ where: { id }, data: { followUps } });
  },

  /**
   * Records a rating. Scoped by conversation so a message id from another
   * session cannot be rated through a repository the caller does own.
   */
  async setFeedback(
    id: string,
    conversationId: string,
    feedback: number | null,
    note: string | null,
  ): Promise<number> {
    const { count } = await prisma.message.updateMany({
      where: { id, conversationId },
      data: { feedback, feedbackNote: note },
    });
    return count;
  },

  /** The message, if it belongs to the given conversation. */
  findInConversation(id: string, conversationId: string): Promise<MessageModel | null> {
    return prisma.message.findFirst({ where: { id, conversationId } });
  },

  /**
   * Deletes a message and everything after it in its conversation.
   *
   * This is what editing a question does: the thread rewinds to just before it
   * so the new wording replaces the old turn instead of being appended below a
   * near-identical one.
   */
  async deleteFrom(conversationId: string, createdAt: Date): Promise<number> {
    const { count } = await prisma.message.deleteMany({
      where: { conversationId, createdAt: { gte: createdAt } },
    });
    return count;
  },
};
