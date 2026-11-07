import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Logo, ArrowRightIcon } from '@/components/icons';
import { TransitMap } from '@/features/landing/TransitMap';
import { StationBoard, Train } from '@/components/transit';
import { cn } from '@/utils/cn';

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <ServiceNotice />
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Hero />
        <Journey />
        <Ticket />
      </main>
      <Footer />
    </div>
  );
}

const PRIMARY_BTN =
  'inline-flex items-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground shadow-[0_4px_0_0_var(--color-primary-soft)] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-primary-soft)]';

const OUTLINE_BTN =
  'inline-flex items-center gap-2 rounded-xl border-2 border-foreground bg-surface font-bold text-foreground shadow-[0_4px_0_0_var(--color-foreground)] transition-all hover:bg-surface-raised active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-foreground)]';

/** The yellow strip a station puts up when something's worth knowing. */
function ServiceNotice() {
  return (
    <div className="bg-line-sun text-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-2 text-[13px] sm:px-8">
        <span className="shrink-0 rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-line-sun">
          Service notice
        </span>
        <p className="truncate font-medium">
          Mind the gap between what your code does and what you think it does.
        </p>
      </div>
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-lg font-bold tracking-tight">Decodr</span>
          <span className="ml-1 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-subtle">
            v0.1
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/app"
            className="hidden text-sm font-semibold text-muted transition-colors hover:text-foreground sm:block"
          >
            Projects
          </Link>
          <Link to="/app" className={cn(PRIMARY_BTN, 'px-3.5 py-2 text-sm')}>
            Open app
            <ArrowRightIcon width={15} height={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

/**
 * Laid out like a printed network map: a title block on one side, the map on
 * the other, and the key running along the bottom edge.
 */
function Hero() {
  return (
    <section className="py-10 lg:py-14">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="pop overflow-hidden rounded-[28px] border border-border bg-surface"
      >
        <div className="grid lg:grid-cols-[1fr_1.05fr]">
          <div className="flex flex-col p-7 sm:p-10">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">
              Network map · React + TypeScript
            </p>
            <h1 className="mt-5 font-display text-[2.9rem] font-extrabold leading-[1.0] tracking-tight sm:text-6xl">
              Understand any React{' '}
              <span className="underline decoration-line-teal decoration-[7px] underline-offset-[10px]">codebase</span>{' '}
              in <span className="text-accent">minutes.</span>
            </h1>
            <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed text-muted">
              Drop in a project and Decodr reads it with the TypeScript compiler: every
              component, hook and route, and which ones render which. Then ask it questions and
              get answers built from your <span className="font-semibold text-foreground">actual code</span>.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/upload" className={cn(PRIMARY_BTN, 'px-5 py-3 text-sm')}>
                Analyze a project
                <ArrowRightIcon width={16} height={16} />
              </Link>
              <Link to="/app" className={cn(OUTLINE_BTN, 'px-5 py-[10px] text-sm')}>
                Explore the app
              </Link>
            </div>
          </div>

          <div className="border-t border-border bg-background/50 p-4 sm:p-6 lg:border-l lg:border-t-0">
            <TransitMap />
          </div>
        </div>

        <MapKey />
      </motion.div>
    </section>
  );
}

function MapKey() {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-border px-7 py-4 text-xs text-muted sm:px-10">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">Key</span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3 w-3 rounded-full border-[2.5px] border-line-teal bg-surface" />
        station = a component
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-3.5 w-3.5 rounded-full border-[3px] border-foreground bg-surface" />
        interchange = shared by several screens
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-foreground ring-2 ring-surface" />
        train = a render on its way down
      </span>
      <span className="ml-auto hidden font-mono text-[10px] uppercase tracking-[0.18em] text-subtle sm:block">
        Not to scale
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- journey */

interface StopProps {
  n: number;
  name: string;
  color: string;
  lead: string;
  points: { title: string; desc: string; mono: string }[];
  exhibit: ReactNode;
  first?: boolean;
  last?: boolean;
}

/**
 * The rest of the page is one line with three stops. A small train rides the
 * rail as you scroll, so the reader travels the route the code does.
 */
function Journey() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 70%', 'end 70%'] });
  const top = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <section className="pb-6 pt-14">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">The route</p>
      <h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        One line, three stops, and you know your way around.
      </h2>

      <div ref={ref} className="relative mt-12">
        <motion.div
          aria-hidden
          style={{ top }}
          className="absolute left-[18px] z-20 -translate-y-1/2 sm:left-[26px]"
        >
          <Train />
        </motion.div>

        {STOPS.map((stop, i) => (
          <Stop key={stop.name} {...stop} first={i === 0} last={i === STOPS.length - 1} />
        ))}
      </div>
    </section>
  );
}

function Stop({ n, name, color, lead, points, exhibit, first, last }: StopProps) {
  return (
    <div className="relative pb-16 pl-14 sm:pl-24">
      {/* This stop's stretch of rail, in its line colour. */}
      <span
        aria-hidden
        className={cn('absolute bottom-0 left-[22px] w-[10px] sm:left-[30px]', first ? 'top-5' : 'top-0')}
        style={{ background: color }}
      />
      {/* Buffer stop at the end of the line, where the train comes to rest. */}
      {last && (
        <span aria-hidden className="absolute bottom-0 left-[14px] h-[10px] w-[26px] rounded-full bg-foreground sm:left-[22px]" />
      )}
      <span
        aria-hidden
        className="absolute left-[13px] top-3 z-10 h-7 w-7 rounded-full border-[5px] bg-surface sm:left-[21px]"
        style={{ borderColor: color }}
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <StationBoard name={name} color={color} />
          <span className="pb-1 font-mono text-[11px] text-subtle">
            Stop {n} of {STOPS.length}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="min-w-0">
            <p className="text-lg leading-relaxed text-foreground">{lead}</p>
            <ul className="mt-6 space-y-5">
              {points.map((p) => (
                <li key={p.title} className="border-l-2 pl-4" style={{ borderColor: color }}>
                  <h3 className="font-display text-base font-bold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{p.desc}</p>
                  <p className="mt-1.5 font-mono text-[11px] text-subtle">{p.mono}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">{exhibit}</div>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------- stop exhibits */

const SCAN_LINES = [
  { text: '$ decodr ./my-app', tone: 'prompt' },
  { text: '→ extracting · scanning · parsing (ts compiler api)', tone: 'muted' },
  { text: '✓ 214 files · 62 components · 11 hooks · 7 routes', tone: 'ok' },
  { text: '✓ 148 relationships mapped', tone: 'ok' },
  { text: '✓ ready in 3.2s', tone: 'ok' },
] as const;

function TerminalExhibit() {
  return (
    <div className="pop overflow-hidden rounded-2xl bg-ink">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line-pink" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-sun" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-lime" />
        <span className="ml-2 font-mono text-[11px] text-[#8c9399]">~/my-app</span>
      </div>
      <div className="space-y-1.5 p-5 font-mono text-[13px] leading-relaxed">
        {SCAN_LINES.map((line, i) => (
          <motion.div
            key={line.text}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.18, duration: 0.3 }}
            className={cn(
              line.tone === 'prompt' && 'text-[#f3f4ef]',
              line.tone === 'muted' && 'text-[#8c9399]',
              line.tone === 'ok' && 'text-[#7fd6a0]',
            )}
          >
            {line.text}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const MOST_IMPORTED = [
  { name: 'Button', count: 23 },
  { name: 'Card', count: 17 },
  { name: 'Avatar', count: 9 },
  { name: 'Modal', count: 6 },
];

function InsightsExhibit() {
  const max = MOST_IMPORTED[0]!.count;
  return (
    <div className="pop rounded-2xl border border-border bg-surface p-5">
      <div className="grid grid-cols-4 gap-2">
        {[
          ['214', 'files'],
          ['62', 'components'],
          ['11', 'hooks'],
          ['7', 'routes'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-background px-3 py-2.5">
            <div className="font-display text-xl font-bold tabular-nums">{v}</div>
            <div className="truncate text-[11px] text-subtle">{l}</div>
          </div>
        ))}
      </div>
      <p className="mt-5 font-display text-sm font-bold">Most imported</p>
      <p className="text-xs text-subtle">Change these and the most screens feel it.</p>
      <ul className="mt-3 space-y-2.5">
        {MOST_IMPORTED.map((c, i) => (
          <li key={c.name}>
            <div className="flex justify-between text-[13px]">
              <span className="font-medium">{c.name}</span>
              <span className="tabular-nums text-subtle">{c.count}</span>
            </div>
            <motion.div
              className="mt-1 h-2 rounded-full bg-line-orange"
              initial={{ width: 0 }}
              whileInView={{ width: `${(c.count / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: 'easeOut' }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExplainExhibit() {
  return (
    <div className="pop rounded-2xl border border-border bg-surface p-5">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background">
        How does the cart total get updated?
      </div>
      <div className="mt-4 rounded-2xl rounded-bl-md border border-border bg-background p-4 text-sm leading-relaxed">
        <p>
          <code className="rounded bg-surface px-1 font-mono text-[12px]">CartSummary</code> reads
          the total from{' '}
          <code className="rounded bg-surface px-1 font-mono text-[12px]">useCart</code>, which
          recomputes it whenever an item changes:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-surface p-3 font-mono text-[12px] leading-relaxed">
          <code>
            <span className="text-line-blue">const</span> total = items.<span className="text-sky">reduce</span>(
            {'\n'}  (sum, item) =&gt; sum + item.price * item.qty,
            {'\n'}  <span className="text-accent">0</span>,
            {'\n'});
          </code>
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          {['src/hooks/useCart.ts:18', 'src/components/CartSummary.tsx'].map((f) => (
            <span key={f} className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] text-muted">
              {f}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-right font-mono text-[11px] text-subtle">read 2 of 214 files</p>
    </div>
  );
}

const STOPS: Omit<StopProps, 'first' | 'last'>[] = (
  [
  {
    name: 'Scan',
    color: 'var(--color-line-teal)',
    lead: 'Your source is walked and indexed. node_modules, builds, and .git are skipped automatically.',
    points: [
      {
        title: 'Read by the compiler',
        desc: 'Components, imports, hooks and routes are read straight from the syntax tree. Nothing is guessed.',
        mono: 'typescript compiler api · never regex',
      },
    ],
    exhibit: <TerminalExhibit />,
  },
  {
    name: 'Map',
    color: 'var(--color-line-orange)',
    lead: 'The TypeScript compiler pulls out components, hooks and routes, and works out which ones render which.',
    points: [
      {
        title: 'Relationship graph',
        desc: 'See what renders what. Focus a component to isolate just its connections.',
        mono: 'renders-edges · in/out degree',
      },
      {
        title: 'The project at a glance',
        desc: 'Files, folders, largest and most-imported components, and the full project tree at a glance.',
        mono: 'aggregated server-side · O(1) reads',
      },
    ],
    exhibit: <InsightsExhibit />,
  },
  {
    name: 'Explain',
    color: 'var(--color-line-pink)',
    lead: 'Ask how a feature works. Decodr sends only the relevant files to the model and answers with real code.',
    points: [
      {
        title: 'Answers from the right files',
        desc: 'Only the code your question is about gets sent to the model, which keeps the answer tied to your project.',
        mono: 'graph-driven retrieval · depth matched to the question',
      },
    ],
    exhibit: <ExplainExhibit />,
  },
  ] as Omit<StopProps, 'n' | 'first' | 'last'>[]
).map((s, i) => ({ ...s, n: i + 1 }));

/* ---------------------------------------------------------------- ticket */

const STACK = [
  'React 19', 'TypeScript', 'TS Compiler API', 'React Flow', 'Zustand',
  'TanStack Query', 'Node', 'Express', 'Prisma', 'PostgreSQL', 'Tailwind v4',
];

/** Bar widths for the stub's barcode, fixed so it looks the same every visit. */
const BARCODE = [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3, 1];

function Ticket() {
  return (
    <section className="py-16">
      <motion.div
        initial={{ opacity: 0, y: 18, rotate: -0.6 }}
        whileInView={{ opacity: 1, y: 0, rotate: -0.6 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="pop relative mx-auto flex max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-surface md:flex-row"
      >
        {/* Main part of the ticket */}
        <div className="flex-1 p-7 sm:p-10">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">
              Single journey
            </span>
            <span className="rounded-full bg-line-teal px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white">
              Fare: free
            </span>
          </div>

          <div className="mt-6 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
            <span className="text-xs text-subtle">From</span>
            <span className="font-mono text-lg text-foreground">your-repo/</span>
            <span aria-hidden className="ml-[13px] h-6 w-[3px] bg-border-strong" />
            <span />
            <span className="text-xs text-subtle">To</span>
            <span className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              Point it at your <span className="text-accent">repo.</span>
            </span>
          </div>

          <p className="mt-5 max-w-md text-sm leading-relaxed text-muted">
            Upload a folder and see how it fits together in minutes. Your code stays private to
            your session. Nobody else can see it.
          </p>

          <Link to="/upload" className={cn(PRIMARY_BTN, 'mt-7 px-6 py-3 text-sm')}>
            Analyze a project
            <ArrowRightIcon width={16} height={16} />
          </Link>

          <p className="mt-8 font-mono text-[10px] leading-relaxed text-subtle">
            Valid for any React + TypeScript project. Printed with {STACK.join(' · ')}.
          </p>
        </div>

        {/* Perforation, with the two half-circle notches cut into the edges */}
        <div aria-hidden className="relative md:w-0">
          <span className="block h-0 border-t-2 border-dashed border-border-strong md:h-full md:border-l-2 md:border-t-0" />
          <span className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-background md:-left-4 md:-top-4" />
          <span className="absolute -bottom-4 -right-4 h-8 w-8 rounded-full bg-background md:-bottom-4 md:-left-4 md:right-auto" />
        </div>

        {/* Stub */}
        <div className="flex items-center justify-between gap-6 bg-background/60 p-7 md:w-52 md:flex-col md:justify-center md:p-6">
          <p className="font-display text-xl font-extrabold uppercase leading-tight tracking-wide md:text-center">
            Admit one
            <br />
            codebase
          </p>
          <div className="flex h-14 items-stretch gap-[2px]">
            {BARCODE.map((w, i) => (
              <span key={i} className="bg-foreground" style={{ width: w * 2 }} />
            ))}
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

function Footer() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row sm:px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="font-display text-sm font-bold">End of the line.</span>
          <span className="hidden font-mono text-xs text-subtle sm:inline">decodr · understand any codebase</span>
        </div>
        <p className="font-mono text-[11px] text-subtle">A portfolio project · {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
