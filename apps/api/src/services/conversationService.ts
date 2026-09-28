import type {
  AskResponse,
  Conversation,
  ConversationWithMessages,
} from '@decodr/types';
import { MessageRole } from '@decodr/types';
import { conversationRepository } from '../repositories/conversationRepository.js';
import { messageRepository } from '../repositories/messageRepository.js';
import {
  toConversationDto,
  toConversationWithMessagesDto,
  toMessageDto,
} from '../repositories/conversationMapper.js';
import { explainRepository, type ExplainStreamHandlers } from './explanationService.js';
import type { HistoryTurn } from '../ai/promptBuilder.js';
import { maybeExtendSummary, type SummaryState } from '../ai/summarizer.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

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
   * (e.g. provider error) never leaves an orphaned conversation.
   *
   * Each question builds its own focused context, but the earlier turns of the
   * thread are replayed to the model, so follow-ups ("why?", "what about the
   * other one?") resolve against what was already said.
   */
  async ask(params: {
    repositoryId: string;
    conversationId?: string;
    question: string;
    detailed?: boolean;
    /** Supplied by the streaming endpoint; the answer is still persisted identically. */
    stream?: ExplainStreamHandlers;
    /** Aborts the model call if the reader stops the answer. */
    signal?: AbortSignal;
  }): Promise<AskResponse> {
    const { repositoryId, conversationId, question, detailed } = params;

    // Verify an existing conversation belongs to this repository up front, and
    // load its turns as the model's memory of the thread.
    let history: HistoryTurn[] = [];
    let summaryState: SummaryState = { summary: null, summarizedCount: 0 };
    let pendingSummary: { conversationId: string; history: HistoryTurn[] } | null = null;
    if (conversationId) {
      const existing = await conversationRepository.findWithMessages(conversationId, repositoryId);
      if (!existing) {
        throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
      }
      history = existing.messages.map((m) => ({
        role: m.role === MessageRole.Assistant ? 'assistant' : 'user',
        content: m.content,
      }));
      summaryState = {
        summary: existing.summary,
        summarizedCount: existing.summarizedCount,
      };

      // Extending the rolling summary is work for the NEXT turn, so it must not
      // delay this one. It was awaited here, adding a whole extra model call in
      // front of every question on a long thread. Deferred below instead.
      pendingSummary = { conversationId, history };
    }

    // Generate the answer before writing anything.
    const result = await explainRepository(repositoryId, question, {
      detailed: detailed ?? false,
      history,
      summary: summaryState.summary,
      ...(params.stream ? { stream: params.stream } : {}),
      ...(params.signal ? { signal: params.signal } : {}),
    });

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
      openedPaths: result.openedPaths,
      model: result.model,
    });
    await conversationRepository.touch(conversation);

    // Now that the reader has their answer, catch the summary up in the
    // background. Failure is logged and ignored — it only affects how much
    // older context the next turn gets.
    if (pendingSummary) {
      const { conversationId: cid, history: turns } = pendingSummary;
      void maybeExtendSummary(turns, summaryState)
        .then((extended) =>
          extended
            ? conversationRepository.saveSummary(cid, extended.summary, extended.summarizedCount)
            : undefined,
        )
        .catch((err) => logger.error('Background summary failed', err));
    }

    const updated = await conversationRepository.findWithCount(conversation, repositoryId);
    return {
      conversation: toConversationDto(updated!),
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
    };
  },
};
