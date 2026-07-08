import type { RepositoryProgress } from '@decodr/types';
import { RepositoryStatus } from '@decodr/types';
import { Card, ProgressBar, Spinner } from '@/components/ui';
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

export function ProcessingView({ progress }: { progress: RepositoryProgress }) {
  const failed = progress.status === RepositoryStatus.Failed;
  const currentIndex = ORDER.indexOf(progress.status);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        {!failed && <Spinner className="h-4 w-4 text-primary" />}
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {failed ? 'Analysis failed' : 'Analyzing repository'}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{progress.message}</p>
        </div>
      </div>

      <ProgressBar
        className="mt-5"
        value={progress.percent}
        tone={failed ? 'danger' : 'primary'}
      />

      {!failed && (
        <ol className="mt-6 space-y-3">
          {STAGES.map((stage) => {
            const stageIndex = ORDER.indexOf(stage.status);
            const done = currentIndex > stageIndex;
            const active = progress.status === stage.status;
            return (
              <li key={stage.status} className="flex items-center gap-3">
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border text-[10px]',
                    done && 'border-success bg-success/20 text-success',
                    active && 'border-primary bg-primary/20 text-primary',
                    !done && !active && 'border-border text-subtle',
                  )}
                >
                  {done ? '✓' : active ? '•' : ''}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    active ? 'font-medium text-foreground' : done ? 'text-muted' : 'text-subtle',
                  )}
                >
                  {stage.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
