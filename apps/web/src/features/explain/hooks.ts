import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationWithMessages } from '@arcloom/types';
import { conversationKeys, explainApi } from './api';
import { toast } from '@/stores/toastStore';
import { ApiClientError } from '@/services/apiClient';

/** Lists saved conversations for a repository (newest first). */
export function useConversations(repoId: string) {
  return useQuery({
    queryKey: conversationKeys.all(repoId),
    queryFn: async () => (await explainApi.listConversations(repoId)).conversations,
  });
}

/** Loads a single conversation with its full message history. */
export function useConversation(repoId: string, conversationId: string | null) {
  return useQuery({
    queryKey: conversationKeys.detail(repoId, conversationId ?? ''),
    queryFn: async () =>
      (await explainApi.getConversation(repoId, conversationId as string)).conversation,
    enabled: Boolean(conversationId),
  });
}

/**
 * Asks a question. On success it writes the two new messages straight into the
 * conversation-detail cache (no refetch flicker) and refreshes the list.
 */
export function useAsk(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { conversationId?: string; question: string; detailed?: boolean }) =>
      explainApi.ask(repoId, vars),
    onSuccess: ({ conversation, userMessage, assistantMessage }) => {
      queryClient.setQueryData<ConversationWithMessages>(
        conversationKeys.detail(repoId, conversation.id),
        (old) => ({
          ...(old ?? { ...conversation, messages: [] }),
          ...conversation,
          messages: [...(old?.messages ?? []), userMessage, assistantMessage],
        }),
      );
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all(repoId) });
    },
    onError: (error) => {
      const message =
        error instanceof ApiClientError
          ? error.apiError.message
          : 'Something went wrong generating the explanation.';
      toast.error('Explanation failed', message);
    },
  });
}

/** Deletes a conversation and refreshes the list. */
export function useDeleteConversation(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) =>
      explainApi.deleteConversation(repoId, conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all(repoId) });
      toast.success('Conversation deleted');
    },
  });
}
