import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationWithMessages } from '@decodr/types';
import { askStream, conversationKeys, explainApi, type AskIntent } from './api';
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
  // The answer as it arrives, so the page can render it before it is complete.
  const [streamed, setStreamed] = useState('');
  const [openedFiles, setOpenedFiles] = useState<string[]>([]);
  const [intent, setIntent] = useState<AskIntent | null>(null);
  // The question that failed, kept so the thread can offer to run it again.
  // A toast disappears; a failed turn you can retry does not.
  const [failed, setFailed] = useState<{ question: string; message: string } | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  // Set while the model is re-reading after opening files, so the UI can
  // explain why the text it was showing just cleared.
  const [rereading, setRereading] = useState(false);
  // Held so the reader can stop an answer in progress.
  const abortRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { conversationId?: string; question: string; detailed?: boolean }) => {
      setStreamed('');
      setOpenedFiles([]);
      setIntent(null);
      setContextFiles([]);
      setRereading(false);
      abortRef.current = new AbortController();
      return askStream(repoId, vars, {
        onStart: setIntent,
        onContext: setContextFiles,
        onDelta: (text) => {
          setRereading(false);
          setStreamed((prev) => prev + text);
        },
        onFiles: (paths) => setOpenedFiles((prev) => [...prev, ...paths]),
        onReset: () => {
          setStreamed('');
          setRereading(true);
        },
      }, abortRef.current.signal);
    },
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
      // The persisted message now renders from cache; drop the partial copy.
      setStreamed('');
      setOpenedFiles([]);
      setIntent(null);
      setContextFiles([]);
      setRereading(false);
    },
    onError: (error, vars) => {
      // AbortError means the reader pressed Stop — not something to apologise for.
      if (error instanceof Error && error.name === 'AbortError') {
        setStreamed('');
        setOpenedFiles([]);
        setIntent(null);
        setContextFiles([]);
        setRereading(false);
        return;
      }
      const message =
        error instanceof ApiClientError
          ? error.apiError.message
          : error instanceof Error
            ? error.message
            : 'Something went wrong generating the explanation.';
      setFailed({ question: vars.question, message });
      setStreamed('');
      setOpenedFiles([]);
      setIntent(null);
      setContextFiles([]);
      setRereading(false);
    },
  });

  /** Cancels the answer in progress; the server cancels the model call too. */
  const stop = () => abortRef.current?.abort();

  return Object.assign(mutation, {
    failed,
    dismissFailure: () => setFailed(null),
    streamed,
    openedFiles,
    intent,
    contextFiles,
    rereading,
    stop,
  });
}

/** Renames a conversation, updating the list in place. */
export function useRenameConversation(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cid, title }: { cid: string; title: string }) =>
      explainApi.renameConversation(repoId, cid, title),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.all(repoId) });
    },
    onError: () => toast.error('Rename failed', 'Could not rename that chat.'),
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
