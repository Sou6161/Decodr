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
  /** Model that produced the message (assistant messages only). */
  model: string | null;
  createdAt: ISODateString;
}

/** A saved explanation conversation, scoped to one repository. */
export interface Conversation {
  id: Id;
  repositoryId: Id;
  title: string;
  messageCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A conversation together with its full message history. */
export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}
