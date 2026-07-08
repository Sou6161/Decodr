import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Repository } from '@decodr/types';
import { Button, Card, Spinner } from '@/components/ui';
import { SparkIcon } from '@/components/icons';
import { useRepositoryGraph } from '@/features/graph/hooks';
import { useAsk, useConversation } from '@/features/explain/hooks';
import { ChatMessages } from '@/features/explain/ChatMessages';
import { cn } from '@/utils/cn';

type Mode = 'quick' | 'detailed';

export function ExplainPage() {
  const repo = useOutletContext<Repository>();
  const [params, setParams] = useSearchParams();
  const activeId = params.get('c');
  const setActive = (id: string | null) => setParams(id ? { c: id } : {});

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>(
    () => (localStorage.getItem('decodr.explainMode') as Mode | null) ?? 'detailed',
  );
  const pendingQuestion = useRef('');
  const scrollAnchor = useRef<HTMLDivElement>(null);

  const setModePersisted = (m: Mode) => {
    setMode(m);
    localStorage.setItem('decodr.explainMode', m);
  };

  const active = useConversation(repo.id, activeId);
  const ask = useAsk(repo.id);
  const { data: graph } = useRepositoryGraph(repo.id);

  const messages = active.data?.messages ?? [];
  const showEmpty = !activeId || active.isError;

  const suggestions = useMemo(() => buildSuggestions(graph?.nodes ?? []), [graph]);

  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, ask.isPending]);

  const submit = (question: string) => {
    const q = question.trim();
    if (q.length < 3 || ask.isPending) return;
    pendingQuestion.current = q;
    setInput('');
    ask.mutate(
      {
        question: q,
        detailed: mode === 'detailed',
        ...(activeId ? { conversationId: activeId } : {}),
      },
      { onSuccess: ({ conversation }) => setActive(conversation.id) },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  return (
    <div className="mx-auto max-w-4xl">
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

        {!showEmpty && <ChatMessages messages={messages} />}

        <AnimatePresence>
          {ask.isPending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-foreground">
                  {pendingQuestion.current}
                </div>
              </div>
              <Card className="mt-4 p-5">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Spinner className="h-4 w-4 text-primary" />
                  {mode === 'detailed'
                    ? 'Reading the codebase in depth…'
                    : 'Reading the relevant files…'}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={scrollAnchor} />
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-4 mt-4">
        <div className="rounded-2xl border border-border glass p-2 shadow-lg shadow-black/20">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={1}
              placeholder={activeId ? 'Ask a follow-up…' : 'e.g. Explain how the Dashboard works'}
              className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle"
            />
            <Button type="submit" disabled={input.trim().length < 3 || ask.isPending}>
              Ask
            </Button>
          </div>

          <div className="flex items-center gap-2 px-2 pb-0.5 pt-1">
            <div className="inline-flex rounded-lg border border-border bg-surface-raised p-0.5">
              {(['quick', 'detailed'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModePersisted(m)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                    mode === m
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted hover:text-foreground',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-subtle">
              {mode === 'detailed'
                ? 'Full context, exhaustive answer — slower.'
                : 'Focused answer — fast.'}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
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
