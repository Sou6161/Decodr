import type { ReactNode } from 'react';
import type { RankedComponent } from '@arcloom/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

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
