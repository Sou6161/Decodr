import { Fragment } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Logo, MenuIcon, UploadIcon } from '@/components/icons';
import { lineColorFor } from '@/components/transit';
import { useRepository } from '@/features/repositories/hooks';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/utils/cn';

interface Stop {
  label: string;
  to: string;
}

const VIEW_LABELS: Record<string, string> = { graph: 'Graph', explain: 'Explain' };

/** Where the current page sits, as a short route ending in "You are here". */
function useRoute(): { stops: Stop[]; color: string } {
  const { pathname } = useLocation();
  const repoMatch = useMatch('/repositories/:id/*');
  const id = repoMatch?.params.id;
  const { data: repo } = useRepository(id);

  const projects = { label: 'Projects', to: '/app' };
  if (pathname === '/app') return { stops: [projects], color: 'var(--color-line-teal)' };
  if (pathname === '/upload') {
    return { stops: [projects, { label: 'Upload', to: '/upload' }], color: 'var(--color-line-teal)' };
  }
  if (id) {
    const base = `/repositories/${id}`;
    const view = repoMatch?.params['*'] ?? '';
    const name = repo?.name ?? 'Project';
    return {
      stops: [
        projects,
        { label: name, to: base },
        { label: VIEW_LABELS[view] ?? 'Dashboard', to: view ? `${base}/${view}` : base },
      ],
      color: lineColorFor(name),
    };
  }
  return { stops: [], color: 'var(--color-line-teal)' };
}

function YouAreHere() {
  const { stops, color } = useRoute();
  if (stops.length === 0) return null;

  return (
    <nav aria-label="You are here" className="hidden min-w-0 items-center sm:flex">
      {stops.map((stop, i) => {
        const last = i === stops.length - 1;
        return (
          <Fragment key={stop.to}>
            {i > 0 && <span aria-hidden className="mx-2 h-[4px] w-7 shrink-0 rounded-full" style={{ background: color }} />}
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  'shrink-0 rounded-full border-[3px] bg-surface',
                  last ? 'h-4 w-4 border-foreground' : 'h-3 w-3',
                )}
                style={last ? undefined : { borderColor: color }}
              />
              {last ? (
                <span aria-current="page" className="truncate font-display text-sm font-bold">
                  {stop.label}
                </span>
              ) : (
                <Link to={stop.to} className="truncate text-sm font-medium text-muted transition-colors hover:text-foreground">
                  {stop.label}
                </Link>
              )}
            </span>
            {last && (
              <span className="ml-3 shrink-0 rounded-full bg-line-pink px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white">
                You are here
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export function Topbar() {
  const toggleMobileNav = useUIStore((s) => s.toggleMobileNav);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border glass px-4 sm:px-6">
      <button
        type="button"
        onClick={toggleMobileNav}
        className="-ml-1 rounded-lg p-2 text-muted hover:bg-surface-raised hover:text-foreground lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon />
      </button>

      <Link to="/" title="Back to home" className="flex items-center gap-2 lg:hidden">
        <Logo />
        <span className="font-display font-bold">Decodr</span>
      </Link>

      <div className="hidden h-6 w-px bg-border sm:block lg:hidden" />
      <YouAreHere />

      <div className="ml-auto flex items-center gap-2">
        <Link to="/upload">
          <Button size="sm">
            <UploadIcon width={16} height={16} />
            Upload project
          </Button>
        </Link>
      </div>
    </header>
  );
}
