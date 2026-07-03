import { Link } from 'react-router-dom';
import type { Repository } from '@arcloom/types';
import { Badge, Card } from '@/components/ui';
import { ArrowRightIcon } from '@/components/icons';
import { STATUS_META } from './statusMeta';

const STAT = (label: string, value: number) => ({ label, value });

export function RepositoryCard({ repository }: { repository: Repository }) {
  const status = STATUS_META[repository.status];
  const stats = [
    STAT('Files', repository.fileCount),
    STAT('Components', repository.componentCount),
    STAT('Hooks', repository.hookCount),
    STAT('Routes', repository.routeCount),
  ];

  return (
    <Link to={`/repositories/${repository.id}`} className="group block">
      <Card className="h-full p-5 transition-all duration-200 hover:border-border-strong hover:bg-surface-raised/60">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {repository.name}
          </h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-lg font-semibold tabular-nums text-foreground">
                {s.value}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-subtle">
                {s.label}
              </div>
            </div>
          ))}
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
  );
}
