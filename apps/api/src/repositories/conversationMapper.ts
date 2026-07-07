import type { Message as MessageModel } from '@prisma/client';
import type {
  Conversation,
  ConversationWithMessages,
  Message,
  MessageRole,
} from '@arcloom/types';
import type {
  ConversationWithCount,
  ConversationWithMessages as ConversationWithMessagesModel,
} from './conversationRepository.js';

export function toMessageDto(model: MessageModel): Message {
  return {
    id: model.id,
    role: model.role as MessageRole,
    content: model.content,
    contextPaths: model.contextPaths,
    model: model.model,
    createdAt: model.createdAt.toISOString(),
  };
}

export function toConversationDto(model: ConversationWithCount): Conversation {
  return {
    id: model.id,
    repositoryId: model.repositoryId,
    title: model.title,
    messageCount: model._count.messages,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export function toConversationWithMessagesDto(
  model: ConversationWithMessagesModel,
): ConversationWithMessages {
  return {
    id: model.id,
    repositoryId: model.repositoryId,
    title: model.title,
    messageCount: model.messages.length,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
    messages: model.messages.map(toMessageDto),
  };
}
