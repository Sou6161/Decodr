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
    body: { conversationId?: string; question: string },
  ) => apiClient.post<AskResponse>(`/repositories/${repoId}/conversations/ask`, body),
  renameConversation: (repoId: string, cid: string, title: string) =>
    apiClient.patch<void>(`/repositories/${repoId}/conversations/${cid}`, { title }),
  deleteConversation: (repoId: string, cid: string) =>
    apiClient.delete<void>(`/repositories/${repoId}/conversations/${cid}`),
};

/** Events the streaming endpoint emits, in the order they arrive. */
/** What kind of message the server decided this is. */
export type AskIntent = 'smalltalk' | 'overview' | 'code';

export interface AskStreamHandlers {
  /** Fired before any slow work, so the UI can describe it honestly. */
  onStart: (intent: AskIntent) => void;
  /** Files retrieval selected, available within milliseconds of asking. */
  onContext: (paths: string[]) => void;
  onDelta: (text: string) => void;
  onFiles: (paths: string[]) => void;
  /** Drop what has been shown so far — it was preamble before a tool call. */
  onReset: () => void;
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/**
 * Asks a question over Server-Sent Events, surfacing the answer as it is
 * written. Resolves with the same payload the non-streaming endpoint returns,
 * so callers update their cache identically.
 *
 * Hand-rolled rather than using EventSource, which cannot send a POST body.
 */
export async function askStream(
  repoId: string,
  body: { conversationId?: string; question: string },
  handlers: AskStreamHandlers,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const res = await fetch(`${BASE_URL}/api/repositories/${repoId}/conversations/ask/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!res.ok || !res.body) {
    // Errors before the stream opens come back as ordinary JSON.
    const message = await res
      .json()
      .then((d: { error?: { message?: string } }) => d.error?.message)
      .catch(() => undefined);
    throw new Error(message ?? 'Could not start the explanation.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: AskResponse | null = null;
  let failure: string | null = null;

  // SSE frames are separated by a blank line and can split across chunks.
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });

    let split: number;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      const event = /^event: (.*)$/m.exec(frame)?.[1];
      const raw = /^data: (.*)$/m.exec(frame)?.[1];
      if (!event || !raw) continue;
      const data = JSON.parse(raw) as Record<string, never>;

      if (event === 'start') handlers.onStart(data.intent as unknown as AskIntent);
      else if (event === 'context') handlers.onContext(data.paths as unknown as string[]);
      else if (event === 'delta') handlers.onDelta(data.text as unknown as string);
      else if (event === 'files') handlers.onFiles(data.paths as unknown as string[]);
      else if (event === 'reset') handlers.onReset();
      else if (event === 'done') done = data as unknown as AskResponse;
      else if (event === 'error') failure = data.message as unknown as string;
    }
  }

  if (failure) throw new Error(failure);
  if (!done) throw new Error('The explanation ended unexpectedly.');
  return done;
}

export const conversationKeys = {
  all: (repoId: string) => ['repositories', repoId, 'conversations'] as const,
  detail: (repoId: string, cid: string) =>
    ['repositories', repoId, 'conversations', cid] as const,
};
