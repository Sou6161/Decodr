import type {
  AskResponse,
  Conversation,
  ConversationWithMessages,
} from '@arcloom/types';
import { MessageRole } from '@arcloom/types';
import { conversationRepository } from '../repositories/conversationRepository.js';
import { messageRepository } from '../repositories/messageRepository.js';
import {
  toConversationDto,
  toConversationWithMessagesDto,
  toMessageDto,
} from '../repositories/conversationMapper.js';
import { explainRepository } from './explanationService.js';
import { AppError } from '../utils/AppError.js';

/** First line of the question, trimmed, as the conversation title. */
function deriveTitle(question: string): string {
  const firstLine = question.trim().split('\n')[0]!.trim();
  return firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine;
}

export const conversationService = {
  async list(repositoryId: string): Promise<Conversation[]> {
    const rows = await conversationRepository.listByRepository(repositoryId);
    return rows.map(toConversationDto);
  },

  async get(
    repositoryId: string,
    conversationId: string,
  ): Promise<ConversationWithMessages> {
    const row = await conversationRepository.findWithMessages(conversationId, repositoryId);
    if (!row) throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
    return toConversationWithMessagesDto(row);
  },

  async remove(repositoryId: string, conversationId: string): Promise<void> {
    const { count } = await conversationRepository.delete(conversationId, repositoryId);
    if (count === 0) {
      throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }
  },

  /**
   * Answers a question and persists it. The AI call runs *first*, so a failure
   * (e.g. provider error) never leaves an orphaned conversation. Each question
   * builds its own focused context — the saved thread is a history of
   * independent Q&As, not a memory the model reads back.
   */
  async ask(params: {
    repositoryId: string;
    conversationId?: string;
    question: string;
    detailed?: boolean;
  }): Promise<AskResponse> {
    const { repositoryId, conversationId, question, detailed } = params;

    // Verify an existing conversation belongs to this repository up front.
    if (conversationId) {
      const existing = await conversationRepository.findWithCount(conversationId, repositoryId);
      if (!existing) {
        throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
      }
    }

    // Generate the answer before writing anything.
    const result = await explainRepository(repositoryId, question, { detailed: detailed ?? false });

    const conversation =
      conversationId ??
      (await conversationRepository.create(repositoryId, deriveTitle(question))).id;

    const userMessage = await messageRepository.create({
      conversationId: conversation,
      role: MessageRole.User,
      content: question.trim(),
    });
    const assistantMessage = await messageRepository.create({
      conversationId: conversation,
      role: MessageRole.Assistant,
      content: result.answer,
      contextPaths: result.contextPaths,
      model: result.model,
    });
    await conversationRepository.touch(conversation);

    const updated = await conversationRepository.findWithCount(conversation, repositoryId);
    return {
      conversation: toConversationDto(updated!),
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
    };
  },
};
