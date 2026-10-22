import type { Id, ISODateString } from './common.js';

/** Author of a message in an explanation conversation. */
export const MessageRole = {
  User: 'USER',
  Assistant: 'ASSISTANT',
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/** A single message within a conversation. */
export interface Message {
  id: Id;
  role: MessageRole;
  content: string;
  /** Repo-relative files sent as context (assistant messages only). */
  contextPaths: string[];
  /** Subset of contextPaths the model opened itself, rather than retrieval choosing. */
  openedPaths: string[];
  /** Model that produced the message (assistant messages only). */

  /** Follow-up questions the model proposed with this answer. */
  followUps: string[];
  /** True when the answer ran out of token budget and can be resumed. */
  truncated: boolean;
  /** Reader's rating: 1 useful, -1 not useful, null untouched. */
  feedback: 1 | -1 | null;
  createdAt: ISODateString;
}

/** A saved explanation conversation, scoped to one repository. */
export interface Conversation {
  id: Id;
  repositoryId: Id;
  title: string;
  messageCount: number;
  /** Set once the owner has minted a read-only share link for this thread. */
  shareToken: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A conversation together with its full message history. */
export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}
