import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { RepositoryGraph } from '@decodr/types';
import { cn } from '@/utils/cn';
import { colorForKey, featureLabel, featureOf, tint } from './colors';
import { fadeUpItem, staggerContainer } from '@/utils/motion';

interface Comp {
  name: string;
  filePath: string;
  lineCount: number;
  usedBy: number;
}
interface Area {
  key: string;
  label: string;
  color: string;
  dir: string;
  components: Comp[];
  totalLines: number;
}

const PREVIEW = 6;

/**
 * A "map of the app": one colorful card per feature area, each listing its
 * components with a size bar. No relationships to decode — an at-a-glance read
 * on what the project is made of and where the weight sits.
 */
export function FeatureMap({ graph }: { graph: RepositoryGraph }) {
  const areas = useMemo(() => buildAreas(graph), [graph]);
  const totalLines = areas.reduce((s, a) => s + a.totalLines, 0);

  return (
    <div>
      <p className="mb-4 text-sm text-subtle">
        {graph.nodes.length} components across {areas.length} areas ·{' '}
        {totalLines.toLocaleString()} lines. Each card is a feature area.
      </p>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {areas.map((area) => (
          <motion.div key={area.key} variants={fadeUpItem}>
            <AreaCard area={area} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function AreaCard({ area }: { area: Area }) {
  const [expanded, setExpanded] = useState(false);
  const maxLines = area.components[0]?.lineCount || 1;
  const shown = expanded ? area.components : area.components.slice(0, PREVIEW);
  const hidden = area.components.length - shown.length;

  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface"
      style={{ borderTopColor: area.color, borderTopWidth: 3 }}
    >
      <div className="flex items-center gap-3 p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums"
          style={tint(area.color)}
        >
          {area.components.length}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{area.label}</h3>
          <p className="truncate font-mono text-[11px] text-subtle">{area.dir}</p>
        </div>
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-subtle">
          {area.totalLines.toLocaleString()} ln
        </span>
      </div>

      <div className="flex-1 space-y-1.5 px-4 pb-4">
        {shown.map((c) => (
          <div key={c.filePath + c.name} className="group" title={`${c.filePath} · ${c.lineCount} lines`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: area.color }} />
                <span className="truncate text-sm text-foreground">{c.name}</span>
                {c.usedBy > 2 && (
                  <span
                    className="shrink-0 rounded-full px-1.5 text-[10px] font-medium"
                    style={tint(area.color)}
                    title={`Used by ${c.usedBy} components`}
                  >
                    ×{c.usedBy}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-subtle">{c.lineCount}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(5, (c.lineCount / maxLines) * 100)}%`,
                  backgroundColor: `color-mix(in srgb, ${area.color} 65%, transparent)`,
                }}
              />
            </div>
          </div>
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={cn(
              'mt-1 w-full rounded-md py-1.5 text-xs font-medium text-muted',
              'hover:bg-surface-raised hover:text-foreground',
            )}
          >
            +{hidden} more
          </button>
        )}
        {expanded && area.components.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1 w-full rounded-md py-1.5 text-xs font-medium text-muted hover:bg-surface-raised hover:text-foreground"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

/** Longest shared directory prefix across a set of file paths. */
function commonDir(paths: string[]): string {
  if (paths.length === 0) return '';
  const split = paths.map((p) => p.split('/').slice(0, -1));
  const first = split[0]!;
  let end = first.length;
  for (const segs of split) {
    let i = 0;
    while (i < end && i < segs.length && segs[i] === first[i]) i += 1;
    end = i;
  }
  return first.slice(0, end).join('/') || '/';
}

function buildAreas(graph: RepositoryGraph): Area[] {
  const map = new Map<string, Comp[]>();
  for (const n of graph.nodes) {
    const key = featureOf(n.data.filePath);
    const comp: Comp = {
      name: n.data.name,
      filePath: n.data.filePath,
      lineCount: n.data.lineCount,
      usedBy: n.data.importedByCount,
    };
    (map.get(key) ?? map.set(key, []).get(key)!).push(comp);
  }

  return [...map.entries()]
    .map(([key, components]) => {
      components.sort((a, b) => b.lineCount - a.lineCount || a.name.localeCompare(b.name));
      return {
        key,
        label: featureLabel(key),
        color: colorForKey(key),
        dir: commonDir(components.map((c) => c.filePath)),
        components,
        totalLines: components.reduce((s, c) => s + c.lineCount, 0),
      };
    })
    .sort((a, b) => b.components.length - a.components.length || b.totalLines - a.totalLines);
}
