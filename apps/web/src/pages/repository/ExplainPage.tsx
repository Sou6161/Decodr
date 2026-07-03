import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { ExplainResponse, Repository } from '@arcloom/types';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { SparkIcon } from '@/components/icons';
import { useExplain } from '@/features/explain/hooks';
import { useRepositoryGraph } from '@/features/graph/hooks';
import { Markdown } from '@/features/explain/Markdown';
import { ApiClientError } from '@/services/apiClient';

interface Exchange {
  question: string;
  response: ExplainResponse;
}

export function ExplainPage() {
  const repo = useOutletContext<Repository>();
  const explain = useExplain(repo.id);
  const { data: graph } = useRepositoryGraph(repo.id);

  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Exchange[]>([]);
  const pendingQuestion = useRef<string>('');

  const suggestions = useMemo(() => buildSuggestions(graph?.nodes ?? []), [graph]);

  const submit = (question: string) => {
    const q = question.trim();
    if (q.length < 3 || explain.isPending) return;
    pendingQuestion.current = q;
    setInput('');
    explain.mutate(q, {
      onSuccess: (response) => setHistory((h) => [...h, { question: q, response }]),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const errorMessage =
    explain.isError && explain.error instanceof ApiClientError
      ? explain.error.apiError.message
      : explain.isError
        ? 'Something went wrong generating the explanation.'
        : null;

  const empty = history.length === 0 && !explain.isPending && !errorMessage;

  return (
    <div className="mx-auto max-w-3xl">
      {empty && (
        <div className="mb-6 rounded-2xl border border-border bg-surface/50 p-6">
          <div className="flex items-center gap-2 text-primary">
            <SparkIcon width={18} height={18} />
            <h3 className="text-sm font-semibold text-foreground">Ask about the architecture</h3>
          </div>
          <p className="mt-1.5 text-sm text-muted">
            Arcloom finds the components and files your question is about and explains just
            that part — it never reads the whole repo at once.
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

      <div className="space-y-4">
        {history.map((ex, idx) => (
          <ExchangeCard key={idx} exchange={ex} />
        ))}

        <AnimatePresence>
          {explain.isPending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="p-5">
                <p className="text-sm font-medium text-foreground">{pendingQuestion.current}</p>
                <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <Spinner className="h-4 w-4 text-primary" />
                  Reading the relevant files…
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {errorMessage && (
          <Card className="border-danger/30 bg-danger/5 p-5">
            <p className="text-sm font-medium text-foreground">{pendingQuestion.current}</p>
            <p className="mt-2 text-sm text-danger">{errorMessage}</p>
          </Card>
        )}
      </div>

      <form onSubmit={onSubmit} className="sticky bottom-4 mt-4">
        <div className="flex items-end gap-2 rounded-2xl border border-border glass p-2 shadow-lg shadow-black/20">
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
            placeholder="e.g. Explain how the Dashboard works"
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle"
          />
          <Button type="submit" disabled={input.trim().length < 3 || explain.isPending}>
            Ask
          </Button>
        </div>
      </form>
    </div>
  );
}

function ExchangeCard({ exchange }: { exchange: Exchange }) {
  const { question, response } = exchange;
  return (
    <Card className="p-5">
      <p className="text-sm font-semibold text-foreground">{question}</p>
      <div className="mt-3 border-t border-border pt-4">
        <Markdown content={response.answer} />
      </div>
      {response.contextPaths.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-subtle">
            Context · {response.contextPaths.length} file
            {response.contextPaths.length === 1 ? '' : 's'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {response.contextPaths.map((path) => (
              <Badge key={path} className="font-mono">
                {path}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-subtle">
            Generated by {response.model} via {response.provider}
          </p>
        </div>
      )}
    </Card>
  );
}

/** Builds example questions, seeding one from the graph's most-central component. */
function buildSuggestions(nodes: { data: { name: string; importedByCount: number } }[]): string[] {
  const base = [
    'How is routing set up?',
    'How are the components connected?',
    'Which components are most important?',
  ];
  const hub = [...nodes].sort((a, b) => b.data.importedByCount - a.data.importedByCount)[0];
  return hub ? [`Explain ${hub.data.name}`, ...base] : base;
}
