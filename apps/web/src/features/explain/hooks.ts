import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationWithMessages } from '@decodr/types';
import { askStream, conversationKeys, explainApi, fileKeys, type AskIntent } from './api';
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
 * How long to wait before re-reading a thread for the things the server
 * generates after the answer: its title and its follow-up suggestions. Both are
 * short completions that start only once the answer has been sent, so a second
 * and a half covers them without the refetch reading as a flicker.
 */
const BACKGROUND_SETTLE_MS = 1500;

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
    mutationFn: (vars: { conversationId?: string; question: string }) => {
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
      // A new thread is saved under a placeholder title and renamed by the
      // server a moment later, once the model has read the question. Pick that
      // up so the sidebar settles on the real name instead of showing the
      // opening clause until the next navigation.
      // Both the generated title (on the list) and the generated follow-ups (on
      // the answer, in the detail query) land shortly after the answer itself.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.all(repoId) });
        void queryClient.invalidateQueries({
          queryKey: conversationKeys.detail(repoId, conversation.id),
        });
      }, BACKGROUND_SETTLE_MS);
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

/**
 * Every path in the project, for @-mention autocomplete.
 *
 * Cached indefinitely: a project's file list cannot change after it has been
 * scanned, so re-fetching it while someone types would be pure waste.
 */
export function useFilePaths(repoId: string) {
  return useQuery({
    queryKey: fileKeys.list(repoId),
    queryFn: async () => (await explainApi.listFiles(repoId)).files,
    staleTime: Infinity,
  });
}

/** One file's source, for the viewer. Enabled only while a file is open. */
export function useFileContent(repoId: string, path: string | null) {
  return useQuery({
    queryKey: fileKeys.content(repoId, path ?? ''),
    queryFn: () => explainApi.getFile(repoId, path as string),
    enabled: Boolean(path),
    staleTime: Infinity,
  });
}

/**
 * Rates an answer. The rating is written into the cached conversation straight
 * away — a thumb that waits for a round trip feels broken.
 */
export function useRateMessage(repoId: string, cid: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mid, feedback, note }: { mid: string; feedback: 1 | -1 | null; note?: string }) =>
      explainApi.rateMessage(repoId, cid as string, mid, feedback, note),
    onMutate: ({ mid, feedback }) => {
      if (!cid) return;
      queryClient.setQueryData<ConversationWithMessages>(
        conversationKeys.detail(repoId, cid),
        (old) =>
          old
            ? {
                ...old,
                messages: old.messages.map((m) => (m.id === mid ? { ...m, feedback } : m)),
              }
            : old,
      );
    },
    onError: () => {
      toast.error('Could not save that', 'Your rating was not recorded.');
      if (cid) {
        void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(repoId, cid) });
      }
    },
  });
}

/**
 * Rewinds a thread to just before a message, so an edited question replaces the
 * turn instead of being appended under a near-identical one.
 */
export function useRewind(repoId: string, cid: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mid: string) => explainApi.rewindTo(repoId, cid as string, mid),
    onSuccess: (_data, mid) => {
      if (!cid) return;
      // Drop the deleted turns locally rather than refetching, so the thread
      // rewinds in the same frame the new question is sent.
      queryClient.setQueryData<ConversationWithMessages>(
        conversationKeys.detail(repoId, cid),
        (old) => {
          if (!old) return old;
          const idx = old.messages.findIndex((m) => m.id === mid);
          return idx === -1 ? old : { ...old, messages: old.messages.slice(0, idx) };
        },
      );
    },
    onError: () => toast.error('Could not edit that', 'The thread was left unchanged.'),
  });
}

/** Mints or revokes a read-only share link for a thread. */
export function useShare(repoId: string, cid: string | null) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: conversationKeys.all(repoId) });
    if (cid) {
      void queryClient.invalidateQueries({ queryKey: conversationKeys.detail(repoId, cid) });
    }
  };
  const share = useMutation({
    mutationFn: () => explainApi.share(repoId, cid as string),
    onSuccess: refresh,
    onError: () => toast.error('Could not create a link', 'Sharing failed.'),
  });
  const unshare = useMutation({
    mutationFn: () => explainApi.unshare(repoId, cid as string),
    onSuccess: () => {
      refresh();
      toast.success('Link revoked', 'The old link no longer works.');
    },
    onError: () => toast.error('Could not revoke the link', 'Try again.'),
  });
  return { share, unshare };
}

/** Reads a shared transcript by token. No session involved. */
export function useSharedConversation(token: string) {
  return useQuery({
    queryKey: ['shared', token],
    queryFn: () => explainApi.getShared(token),
    retry: false,
  });
}
