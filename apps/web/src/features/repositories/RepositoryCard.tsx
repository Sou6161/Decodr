import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Repository } from '@decodr/types';
import { Badge, Card, ConfirmDialog } from '@/components/ui';
import { ArrowRightIcon, TrashIcon } from '@/components/icons';
import { lineColorFor } from '@/components/transit';
import { STATUS_META } from './statusMeta';
import { useDeleteRepository } from './hooks';

const STAT = (label: string, value: number) => ({ label, value });

export function RepositoryCard({ repository }: { repository: Repository }) {
  const status = STATUS_META[repository.status];
  const [confirmOpen, setConfirmOpen] = useState(false);
  const del = useDeleteRepository();
  const color = lineColorFor(repository.name);

  const stats = [
    STAT('Files', repository.fileCount),
    STAT('Components', repository.componentCount),
    STAT('Hooks', repository.hookCount),
    STAT('Routes', repository.routeCount),
  ];

  // The delete button and its dialog sit OUTSIDE the Link on purpose: nested
  // inside it, a click on "Delete" bubbles up and navigates to the project that
  // was just removed.
  return (
    <div className="group relative h-full">
      <Link to={`/repositories/${repository.id}`} className="block h-full">
        <Card className="relative h-full overflow-hidden p-5 pt-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
          <div className="flex items-start justify-between gap-3 pr-8">
            <h3 className="truncate font-display text-base font-bold text-foreground">
              {repository.name}
            </h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>

          {/* The four counts as stops along this project's line. */}
          <div className="relative mt-6">
            <span
              aria-hidden
              className="absolute left-[12.5%] right-[12.5%] top-[6px] h-[5px] rounded-full"
              style={{ background: color }}
            />
            <div className="relative grid grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="flex min-w-0 flex-col items-center text-center">
                  <span
                    aria-hidden
                    className="h-4 w-4 rounded-full border-[3px] bg-surface"
                    style={{ borderColor: color }}
                  />
                  <div className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">
                    {s.value}
                  </div>
                  <div className="w-full truncate text-[11px] text-subtle">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-subtle">
              {new Date(repository.createdAt).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-muted transition-colors group-hover:text-primary">
              Open
              <ArrowRightIcon width={14} height={14} />
            </span>
          </div>
        </Card>
      </Link>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={`Delete ${repository.name}`}
        className="absolute right-3 top-3 rounded-lg p-1.5 text-subtle opacity-0 transition-all hover:bg-danger/15 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon width={16} height={16} />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete project?"
        description={`"${repository.name}" and its analysis will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() => del.mutate(repository.id, { onSuccess: () => setConfirmOpen(false) })}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
