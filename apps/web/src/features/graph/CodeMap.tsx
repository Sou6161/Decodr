import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RepositoryGraph } from '@decodr/types';
import { useRepositoryEntities } from './hooks';

/**
 * Where the code is, and what the rest of it leans on.
 *
 * Replaces four lists of names with one chart, because the question a newcomer
 * has — "what is big, and what is load-bearing?" — is two magnitudes, and two
 * magnitudes read faster as length and colour than as four tables of numbers.
 *
 *   bar length  = lines of code
 *   bar colour  = how many other components import it
 *
 * A long pale bar is a large component nothing depends on, usually a screen
 * that has grown too far. A short bright bar is a small shared primitive. A long
 * bright bar is the code to be careful with.
 */

/**
 * One hue per chart, not a ramp.
 *
 * Colouring bars by a second measure was the first attempt, but in a
 * route-based app every large file is a screen and screens are imported by
 * nothing — so the colour channel carried no variation and the chart only
 * looked encoded. Two single-hue charts say the same thing honestly.
 *
 * Both steps pass the skill's chroma and contrast checks on a dark surface.
 */
const SIZE_HUE = '#3987e5';
const SHARED_HUE = '#d95926';

const ROUTE_DIRS = /(^|\/)(app|pages|screens|routes|views)(\/|$)/i;
const SHOWN = 16;

interface Bar {
  name: string;
  filePath: string;
  lines: number;
  importers: number;
  unused: boolean;
}

export function CodeMap({ graph, repoId }: { graph: RepositoryGraph; repoId: string }) {
  const navigate = useNavigate();
  const { data: entities } = useRepositoryEntities(repoId);
  const [hovered, setHovered] = useState<string | null>(null);

  const routed = useMemo(
    () =>
      new Set(
        (entities?.routes ?? []).flatMap((r) =>
          [r.componentName, r.filePath].filter((v): v is string => Boolean(v)),
        ),
      ),
    [entities],
  );

  const outgoing = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of graph.edges) m.set(e.source, (m.get(e.source) ?? 0) + 1);
    return m;
  }, [graph.edges]);

  const bySize = useMemo<Bar[]>(
    () => rank(graph, outgoing, routed, (n) => n.data.lineCount).slice(0, SHOWN),
    [graph, outgoing, routed],
  );
  const byShared = useMemo<Bar[]>(
    () =>
      rank(graph, outgoing, routed, (n) => n.data.importedByCount)
        .filter((b) => b.importers > 0)
        .slice(0, SHOWN),
    [graph, outgoing, routed],
  );

  const totalLines = graph.nodes.reduce((s, n) => s + n.data.lineCount, 0);

  const explain = (name: string) =>
    navigate(
      `/repositories/${repoId}/explain?q=${encodeURIComponent(`Explain the ${name} component`)}`,
    );

  if (graph.nodes.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        No React components were found in this project, so there is nothing to chart. The
        Dashboard still lists every file that was scanned.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Stat value={graph.nodes.length} label="components" />
        <Stat value={graph.edges.length} label="dependencies" />
        <Stat value={totalLines} label="lines" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Chart
          title="Biggest components"
          note="Lines of code. The longest bars are usually where complexity has collected and a split would help."
          unit="lines"
          hue={SIZE_HUE}
          bars={bySize}
          value={(b) => b.lines}
          hovered={hovered}
          setHovered={setHovered}
          onExplain={explain}
          empty="No components found."
        />
        <Chart
          title="Most depended-on"
          note="How many other components import it. Changing these reaches the furthest, so read them before you edit them."
          unit="importers"
          hue={SHARED_HUE}
          bars={byShared}
          value={(b) => b.importers}
          hovered={hovered}
          setHovered={setHovered}
          onExplain={explain}
          empty="Nothing is shared yet — no component imports another."
        />
      </div>
    </div>
  );
}

/** Ranks components by a metric, carrying the fields both charts need. */
function rank(
  graph: RepositoryGraph,
  outgoing: Map<string, number>,
  routed: Set<string>,
  metric: (n: RepositoryGraph['nodes'][number]) => number,
): Bar[] {
  return [...graph.nodes]
    .sort((a, b) => metric(b) - metric(a))
    .map((n) => ({
      name: n.data.name,
      filePath: n.data.filePath,
      lines: n.data.lineCount,
      importers: n.data.importedByCount,
      unused:
        n.data.importedByCount === 0 &&
        (outgoing.get(n.id) ?? 0) === 0 &&
        !routed.has(n.data.name) &&
        !routed.has(n.data.filePath) &&
        !ROUTE_DIRS.test(n.data.filePath),
    }));
}

interface ChartProps {
  title: string;
  note: string;
  unit: string;
  hue: string;
  bars: Bar[];
  value: (b: Bar) => number;
  hovered: string | null;
  setHovered: (k: string | null) => void;
  onExplain: (name: string) => void;
  empty: string;
}

/** One measure, one hue, sorted descending — the plain form for a magnitude. */
function Chart({
  title, note, unit, hue, bars, value, hovered, setHovered, onExplain, empty,
}: ChartProps) {
  const max = bars.length > 0 ? value(bars[0]!) : 1;

  return (
    <figure className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-[11px] text-subtle">{unit}</span>
      </figcaption>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-subtle">{note}</p>

      {bars.length === 0 && <p className="py-2 text-xs text-subtle">{empty}</p>}

      <ul className="space-y-[6px]">
        {bars.map((b) => {
          const key = b.filePath + b.name;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onExplain(b.name)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(key)}
                onBlur={() => setHovered(null)}
                className="group block w-full rounded text-left"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs text-foreground">
                    {b.name}
                    {b.unused && (
                      <span className="ml-1.5 rounded-sm bg-surface-raised px-1 py-px text-[10px] text-subtle">
                        unused?
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-subtle">
                    {value(b).toLocaleString()}
                  </span>
                </div>

                {/* Thin mark, rounded end, anchored to the baseline. */}
                <div className="mt-1 h-2 w-full rounded-sm bg-surface-raised/60">
                  <div
                    className="h-2 rounded-sm transition-[filter] group-hover:brightness-125"
                    style={{
                      width: `${Math.max(1.5, (value(b) / max) * 100)}%`,
                      backgroundColor: hue,
                    }}
                  />
                </div>

                {hovered === key && (
                  <p className="mt-1 truncate font-mono text-[10px] text-subtle">
                    {b.filePath} · {b.lines.toLocaleString()} lines · imported by {b.importers}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-subtle">Click a bar to put a question about it in the composer.</p>
    </figure>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-lg font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-subtle">{label}</span>
    </span>
  );
}
