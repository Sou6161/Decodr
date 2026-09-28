import type { Message as MessageModel } from '@prisma/client';
import type {
  Conversation,
  ConversationWithMessages,
  Message,
  MessageRole,
} from '@decodr/types';
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
    openedPaths: model.openedPaths,
    // The model name is kept in the database for debugging but deliberately not
    // sent to the browser — which provider answers is not the reader's concern,
    // and shipping it means it shows up in devtools whatever the UI renders.
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
