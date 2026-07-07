import { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * A small, live component-dependency graph — the product demonstrating itself.
 * Nodes and edges draw themselves in; hovering a node lights up its immediate
 * connections, exactly like the real Graph view. Hand-built SVG, no chart lib.
 */

interface N {
  id: string;
  label: string;
  file: string;
  x: number;
  y: number;
  hub?: boolean;
}

const NODES: N[] = [
  { id: 'App', label: 'App', file: 'App.tsx', x: 240, y: 44 },
  { id: 'Dashboard', label: 'Dashboard', file: 'Dashboard.tsx', x: 118, y: 138 },
  { id: 'Login', label: 'Login', file: 'Login.tsx', x: 372, y: 138 },
  { id: 'UserCard', label: 'UserCard', file: 'UserCard.tsx', x: 118, y: 236 },
  { id: 'Settings', label: 'Settings', file: 'Settings.tsx', x: 372, y: 236 },
  { id: 'Avatar', label: 'Avatar', file: 'Avatar.tsx', x: 66, y: 330 },
  { id: 'Button', label: 'Button', file: 'Button.tsx', x: 240, y: 330, hub: true },
];

const EDGES: [string, string][] = [
  ['App', 'Dashboard'],
  ['App', 'Login'],
  ['Dashboard', 'UserCard'],
  ['UserCard', 'Avatar'],
  ['Login', 'Settings'],
  ['Dashboard', 'Button'],
  ['Login', 'Button'],
  ['Settings', 'Button'],
  ['UserCard', 'Button'],
];

const NODE_W = 96;
const NODE_H = 34;

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

export function HeroGraph() {
  const [hover, setHover] = useState<string | null>(null);

  const neighbors = (id: string) => {
    const set = new Set<string>([id]);
    for (const [a, b] of EDGES) {
      if (a === id) set.add(b);
      if (b === id) set.add(a);
    }
    return set;
  };
  const lit = hover ? neighbors(hover) : null;

  return (
    <div className="relative">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 blur-3xl">
        <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15" />
      </div>

      <svg viewBox="0 0 480 372" className="w-full" role="img" aria-label="Component dependency graph">
        {/* edges */}
        {EDGES.map(([a, b], i) => {
          const from = byId[a]!;
          const to = byId[b]!;
          const active = hover !== null && (a === hover || b === hover);
          const dim = lit !== null && !active;
          return (
            <motion.line
              key={`${a}-${b}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={active ? 'var(--color-primary)' : 'var(--color-border-strong)'}
              strokeWidth={active ? 2 : 1.25}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: dim ? 0.12 : active ? 1 : 0.5 }}
              transition={{ pathLength: { delay: 0.15 + i * 0.06, duration: 0.5 }, opacity: { duration: 0.2 } }}
            />
          );
        })}

        {/* nodes */}
        {NODES.map((n, i) => {
          const active = hover === n.id;
          const dim = lit !== null && !lit.has(n.id);
          return (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: dim ? 0.3 : 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.35, ease: 'easeOut' }}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {n.hub && (
                <motion.rect
                  x={n.x - NODE_W / 2 - 4}
                  y={n.y - NODE_H / 2 - 4}
                  width={NODE_W + 8}
                  height={NODE_H + 8}
                  rx={12}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={1}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.15, 0.45, 0.15] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <rect
                x={n.x - NODE_W / 2}
                y={n.y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={9}
                fill="var(--color-surface-raised)"
                stroke={active ? 'var(--color-primary)' : n.hub ? 'var(--color-accent)' : 'var(--color-border)'}
                strokeWidth={active ? 2 : 1.25}
              />
              <circle cx={n.x - NODE_W / 2 + 12} cy={n.y} r={3} fill={n.hub ? 'var(--color-accent)' : 'var(--color-primary)'} />
              <text
                x={n.x - NODE_W / 2 + 22}
                y={n.y + 4}
                fill="var(--color-foreground)"
                fontSize="12"
                fontWeight="600"
                fontFamily="var(--font-sans)"
              >
                {n.label}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
