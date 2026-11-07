import { motion } from 'framer-motion';
import type { RankedComponent } from '@decodr/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

/**
 * The headline numbers as a station departure board: a dark panel where every
 * digit sits on its own split-flap tile and flips into place.
 */
export function DepartureBoard({
  title,
  note,
  cells,
}: {
  title: string;
  note: string;
  cells: { label: string; value: number }[];
}) {
  return (
    <div className="theme-ink pop overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-line-sun">{title}</span>
        <span className="font-mono text-[11px] text-subtle">{note}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((c, i) => (
          <div key={c.label} className="bg-surface px-5 py-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">{c.label}</div>
            <FlapNumber value={c.value} delay={i * 0.08} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FlapNumber({ value, delay }: { value: number; delay: number }) {
  const text = value >= 10000 ? compact.format(value) : value.toLocaleString();
  return (
    <div className="mt-2 flex items-end gap-[3px]" aria-label={text}>
      {[...text].map((ch, i) =>
        /\d/.test(ch) ? (
          <motion.span
            key={i}
            aria-hidden
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ delay: delay + i * 0.06, duration: 0.35, ease: 'easeOut' }}
            style={{ transformOrigin: 'top' }}
            className="relative grid h-10 w-7 place-items-center rounded-[5px] bg-surface-raised font-mono text-2xl font-semibold tabular-nums text-line-sun"
          >
            {ch}
            <span className="absolute inset-x-0 top-1/2 h-px bg-black/50" />
          </motion.span>
        ) : (
          <span key={i} aria-hidden className="pb-1 font-mono text-lg text-line-sun">
            {ch}
          </span>
        ),
      )}
    </div>
  );
}

/** A ranked list of components with proportional magnitude bars. */
export function RankedList({
  title,
  unit,
  items,
  emptyLabel,
  color,
}: {
  title: string;
  unit: string;
  items: RankedComponent[];
  emptyLabel: string;
  color: string;
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
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(4, (item.value / max) * 100)}%`, background: color }}
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
