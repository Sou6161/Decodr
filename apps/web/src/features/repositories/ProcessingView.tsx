import { motion } from 'framer-motion';
import type { RepositoryProgress } from '@decodr/types';
import { RepositoryStatus } from '@decodr/types';
import { Card, Spinner } from '@/components/ui';
import { Train } from '@/components/transit';
import { cn } from '@/utils/cn';

const STAGES: { status: RepositoryStatus; label: string }[] = [
  { status: RepositoryStatus.Extracting, label: 'Extracting archive' },
  { status: RepositoryStatus.Scanning, label: 'Scanning files' },
  { status: RepositoryStatus.Analyzing, label: 'Analyzing components' },
  { status: RepositoryStatus.Ready, label: 'Ready' },
];

const ORDER: RepositoryStatus[] = [
  RepositoryStatus.Pending,
  RepositoryStatus.Extracting,
  RepositoryStatus.Scanning,
  RepositoryStatus.Analyzing,
  RepositoryStatus.Ready,
];

/**
 * Analysis progress as a journey: the stages are stations on one line, the
 * line fills in as the percentage climbs, and a train sits where the work is.
 */
export function ProcessingView({ progress }: { progress: RepositoryProgress }) {
  const failed = progress.status === RepositoryStatus.Failed;
  const currentIndex = ORDER.indexOf(progress.status);
  const percent = Math.max(0, Math.min(100, progress.percent));
  const lineColor = failed ? 'var(--color-danger)' : 'var(--color-line-teal)';

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-center gap-3">
        {!failed && <Spinner className="h-4 w-4 text-primary" />}
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {failed ? 'Out of service: analysis failed' : 'On its way'}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{progress.message}</p>
        </div>
        <span className="ml-auto font-mono text-sm tabular-nums text-subtle">{Math.round(percent)}%</span>
      </div>

      <div className="relative mx-3 mb-2 mt-10 sm:mx-6">
        {/* Track still to travel */}
        <span className="absolute inset-x-0 top-1/2 h-[7px] -translate-y-1/2 rounded-full bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_14px,transparent_14px_22px)]" />
        {/* Track already travelled */}
        <motion.span
          className="absolute left-0 top-1/2 h-[7px] -translate-y-1/2 rounded-full"
          style={{ background: lineColor }}
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />

        <div className="relative flex justify-between">
          {STAGES.map((stage) => {
            const stageIndex = ORDER.indexOf(stage.status);
            const done = !failed && currentIndex >= stageIndex;
            return (
              <span
                key={stage.status}
                className={cn(
                  'relative z-10 h-5 w-5 rounded-full border-[4px] bg-surface',
                  !done && 'border-border-strong',
                )}
                style={done ? { borderColor: lineColor } : undefined}
              />
            );
          })}
        </div>

        {!failed && (
          <motion.span
            className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
            initial={false}
            animate={{ left: `${percent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <Train horizontal />
          </motion.span>
        )}
      </div>

      <div className="mx-0 flex justify-between gap-2 sm:mx-2">
        {STAGES.map((stage) => {
          const active = progress.status === stage.status;
          const done = currentIndex > ORDER.indexOf(stage.status);
          return (
            <span
              key={stage.status}
              className={cn(
                'w-24 text-center text-xs first:text-left last:text-right',
                active ? 'font-semibold text-foreground' : done ? 'text-muted' : 'text-subtle',
              )}
            >
              {stage.label}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
