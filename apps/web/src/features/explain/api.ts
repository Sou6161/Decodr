import type {
  AskResponse,
  ConversationResponse,
  ListConversationsResponse,
} from '@decodr/types';
import { apiClient } from '@/services/apiClient';

export const explainApi = {
  listConversations: (repoId: string) =>
    apiClient.get<ListConversationsResponse>(`/repositories/${repoId}/conversations`),
  getConversation: (repoId: string, cid: string) =>
    apiClient.get<ConversationResponse>(`/repositories/${repoId}/conversations/${cid}`),
  ask: (
    repoId: string,
    body: { conversationId?: string; question: string; detailed?: boolean },
  ) => apiClient.post<AskResponse>(`/repositories/${repoId}/conversations/ask`, body),
  deleteConversation: (repoId: string, cid: string) =>
    apiClient.delete<void>(`/repositories/${repoId}/conversations/${cid}`),
};

export const conversationKeys = {
  all: (repoId: string) => ['repositories', repoId, 'conversations'] as const,
  detail: (repoId: string, cid: string) =>
    ['repositories', repoId, 'conversations', cid] as const,
};
