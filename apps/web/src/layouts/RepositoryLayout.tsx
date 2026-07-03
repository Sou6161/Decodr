import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RepositoryStatus } from '@arcloom/types';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Button, ErrorState, Skeleton } from '@/components/ui';
import {
  useRepository,
  useRepositoryProgress,
} from '@/features/repositories/hooks';
import { repositoryKeys } from '@/features/repositories/api';
import { STATUS_META } from '@/features/repositories/statusMeta';
import { ProcessingView } from '@/features/repositories/ProcessingView';
import { cn } from '@/utils/cn';

const TABS = [
  { to: '', label: 'Dashboard', end: true },
  { to: 'graph', label: 'Graph', end: false },
  { to: 'explain', label: 'Explain', end: false },
];

/**
 * Shell for a single repository: loads it, gates on processing status, and
 * renders tabbed sub-views (Overview, Graph, …) via the router Outlet. The
 * loaded Repository is passed to children through the Outlet context.
 */
export function RepositoryLayout() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: repo, isLoading, isError, refetch } = useRepository(id);

  const isSettled =
    repo?.status === RepositoryStatus.Ready ||
    repo?.status === RepositoryStatus.Failed;

  const { data: progress } = useRepositoryProgress(id, Boolean(repo) && !isSettled);

  useEffect(() => {
    if (!id || !progress) return;
    if (
      progress.status === RepositoryStatus.Ready ||
      progress.status === RepositoryStatus.Failed
    ) {
      void queryClient.invalidateQueries({ queryKey: repositoryKeys.detail(id) });
    }
  }, [id, progress, queryClient]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (isError || !repo) {
    return (
      <ErrorState
        title="Repository not found"
        description="It may have been removed, or the id is invalid."
        action={{ label: 'Retry', onClick: () => void refetch() }}
      />
    );
  }

  const status = STATUS_META[repo.status];
  const ready = repo.status === RepositoryStatus.Ready;

  return (
    <div>
      <PageHeader
        title={repo.name}
        description={ready ? undefined : 'Processing repository'}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      {!ready ? (
        <ProcessingView
          progress={
            progress ?? {
              status: repo.status,
              percent: repo.status === RepositoryStatus.Failed ? 100 : 5,
              message: repo.error ?? 'Queued',
            }
          }
        />
      ) : (
        <>
          <nav className="mb-6 flex items-center gap-1 border-b border-border">
            {TABS.map((tab) => (
              <NavLink
                key={tab.label}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted hover:text-foreground',
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <Suspense
            fallback={
              <Skeleton className="h-[calc(100vh-15rem)] min-h-[460px] rounded-2xl" />
            }
          >
            <Outlet context={repo} />
          </Suspense>
        </>
      )}

      <div className="mt-8">
        <Link to="/">
          <Button variant="secondary" size="sm">
            ← Back to repositories
          </Button>
        </Link>
      </div>
    </div>
  );
}
