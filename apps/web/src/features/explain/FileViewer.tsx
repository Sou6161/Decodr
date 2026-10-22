import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Spinner } from '@/components/ui';
import { useFileContent } from './hooks';
import { cn } from '@/utils/cn';

/**
 * Reads a file from the project, beside the answer that cited it.
 *
 * Answers name files and line numbers constantly, and until now those were
 * characters on a screen: checking one meant going back to your editor and
 * finding it by hand, which nobody does, which means answers were taken on
 * trust. Opening the source next to the claim is what makes a citation worth
 * printing.
 */

/** A cited location: a path, and the line the answer pointed at. */
export interface FileTarget {
  path: string;
  line?: number;
}

export function FileViewer({
  repoId,
  target,
  onClose,
}: {
  repoId: string;
  target: FileTarget | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useFileContent(repoId, target?.path ?? null);
  const [wrap, setWrap] = useState(false);
  const [copied, setCopied] = useState(false);
  const lineRef = useRef<HTMLDivElement>(null);

  // Esc closes, as it does for the composer and every dialog in the app.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  // Jump to the cited line once the source has rendered. Opening a 600-line
  // file at the top when the answer pointed at line 412 is not an answer.
  useEffect(() => {
    if (!data || !target?.line) return;
    lineRef.current?.scrollIntoView({ block: 'center' });
  }, [data, target?.line]);

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked; the text is still selectable.
    }
  };

  const lines = data?.content.split('\n') ?? [];
  const gutterWidth = `${String(lines.length).length + 1}ch`;

  return (
    <AnimatePresence>
      {target && (
        <>
          {/* Tapping away closes it. On a phone the panel is full width, so
              this is mostly here for the desktop layout. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
            aria-hidden
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            role="dialog"
            aria-label={`Source of ${target.path}`}
            className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-2xl sm:w-[min(46rem,85vw)]"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-foreground" title={target.path}>
                  {target.path}
                </p>
                <p className="mt-0.5 text-[11px] text-subtle">
                  {data ? `${data.lineCount} lines` : 'Loading…'}
                  {target.line ? ` · jumped to line ${target.line}` : ''}
                  {data?.truncated ? ' · stored copy is capped' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWrap((v) => !v)}
                className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {wrap ? 'No wrap' : 'Wrap'}
              </button>
              <button
                type="button"
                onClick={copy}
                className="rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close file"
                className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                ✕
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-auto">
              {isLoading && (
                <div className="flex items-center gap-2 p-4 text-sm text-muted">
                  <Spinner className="h-4 w-4 text-primary" />
                  Opening {target.path.split('/').pop()}…
                </div>
              )}
              {error && (
                <p className="p-4 text-sm text-muted">
                  {error instanceof Error ? error.message : 'Could not open that file.'}
                </p>
              )}
              {data && (
                <pre
                  className={cn(
                    'min-w-full py-2 font-mono text-xs leading-relaxed',
                    wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
                  )}
                >
                  <code>
                    {lines.map((text, i) => {
                      const n = i + 1;
                      const isTarget = n === target.line;
                      return (
                        <div
                          key={n}
                          {...(isTarget ? { ref: lineRef } : {})}
                          className={cn('flex', isTarget && 'bg-primary/15')}
                        >
                          <span
                            aria-hidden
                            style={{ width: gutterWidth }}
                            className={cn(
                              'sticky left-0 shrink-0 select-none bg-surface pr-3 text-right tabular-nums',
                              isTarget ? 'text-primary' : 'text-subtle/60',
                            )}
                          >
                            {n}
                          </span>
                          {/* A zero-width space keeps empty lines at full
                              height, so the gutter stays aligned with the code. */}
                          <span className="pr-4">{text || '​'}</span>
                        </div>
                      );
                    })}
                  </code>
                </pre>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
