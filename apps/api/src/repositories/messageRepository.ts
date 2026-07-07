import type { Message as MessageModel, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export const messageRepository = {
  create(data: Prisma.MessageUncheckedCreateInput): Promise<MessageModel> {
    return prisma.message.create({ data });
  },
};
