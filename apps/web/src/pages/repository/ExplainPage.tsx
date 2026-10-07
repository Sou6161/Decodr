import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Repository } from '@decodr/types';
import { MessageRole } from '@decodr/types';
import { Button, Card, Skeleton, Spinner } from '@/components/ui';
import { SparkIcon } from '@/components/icons';
import { useRepositoryGraph } from '@/features/graph/hooks';
import { useAsk, useConversation } from '@/features/explain/hooks';
import { ChatMessages, UserBubble } from '@/features/explain/ChatMessages';
import { exportConversation } from '@/features/explain/exportChat';
import { Markdown } from '@/features/explain/Markdown';
import { cn } from '@/utils/cn';

/** Must match the server's schema, or long questions fail only after sending. */
const MAX_QUESTION = 4000;

export function ExplainPage() {
  const repo = useOutletContext<Repository>();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const setActive = (id: string | null) => setParams(id ? { c: id } : {});

  const [input, setInput] = useState('');
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

  const messages = active.data?.messages ?? [];
  const showEmpty = !activeId || active.isError;
  // Reloading a saved chat renders nothing until the fetch lands. That blank
  // screen reads as "my conversation is gone", so show its shape while loading.
  const restoring = Boolean(activeId) && active.isLoading;

  const suggestions = useMemo(() => buildSuggestions(graph?.nodes ?? []), [graph]);

  const followUps = useMemo(
    () => buildFollowUps(messages, graph?.nodes ?? []),
    [messages, graph],
  );

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
    ask.mutate(
      {
        question: q,
        ...(activeId ? { conversationId: activeId } : {}),
      },
      {
        onSuccess: ({ conversation }) => setActive(conversation.id),
      },
    );
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

  return (
    <div className="mx-auto max-w-4xl">
      {active.data && messages.length > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => exportConversation(active.data!, repo.name)}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
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
              <h3 className="text-sm font-semibold text-foreground">Ask about the architecture</h3>
            </div>
            <p className="mt-1.5 text-sm text-muted">
              Decodr finds the components and files your question is about and explains just
              that part — it never reads the whole repo at once. Chats are saved in the sidebar.
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
            onEdit={(content) => {
              setInput(content);
              inputRef.current?.focus();
            }}
            onRegenerate={(question) => submit(question)}
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
                    <Markdown content={ask.streamed} />
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
        <div className="rounded-2xl border border-border glass p-2 shadow-lg shadow-black/20">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              maxLength={MAX_QUESTION}
              placeholder={activeId ? 'Ask a follow-up…' : 'e.g. Explain how the Dashboard works'}
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
              Answers match the question — ask narrowly for a quick one, broadly for a walkthrough.
            </span>
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
    </div>
  );
}

/**
 * What to show while waiting. The server says up front what kind of message this
 * is, so a greeting no longer claims the codebase is being read.
 */
function waitingLabel(intent: string | null): string {
  if (intent === 'smalltalk') return 'Typing…';
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
