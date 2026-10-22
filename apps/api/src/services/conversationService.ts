import { randomBytes } from 'node:crypto';
import type {
  AskResponse,
  Conversation,
  ConversationWithMessages,
  SharedConversationResponse,
} from '@decodr/types';
import { AIProviderName } from '@decodr/types';
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
import { fallbackTitle, generateTitle } from '../ai/titler.js';
import { generateFollowUps } from '../ai/followUps.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * How many other threads to name. Enough for continuity on a project someone
 * has really dug into, few enough that it stays a footnote in the prompt.
 */
const RELATED_THREADS = 5;

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

  /** Renames a conversation. Titles are derived from the first question, which
   *  is often not what the thread turned out to be about. */
  async rename(repositoryId: string, conversationId: string, title: string): Promise<void> {
    const { count } = await conversationRepository.rename(conversationId, repositoryId, title);
    if (count === 0) throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
  },

  async remove(repositoryId: string, conversationId: string): Promise<void> {
    const { count } = await conversationRepository.delete(conversationId, repositoryId);
    if (count === 0) {
      throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }
  },

  /**
   * Records a reader's rating of an answer.
   *
   * Scoped through the conversation so a message id alone is not enough — the
   * caller has to own the repository the conversation belongs to.
   */
  async rateMessage(
    repositoryId: string,
    conversationId: string,
    messageId: string,
    feedback: 1 | -1 | null,
    note: string | null,
  ): Promise<void> {
    const conversation = await conversationRepository.findWithMessages(
      conversationId,
      repositoryId,
    );
    if (!conversation) {
      throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }
    const count = await messageRepository.setFeedback(
      messageId,
      conversationId,
      feedback,
      note,
    );
    if (count === 0) throw AppError.notFound('Message not found', 'MESSAGE_NOT_FOUND');
  },

  /**
   * Rewinds a thread to just before a message, deleting it and everything after.
   *
   * Editing a question used to copy it into the composer and leave the original
   * turn in place, so the thread grew two near-identical questions and the model
   * replayed both. Rewinding first makes an edit a replacement.
   */
  async rewindTo(
    repositoryId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const conversation = await conversationRepository.findWithMessages(
      conversationId,
      repositoryId,
    );
    if (!conversation) {
      throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }
    const message = await messageRepository.findInConversation(messageId, conversationId);
    if (!message) throw AppError.notFound('Message not found', 'MESSAGE_NOT_FOUND');

    await messageRepository.deleteFrom(conversationId, message.createdAt);
  },

  /**
   * Reads a shared thread by its token, with no session involved.
   *
   * Returns the messages and the project's name only — not its id, not its
   * files, not the other conversations. A share link is a link to one
   * transcript, not an opening into the project behind it.
   */
  async getShared(token: string): Promise<SharedConversationResponse> {
    const trimmed = token.trim();
    if (!trimmed) throw AppError.notFound('Shared conversation not found', 'SHARE_NOT_FOUND');

    const conversation = await conversationRepository.findByShareToken(trimmed);
    if (!conversation) {
      throw AppError.notFound('Shared conversation not found', 'SHARE_NOT_FOUND');
    }
    return {
      title: conversation.title,
      repositoryName: conversation.repository.name,
      messages: conversation.messages.map(toMessageDto),
    };
  },

  /** Mints a read-only share link for a thread, or returns the existing one. */
  async share(repositoryId: string, conversationId: string): Promise<string> {
    const existing = await conversationRepository.findWithMessages(conversationId, repositoryId);
    if (!existing) {
      throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
    }
    if (existing.shareToken) return existing.shareToken;

    const token = randomBytes(24).toString('base64url');
    await conversationRepository.setShareToken(conversationId, repositoryId, token);
    return token;
  },

  /** Revokes a share link. The old URL stops working immediately. */
  async unshare(repositoryId: string, conversationId: string): Promise<void> {
    const { count } = await conversationRepository.setShareToken(
      conversationId,
      repositoryId,
      null,
    );
    if (count === 0) throw AppError.notFound('Conversation not found', 'CONVERSATION_NOT_FOUND');
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
    /** Supplied by the streaming endpoint; the answer is still persisted identically. */
    stream?: ExplainStreamHandlers;
    /** Aborts the model call if the reader stops the answer. */
    signal?: AbortSignal;
  }): Promise<AskResponse> {
    const { repositoryId, conversationId, question } = params;

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

    // Titles of the reader's other threads on this project, so a question that
    // overlaps one can be answered with that in mind rather than from scratch.
    // Titles only — the threads themselves are not replayed.
    const others = await conversationRepository.listByRepository(repositoryId);
    const relatedThreads = others
      .filter((c) => c.id !== conversationId)
      .slice(0, RELATED_THREADS)
      .map((c) => c.title);

    // Mirror the streamed text so a stopped answer can still be saved — losing
    // what someone already read is worse than keeping it marked as incomplete.
    let partial = '';
    const streamWithCapture = params.stream
      ? {
          ...params.stream,
          onDelta: (t: string) => {
            partial += t;
            params.stream!.onDelta(t);
          },
          onReset: () => {
            partial = '';
            params.stream!.onReset();
          },
        }
      : undefined;

    // Generate the answer before writing anything.
    let result;
    try {
      result = await explainRepository(repositoryId, question, {
        history,
        summary: summaryState.summary,
        relatedThreads,
        ...(streamWithCapture ? { stream: streamWithCapture } : {}),
        ...(params.signal ? { signal: params.signal } : {}),
      });
    } catch (err) {
      const stopped = params.signal?.aborted ?? false;
      // A stop with nothing written yet has nothing worth keeping.
      if (!stopped || partial.trim().length === 0) throw err;
      result = {
        answer: `${partial.trim()}\n\n_(stopped)_`,
        provider: AIProviderName.OpenAI,
        model: 'stopped',
        contextPaths: [],
        openedPaths: [],
        // A stopped answer is incomplete by the reader's own choice, which is
        // not the same as running out of budget — no "continue" is offered.
        truncated: false,
      };
    }

    const isNewThread = !conversationId;
    const conversation =
      conversationId ??
      (await conversationRepository.create(repositoryId, fallbackTitle(question))).id;

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
      truncated: result.truncated,
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

    // Suggest what to ask next, in the background. These reach the browser on
    // the same delayed refetch as the generated title, so neither waits on the
    // other and neither delays the answer.
    void generateFollowUps(question, result.answer)
      .then((followUps) =>
        followUps.length > 0
          ? messageRepository.saveFollowUps(assistantMessage.id, followUps)
          : undefined,
      )
      .catch((err) => logger.error('Background follow-ups failed', err));

    // Name the thread properly, in the background. The fallback title is already
    // saved, so this only ever improves the sidebar — and it must not delay the
    // answer the reader is waiting on.
    if (isNewThread) {
      void generateTitle(question)
        .then((title) =>
          title ? conversationRepository.rename(conversation, repositoryId, title) : undefined,
        )
        .catch((err) => logger.error('Background title failed', err));
    }

    const updated = await conversationRepository.findWithCount(conversation, repositoryId);
    return {
      conversation: toConversationDto(updated!),
      userMessage: toMessageDto(userMessage),
      assistantMessage: toMessageDto(assistantMessage),
    };
  },
};
