import type { ReactNode } from 'react';
import type { FolderSummary, RankedComponent } from '@arcloom/types';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { cn } from '@/utils/cn';

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

/** A single headline metric. */
export function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-subtle">{label}</span>
        <span className="text-subtle">{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums text-foreground">
        {value >= 10000 ? compact.format(value) : value.toLocaleString()}
      </div>
    </Card>
  );
}

/** A ranked list of components with proportional magnitude bars. */
export function RankedList({
  title,
  unit,
  items,
  emptyLabel,
}: {
  title: string;
  unit: string;
  items: RankedComponent[];
  emptyLabel: string;
}) {
  const max = items.reduce((m, i) => Math.max(m, i.value), 0) || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-subtle">{emptyLabel}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={`${item.filePath}:${item.name}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {item.value.toLocaleString()} {unit}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 truncate text-[11px] text-subtle">{item.filePath}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Folder-structure overview with file / component counts. */
export function FolderOverview({ folders }: { folders: FolderSummary[] }) {
  const maxFiles = folders.reduce((m, f) => Math.max(m, f.fileCount), 0) || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Folder structure</CardTitle>
      </CardHeader>
      <CardContent>
        {folders.length === 0 ? (
          <EmptyState title="No folders" className="border-0 py-6" />
        ) : (
          <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
            {folders.map((folder) => (
              <div key={folder.path} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-xs text-foreground">
                      {folder.path === '.' ? '/ (root)' : folder.path}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                      {folder.fileCount} file{folder.fileCount === 1 ? '' : 's'}
                      {folder.componentCount > 0 && ` · ${folder.componentCount} comp`}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className={cn('h-full rounded-full bg-accent/60')}
                      style={{ width: `${Math.max(3, (folder.fileCount / maxFiles) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
