import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Message, Repository } from '@decodr/types';
import { MessageRole } from '@decodr/types';
import { Button, Card, Skeleton, Spinner } from '@/components/ui';
import { SparkIcon } from '@/components/icons';
import { useRepositoryGraph } from '@/features/graph/hooks';
import {
  useAsk,
  useConversation,
  useFilePaths,
  useRateMessage,
  useRewind,
  useShare,
} from '@/features/explain/hooks';
import { FileViewer, type FileTarget } from '@/features/explain/FileViewer';
import { useMentions } from '@/features/explain/useMentions';
import { ChatMessages, UserBubble } from '@/features/explain/ChatMessages';
import { exportConversation } from '@/features/explain/exportChat';
import { Markdown } from '@/features/explain/Markdown';
import { cn } from '@/utils/cn';
import { toast } from '@/stores/toastStore';

/** Must match the server's schema, or long questions fail only after sending. */
const MAX_QUESTION = 4000;

/** Shared styling for the per-thread actions above the transcript. */
const threadActionClass =
  'rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50';

export function ExplainPage() {
  const repo = useOutletContext<Repository>();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const setActive = (id: string | null) => setParams(id ? { c: id } : {});

  const [input, setInput] = useState('');
  // Caret position drives @-mention matching: the menu offers completions for
  // the token being typed, not for whatever `@` happens to be last in the box.
  const [caret, setCaret] = useState(0);
  // The file open in the side panel, if any.
  const [viewing, setViewing] = useState<FileTarget | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  // The message an edit will replace, held until the edit is actually sent.
  const [editingFrom, setEditingFrom] = useState<string | null>(null);
  const pendingQuestion = useRef('');
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Auto-scrolling on every token fights the reader when they scroll back to
  // re-read something, so it only follows while they are already at the bottom.
  const [atBottom, setAtBottom] = useState(true);

  // Arriving from the chart with ?q=… asks straight away. Pre-filling the box
  // instead looked the same but left the question unsent, so a click promising
  // "ask about that component" did nothing until you noticed and pressed Ask.
  const seeded = params.get('q');
  const seedHandled = useRef<string | null>(null);

  const active = useConversation(repo.id, activeId);
  const ask = useAsk(repo.id);
  const { data: graph } = useRepositoryGraph(repo.id);
  const { data: filePaths = [] } = useFilePaths(repo.id);
  const rate = useRateMessage(repo.id, activeId);
  const rewind = useRewind(repo.id, activeId);
  const { share, unshare } = useShare(repo.id, activeId);
  const mentions = useMentions(input, caret, filePaths.map((f) => f.path));

  const messages = active.data?.messages ?? [];
  const showEmpty = !activeId || active.isError;
  // Reloading a saved chat renders nothing until the fetch lands. That blank
  // screen reads as "my conversation is gone", so show its shape while loading.
  const restoring = Boolean(activeId) && active.isLoading;

  const suggestions = useMemo(() => buildSuggestions(graph?.nodes ?? []), [graph]);

  // The model writes follow-ups against the answer itself, which lands a moment
  // after it (a background call). The graph-derived chips remain the fallback
  // for older messages and for the gap before the generated ones arrive.
  const followUps = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === MessageRole.Assistant);
    if (last?.followUps.length) return last.followUps;
    return buildFollowUps(messages, graph?.nodes ?? []);
  }, [messages, graph]);

  useEffect(() => {
    if (atBottom) scrollAnchor.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, ask.isPending, ask.streamed, atBottom]);

  useEffect(() => {
    const onScroll = () => {
      const gap =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      setAtBottom(gap < 120);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Esc stops a running answer, matching what people expect from a chat.
  useEffect(() => {
    if (!ask.isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ask.stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);

  const submit = (question: string) => {
    const q = question.trim();
    if (q.length < 3 || q.length > MAX_QUESTION || ask.isPending) return;
    pendingQuestion.current = q;
    setInput('');

    const send = () =>
      ask.mutate(
        {
          question: q,
          ...(activeId ? { conversationId: activeId } : {}),
        },
        {
          onSuccess: ({ conversation }) => setActive(conversation.id),
        },
      );

    // An edit in flight: the turn being replaced has to be gone BEFORE the new
    // question is sent. Firing both at once is a race that loses the new answer
    // — the rewind deletes every message at or after the old one's timestamp,
    // and if the ask lands first, the replies it just wrote are newer than that
    // and get deleted too.
    const rewindFirst = editingFrom;
    setEditingFrom(null);
    if (rewindFirst) {
      rewind.mutate(rewindFirst, {
        onSuccess: send,
        // The thread is unchanged if the rewind failed, so asking again would
        // append a near-duplicate turn. The hook has already said it failed.
        onError: () => setInput(q),
      });
      return;
    }

    send();
  };

  /**
   * Arriving from the chart with ?q=… fills the composer and waits.
   *
   * It used to send the question too, but `submit` clears the input as its first
   * act — so the text was written and wiped in the same tick, and any hiccup in
   * the send left an empty box with nothing to retry. Filling it and letting the
   * reader press Ask has no race in it, and they can reword first.
   */
  useEffect(() => {
    if (!seeded || seedHandled.current === seeded) return;
    seedHandled.current = seeded;
    setInput(seeded);
    inputRef.current?.focus();
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  }, [seeded, params, setParams]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  /**
   * Editing a question rewinds the thread to it, then puts it back in the
   * composer. It used to only prefill, which left the original turn in place —
   * so the thread grew two near-identical questions and the model replayed both
   * as history.
   */
  const editQuestion = (message: Message) => {
    // The thread is rewound when the edit is SENT, not now. Deleting the turn
    // up front meant clicking Edit and then changing your mind destroyed the
    // question and its answer with no way back.
    setEditingFrom(message.id);
    setInput(message.content);
    setCaret(message.content.length);
    inputRef.current?.focus();
  };

  /**
   * Inserts a chosen file into the question, then puts the caret after it so
   * typing carries on where it left off. Without restoring the caret the
   * textarea puts it back at the end, which is only right by coincidence.
   */
  const acceptMention = (path: string) => {
    const next = mentions.accept(path);
    if (!next) return;
    setInput(next.value);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  /**
   * Resumes an answer that stopped at its token ceiling.
   *
   * Sent as a normal turn, because the thread's history is what tells the model
   * where it stopped. It does read as a short question in the transcript, which
   * is honest: the reader did ask for more.
   */
  const continueAnswer = () => submit('Continue from where you stopped.');

  const copyShareLink = async (token: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', 'Anyone with it can read this chat.');
    } catch {
      toast.info('Share link', url);
    }
  };

  // ⌘K starts a new chat, ⌘/ explains the shortcuts. Both are what a chat app
  // is expected to do, and neither has a button worth spending space on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setParams({});
        setInput('');
        setEditingFrom(null);
        inputRef.current?.focus();
      }
      if (mod && e.key === '/') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setParams]);

  return (
    <div className="mx-auto max-w-4xl">
      {active.data && messages.length > 0 && (
        <div className="mb-3 flex items-center justify-end gap-2">
          {active.data.shareToken ? (
            <>
              <button
                type="button"
                onClick={() => void copyShareLink(active.data!.shareToken!)}
                className={threadActionClass}
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={() => unshare.mutate()}
                disabled={unshare.isPending}
                className={threadActionClass}
              >
                Stop sharing
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() =>
                share.mutate(undefined, {
                  onSuccess: ({ shareToken }) => {
                    if (shareToken) void copyShareLink(shareToken);
                  },
                })
              }
              disabled={share.isPending}
              className={threadActionClass}
              title="Create a read-only link to this chat"
            >
              {share.isPending ? 'Creating link…' : 'Share'}
            </button>
          )}
          <button
            type="button"
            onClick={() => exportConversation(active.data!, repo.name)}
            className={threadActionClass}
          >
            Export as Markdown
          </button>
        </div>
      )}
      <div className="space-y-4">
        {showEmpty && !ask.isPending && (
          <div className="rounded-2xl border border-border bg-surface/50 p-6">
            <div className="flex items-center gap-2 text-primary">
              <SparkIcon width={18} height={18} />
              <h3 className="text-sm font-semibold text-foreground">Ask about this project</h3>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              Questions about the code get answered from the files they're actually about — never
              the whole repo at once. General React and TypeScript questions get answered too.
              Chats are saved in the sidebar.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {restoring && (
          <div className="space-y-6" aria-label="Loading conversation">
            <div className="flex justify-end">
              <Skeleton className="h-10 w-2/5 rounded-2xl" />
            </div>
            <Skeleton className="h-40 rounded-2xl" />
            <div className="flex justify-end">
              <Skeleton className="h-10 w-1/3 rounded-2xl" />
            </div>
          </div>
        )}

        {!showEmpty && !restoring && (
          <ChatMessages
            messages={messages}
            onEdit={editQuestion}
            onRegenerate={(question) => submit(question)}
            onOpenFile={(path, line) => setViewing(line ? { path, line } : { path })}
            onRate={(mid, feedback) => rate.mutate({ mid, feedback })}
            onContinue={continueAnswer}
          />
        )}

        <AnimatePresence>
          {ask.isPending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <UserBubble content={pendingQuestion.current} />
              <Card className="mt-4 p-5">
                {ask.rereading && ask.streamed === '' && (
                  <p className="mb-2 text-[11px] text-subtle">
                    Opened more files — starting the answer again with them.
                  </p>
                )}
                {ask.streamed ? (
                  <>
                    <Markdown
                      content={ask.streamed}
                      onOpenFile={(path, line) => setViewing(line ? { path, line } : { path })}
                    />
                    <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-text-bottom" />
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <Spinner className="h-4 w-4 text-primary" />
                    {ask.rereading
                      ? 'Re-reading with the new files…'
                      : ask.contextFiles.length > 0
                        ? `Read ${ask.contextFiles.length} file${
                            ask.contextFiles.length === 1 ? '' : 's'
                          } · writing the answer…`
                        : waitingLabel(ask.intent)}
                  </div>
                )}
                {ask.openedFiles.length > 0 && (
                  <p className="mt-3 border-t border-border pt-2 text-[11px] text-subtle">
                    Opened {ask.openedFiles.length} more file
                    {ask.openedFiles.length === 1 ? '' : 's'}:{' '}
                    <span className="font-mono text-primary">
                      {ask.openedFiles.join(', ')}
                    </span>
                  </p>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* A failed answer stays in the thread with a way to run it again,
            rather than vanishing with a toast and leaving no trace of what
            was asked or why it did not work. */}
        {ask.failed && !ask.isPending && (
          <Card className="border-danger/40 p-4">
            <UserBubble content={ask.failed.question} />
            <p className="mt-3 text-sm text-muted">{ask.failed.message}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => submit(ask.failed!.question)}>
                Try again
              </Button>
              <Button size="sm" variant="ghost" onClick={() => ask.dismissFailure()}>
                Dismiss
              </Button>
            </div>
          </Card>
        )}

        {/* Next questions drawn from the graph around what was just read, so
            they point somewhere real rather than being generic prompts. */}
        {!ask.isPending && messages.length > 0 && followUps.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {followUps.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => submit(f)}
                className="rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {f}
              </button>
            ))}
          </div>
        )}

        <div ref={scrollAnchor} />
      </div>

      {/* Only shown once they have scrolled away from the live output. */}
      {!atBottom && (messages.length > 0 || ask.isPending) && (
        <button
          type="button"
          onClick={() => scrollAnchor.current?.scrollIntoView({ behavior: 'smooth' })}
          className="sticky bottom-24 z-10 ml-auto flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-lg shadow-black/30 transition-colors hover:border-border-strong hover:text-foreground"
        >
          ↓ Jump to latest
        </button>
      )}

      <form onSubmit={onSubmit} className="sticky bottom-4 mt-4">
        <div className="relative rounded-2xl border border-border glass p-2 shadow-lg shadow-black/20">
          {/* Mention menu. Sits above the composer because the composer is
              itself pinned to the bottom of the viewport. */}
          {mentions.open && (
            <ul
              role="listbox"
              aria-label="Files"
              className="absolute bottom-full left-0 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-xl shadow-black/30"
            >
              {mentions.suggestions.map((path, i) => (
                <li key={path}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === mentions.active}
                    onMouseEnter={() => mentions.setActive(i)}
                    onClick={() => acceptMention(path)}
                    className={cn(
                      'flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left',
                      i === mentions.active ? 'bg-surface-raised' : 'hover:bg-surface-raised/60',
                    )}
                  >
                    <span className="truncate font-mono text-xs text-foreground">
                      {path.split('/').pop()}
                    </span>
                    <span className="truncate font-mono text-[10px] text-subtle">{path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setCaret(e.target.selectionStart);
              }}
              onClick={(e) => setCaret(e.currentTarget.selectionStart)}
              onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
              onKeyDown={(e) => {
                // While the mention menu is open it owns the arrows, Tab, Enter
                // and Escape — pressing Enter to pick a file must not also send
                // the half-written question.
                if (mentions.open) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    mentions.setActive((mentions.active + 1) % mentions.suggestions.length);
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    mentions.setActive(
                      (mentions.active - 1 + mentions.suggestions.length) %
                        mentions.suggestions.length,
                    );
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    acceptMention(mentions.suggestions[mentions.active]!);
                    return;
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    mentions.close();
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              maxLength={MAX_QUESTION}
              placeholder={
                activeId
                  ? 'Ask a follow-up…  (@ to name a file)'
                  : 'Ask about this code, or anything React  (@ to name a file)'
              }
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle"
            />
            {ask.isPending ? (
              /* Stopping cancels the upstream model call, not just the display. */
              <Button type="button" variant="secondary" onClick={() => ask.stop()}>
                Stop
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={input.trim().length < 3 || input.length > MAX_QUESTION}
              >
                Ask
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 px-2 pb-0.5 pt-1">
            {/* There used to be a Quick/Detailed toggle here. Nobody can judge
                how much explanation they need before reading the answer, and the
                question already says: the model matches depth to what was asked. */}
            <span className="text-[11px] text-subtle">
              Answers match the question. Type{' '}
              <kbd className="rounded border border-border px-1 font-mono">@</kbd> to point at a
              file, or paste an error.
            </span>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="text-[11px] text-subtle underline-offset-2 hover:text-foreground hover:underline"
            >
              Shortcuts
            </button>
            {/* Only appears as the limit gets close, so it is not noise. */}
            {input.length > MAX_QUESTION * 0.8 && (
              <span
                className={cn(
                  'ml-auto text-[11px] tabular-nums',
                  input.length > MAX_QUESTION ? 'text-danger' : 'text-subtle',
                )}
              >
                {input.length.toLocaleString()} / {MAX_QUESTION.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </form>

      <FileViewer repoId={repo.id} target={viewing} onClose={() => setViewing(null)} />
      <ShortcutSheet open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

/** The keyboard shortcuts, behind ⌘/ and the link under the composer. */
function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const rows: [string, string][] = [
    ['Enter', 'Send the question'],
    ['Shift + Enter', 'New line'],
    ['@', 'Point at a file by name'],
    ['Esc', 'Stop the answer being written'],
    ['⌘ / Ctrl + K', 'Start a new chat'],
    ['⌘ / Ctrl + /', 'Show this list'],
  ];
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
        <dl className="mt-3 space-y-2">
          {rows.map(([keys, what]) => (
            <div key={keys} className="flex items-center justify-between gap-4">
              <dt className="text-xs text-muted">{what}</dt>
              <dd>
                <kbd className="rounded border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                  {keys}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-border py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * What to show while waiting. The server says up front what kind of message this
 * is, so a greeting no longer claims the codebase is being read.
 */
function waitingLabel(intent: string | null): string {
  if (intent === 'smalltalk') return 'Typing…';
  // A general programming question is answered from knowledge, so claiming the
  // codebase is being read would be a lie — it only gets opened if the model
  // decides the question was about their code after all.
  if (intent === 'general') return 'Working through it…';
  if (intent === 'overview') return 'Getting an overall picture of the project…';
  if (intent === 'code') return 'Reading the relevant files…';
  // Intent not known yet — say nothing that might turn out to be false.
  return 'Thinking…';
}

/**
 * Up to three next questions, chosen from components the last answer actually
 * mentioned. Generic prompts get ignored; ones naming something the reader just
 * read about do not.
 */
function buildFollowUps(
  messages: { role: string; content: string }[],
  nodes: { data: { name: string; importedByCount: number } }[],
): string[] {
  const last = [...messages].reverse().find((m) => m.role === MessageRole.Assistant);
  if (!last || nodes.length === 0) return [];

  const mentioned = nodes
    .filter((n) => n.data.name.length > 2 && last.content.includes(n.data.name))
    .sort((a, b) => b.data.importedByCount - a.data.importedByCount)
    .slice(0, 2)
    .map((n) => n.data.name);

  const out = mentioned.flatMap((name) => [
    `Where is ${name} used?`,
    `Walk me through ${name} in detail`,
  ]);
  return [...new Set(out)].slice(0, 3);
}

/** Example questions, seeded with the graph's most-central component. */
function buildSuggestions(
  nodes: { data: { name: string; importedByCount: number } }[],
): string[] {
  const base = [
    'How is routing set up?',
    'How are the components connected?',
    'Which components are most important?',
  ];
  const hub = [...nodes].sort((a, b) => b.data.importedByCount - a.data.importedByCount)[0];
  return hub ? [`Explain ${hub.data.name}`, ...base] : base;
}
