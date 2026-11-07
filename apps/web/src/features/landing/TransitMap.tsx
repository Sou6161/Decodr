import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';

/**
 * A component tree drawn as a metro map — the product's idea in one picture.
 * Each line is a render path through the app, stations are components, and
 * Button is the interchange everything ends up at. Hovering a line (or its
 * legend chip) focuses it; little trains run back and forth on each line.
 */

interface Station {
  name: string;
  x: number;
  y: number;
  /** Label offset and alignment relative to the station. */
  lx: number;
  ly: number;
  anchor?: 'start' | 'middle' | 'end';
}

interface Line {
  id: string;
  label: string;
  color: string;
  d: string;
  stations: Station[];
  trainSeconds: number;
}

const LINES: Line[] = [
  {
    id: 'render',
    label: 'Render tree',
    color: 'var(--color-line-teal)',
    d: 'M240 60 H140 L100 100 V240 L140 280 H206',
    stations: [
      { name: 'UserCard', x: 100, y: 214, lx: -14, ly: 4, anchor: 'end' },
      { name: 'Avatar', x: 206, y: 280, lx: 0, ly: 24, anchor: 'middle' },
    ],
    trainSeconds: 9,
  },
  {
    id: 'settings',
    label: 'Settings flow',
    color: 'var(--color-line-orange)',
    d: 'M240 60 H340 L380 100 V206 L320 266 V320',
    stations: [
      { name: 'Settings', x: 380, y: 136, lx: 14, ly: 4, anchor: 'start' },
      { name: 'Form', x: 380, y: 200, lx: 14, ly: 4, anchor: 'start' },
    ],
    trainSeconds: 10,
  },
  {
    id: 'charts',
    label: 'Charts',
    color: 'var(--color-line-pink)',
    d: 'M100 150 H200 L280 230 V320',
    stations: [{ name: 'Chart', x: 176, y: 150, lx: 0, ly: -14, anchor: 'middle' }],
    trainSeconds: 7.5,
  },
];

/** Stations shared by more than one line, drawn as interchanges. */
const INTERCHANGES: Station[] = [
  { name: 'App', x: 240, y: 60, lx: 0, ly: -18, anchor: 'middle' },
  { name: 'Dashboard', x: 100, y: 150, lx: -16, ly: 4, anchor: 'end' },
];

function Label({ s }: { s: Station }) {
  return (
    <text
      x={s.x + s.lx}
      y={s.y + s.ly}
      textAnchor={s.anchor ?? 'start'}
      fontSize="12.5"
      fontWeight="600"
      fontFamily="var(--font-sans)"
      fill="var(--color-foreground)"
      stroke="var(--color-surface)"
      strokeWidth="4"
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {s.name}
    </text>
  );
}

export function TransitMap() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const dimmed = (id: string) => active !== null && active !== id;

  return (
    <div>
      <svg viewBox="0 0 480 372" className="w-full" role="img" aria-label="A React app's components drawn as a transit map">
        {LINES.map((line, i) => (
          <g
            key={line.id}
            onMouseEnter={() => setActive(line.id)}
            onMouseLeave={() => setActive(null)}
            style={{ opacity: dimmed(line.id) ? 0.18 : 1, transition: 'opacity 200ms' }}
          >
            {/* Wide invisible stroke so the line is easy to hover. */}
            <path d={line.d} fill="none" stroke="transparent" strokeWidth={22} />
            <motion.path
              id={`line-${line.id}`}
              d={line.d}
              fill="none"
              stroke={line.color}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.2 + i * 0.25, duration: 0.9, ease: 'easeInOut' }}
            />
            {line.stations.map((s) => (
              <g key={s.name}>
                <circle cx={s.x} cy={s.y} r={6} fill="var(--color-surface)" stroke={line.color} strokeWidth={3} />
                <Label s={s} />
              </g>
            ))}
            {!reduceMotion && (
              <circle r={4.5} fill="var(--color-foreground)" stroke="var(--color-surface)" strokeWidth={2}>
                <animateMotion
                  dur={`${line.trainSeconds}s`}
                  begin={`${1.4 + i * 0.4}s`}
                  repeatCount="indefinite"
                  keyPoints="0;1;0"
                  keyTimes="0;0.5;1"
                  calcMode="linear"
                >
                  <mpath href={`#line-${line.id}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        ))}

        {INTERCHANGES.map((s) => (
          <g key={s.name} style={{ opacity: active ? 0.5 : 1, transition: 'opacity 200ms' }}>
            <circle cx={s.x} cy={s.y} r={10} fill="var(--color-surface)" stroke="var(--color-foreground)" strokeWidth={3.5} />
            <Label s={s} />
          </g>
        ))}

        {/* Button: where the Settings and Charts lines meet */}
        <g>
          <rect x={266} y={308} width={68} height={24} rx={12} fill="var(--color-surface)" stroke="var(--color-foreground)" strokeWidth={3.5} />
          <text
            x={300}
            y={355}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fontFamily="var(--font-sans)"
            fill="var(--color-foreground)"
          >
            Button
          </text>
          <text x={300} y={324.5} textAnchor="middle" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)" fill="var(--color-subtle)">
            ×7
          </text>
        </g>
      </svg>

      <div className="mt-3 flex flex-wrap gap-2 px-1">
        {LINES.map((line) => (
          <button
            key={line.id}
            type="button"
            onMouseEnter={() => setActive(line.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(line.id)}
            onBlur={() => setActive(null)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted transition-colors',
              active === line.id && 'border-border-strong text-foreground',
            )}
          >
            <span className="h-1.5 w-5 rounded-full" style={{ background: line.color }} />
            {line.label}
          </button>
        ))}
      </div>
    </div>
  );
}
