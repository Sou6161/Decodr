import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo, ArrowRightIcon, GraphIcon, SparkIcon, SearchIcon, DashboardIcon } from '@/components/icons';
import { HeroGraph } from '@/features/landing/HeroGraph';
import { AnimeBackdrop } from '@/components/AnimeBackdrop';
import { cn } from '@/utils/cn';

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <AnimeBackdrop />
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Hero />
        <HowItWorks />
        <Features />
        <StackStrip />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-base font-semibold tracking-tight">Decodr</span>
          <span className="ml-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-subtle">
            v0.1
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/app"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-foreground sm:block"
          >
            Projects
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground shadow-[0_3px_0_0_var(--color-primary-soft)] transition-all hover:brightness-110 active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--color-primary-soft)]"
          >
            Open app
            <ArrowRightIcon width={15} height={15} />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-24">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <p className="font-mono text-xs text-accent">// static analysis · react + typescript</p>
        <h1 className="relative mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
          <Sparkle className="absolute -left-6 -top-5 text-gold" size={22} />
          <span className="text-foreground">Understand any React </span>
          <span className="text-accent">codebase</span>
          <span className="text-foreground"> in </span>
          <span className="text-sky">minutes.</span>
          <Sparkle className="absolute -right-2 top-8 text-accent" size={16} />
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">
          Drop a project and Decodr maps its architecture with the TypeScript compiler —
          components, hooks, routes, and how they connect — then answers questions about it
          with the <span className="text-foreground">actual code</span> in context. No
          embeddings, no guessing.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to="/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_5px_0_0_var(--color-primary-soft)] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-[0_2px_0_0_var(--color-primary-soft)]"
          >
            Analyze a project
            <ArrowRightIcon width={16} height={16} />
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-border-strong bg-surface-raised px-5 py-3 text-sm font-bold text-foreground shadow-[0_5px_0_0_var(--color-border)] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-[0_2px_0_0_var(--color-border)]"
          >
            Explore the app
          </Link>
        </div>

        <div className="mt-7 inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 font-mono text-xs text-muted">
          <span className="text-subtle">$</span>
          <span>decodr</span>
          <span className="text-accent">./my-app</span>
          <motion.span
            className="ml-0.5 inline-block h-3.5 w-[7px] bg-primary"
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        className="pop rounded-2xl border-2 border-border-strong bg-surface/70 p-3"
      >
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="h-2.5 w-2.5 rounded-full bg-danger" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning" />
          <span className="h-2.5 w-2.5 rounded-full bg-success" />
          <span className="ml-2 font-mono text-[11px] text-subtle">component graph — hover a node</span>
        </div>
        <HeroGraph />
      </motion.div>
    </section>
  );
}

const SCAN_LINES = [
  { text: '$ decodr ./my-app', tone: 'prompt' },
  { text: '→ extracting · scanning · parsing (ts compiler api)', tone: 'muted' },
  { text: '✓ 214 files · 62 components · 11 hooks · 7 routes', tone: 'ok' },
  { text: '✓ 148 relationships mapped', tone: 'ok' },
  { text: '✓ ready in 3.2s', tone: 'ok' },
] as const;

function HowItWorks() {
  return (
    <section className="border-t border-border py-16">
      <SectionLabel>How it works</SectionLabel>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        {/* terminal */}
        <div className="pop overflow-hidden rounded-xl border-2 border-border-strong bg-[oklch(0.15_0.03_248)]">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
            <span className="ml-2 font-mono text-[11px] text-subtle">decodr — scan</span>
          </div>
          <div className="space-y-1.5 p-4 font-mono text-[13px] leading-relaxed">
            {SCAN_LINES.map((line, i) => (
              <motion.div
                key={line.text}
                initial={{ opacity: 0, x: -6 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.3 }}
                className={cn(
                  line.tone === 'prompt' && 'text-foreground',
                  line.tone === 'muted' && 'text-subtle',
                  line.tone === 'ok' && 'text-success',
                )}
              >
                {line.text}
              </motion.div>
            ))}
          </div>
        </div>

        {/* steps */}
        <ol className="space-y-5">
          {[
            { n: '01', t: 'Scan', d: 'Your source is walked and indexed. node_modules, builds, and .git are skipped automatically.' },
            { n: '02', t: 'Map', d: 'The TypeScript compiler extracts components, hooks, and routes — and models how they render one another. Never regex.' },
            { n: '03', t: 'Explain', d: 'Ask how a feature works. Decodr sends only the relevant files to the model and answers with real code.' },
          ].map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="font-mono text-sm text-primary">{s.n}</span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{s.t}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: SearchIcon,
    title: 'Real static analysis',
    desc: 'Components, imports, hooks and routes pulled straight from the AST — accurate, not inferred.',
    mono: 'typescript compiler api · never regex',
  },
  {
    icon: GraphIcon,
    title: 'Relationship graph',
    desc: 'See what renders what. Focus a component to isolate just its connections.',
    mono: 'renders-edges · in/out degree',
  },
  {
    icon: DashboardIcon,
    title: 'Repository insights',
    desc: 'Files, folders, largest and most-imported components, and the full project tree at a glance.',
    mono: 'aggregated server-side · O(1) reads',
  },
  {
    icon: SparkIcon,
    title: 'Context-aware answers',
    desc: 'A focused slice of the codebase — not the whole thing — reaches the model, so answers stay grounded.',
    mono: 'graph-driven retrieval · quick / detailed',
  },
];

function Features() {
  return (
    <section className="border-t border-border py-16">
      <SectionLabel>What it does</SectionLabel>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-2xl border-2 border-border-strong bg-surface/60 p-6 transition-all hover:-translate-y-0.5 pop-sm"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-border-strong bg-primary/20 text-primary">
              <f.icon width={20} height={20} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.desc}</p>
            <p className="mt-3 font-mono text-[11px] text-subtle">{f.mono}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const STACK = [
  'React 19', 'TypeScript', 'TS Compiler API', 'React Flow', 'Zustand',
  'TanStack Query', 'Node', 'Express', 'Prisma', 'PostgreSQL', 'Tailwind v4',
];

function StackStrip() {
  return (
    <section className="border-t border-border py-12">
      <p className="font-mono text-xs text-subtle">// built with</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {STACK.map((s) => (
          <span
            key={s}
            className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 font-mono text-xs text-muted"
          >
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-border py-20">
      <div className="pop relative overflow-hidden rounded-3xl border-2 border-border-strong bg-surface/70 px-6 py-16 text-center sm:px-12">
        <Sparkle className="absolute left-[12%] top-8 text-gold" size={18} />
        <Sparkle className="absolute right-[14%] top-14 text-accent" size={14} />
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          <span className="text-foreground">Point it at your </span>
          <span className="text-accent">repo.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">
          Upload a folder and get its architecture in minutes. Your code stays private to your
          session — nobody else can see it.
        </p>
        <Link
          to="/upload"
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_5px_0_0_var(--color-primary-soft)] transition-all hover:brightness-110 active:translate-y-[3px] active:shadow-[0_2px_0_0_var(--color-primary-soft)]"
        >
          Analyze a project
          <ArrowRightIcon width={16} height={16} />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 sm:flex-row sm:px-8">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-mono text-xs text-subtle">decodr — understand any codebase</span>
        </div>
        <p className="font-mono text-[11px] text-subtle">A portfolio project · {new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-6 bg-border-strong" />
      <span className="font-mono text-xs uppercase tracking-wider text-subtle">{children}</span>
    </div>
  );
}

/** A little four-point kirakira sparkle. */
function Sparkle({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <motion.svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      initial={{ scale: 0.7, opacity: 0.4 }}
      animate={{ scale: [0.7, 1, 0.7], opacity: [0.4, 1, 0.4], rotate: [0, 90, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path d="M12 0c.8 6.2 5 10.4 12 12-7 1.6-11.2 5.8-12 12-.8-6.2-5-10.4-12-12C7 10.4 11.2 6.2 12 0Z" />
    </motion.svg>
  );
}
