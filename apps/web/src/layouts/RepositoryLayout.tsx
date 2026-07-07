import { Suspense, useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RepositoryStatus } from '@arcloom/types';
import { PageHeader } from '@/components/PageHeader';
import { Badge, ConfirmDialog, ErrorState, Skeleton } from '@/components/ui';
import { TrashIcon } from '@/components/icons';
import {
  useDeleteRepository,
  useRepository,
  useRepositoryProgress,
} from '@/features/repositories/hooks';
import { repositoryKeys } from '@/features/repositories/api';
import { STATUS_META } from '@/features/repositories/statusMeta';
import { ProcessingView } from '@/features/repositories/ProcessingView';
import { ApiClientError } from '@/services/apiClient';

/**
 * Shell for a single project: loads it, gates on processing status, and renders
 * the current sub-view (Dashboard / Graph / Explain) via the router Outlet —
 * navigation lives in the sidebar. The loaded project is passed to children
 * through the Outlet context.
 */
export function RepositoryLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: repo, isLoading, isError, error, refetch } = useRepository(id);
  const del = useDeleteRepository();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isSettled =
    repo?.status === RepositoryStatus.Ready ||
    repo?.status === RepositoryStatus.Failed;

  const { data: progress } = useRepositoryProgress(id, Boolean(repo) && !isSettled);

  // A missing project (deleted, or a stale/invalid URL) → bounce to Projects,
  // no scary error screen.
  const notFound = error instanceof ApiClientError && error.status === 404;
  useEffect(() => {
    if (notFound) navigate('/app', { replace: true });
  }, [notFound, navigate]);

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

  // A 404 is handled by the redirect effect above — render nothing meanwhile.
  if (notFound) return null;

  if (isError || !repo) {
    return (
      <ErrorState
        title="Couldn't load this project"
        description="The API may be offline. Try again in a moment."
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
        description={ready ? undefined : 'Processing project'}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              aria-label="Delete project"
              className="rounded-lg p-2 text-subtle transition-colors hover:bg-danger/15 hover:text-danger"
              title="Delete project"
            >
              <TrashIcon width={16} height={16} />
            </button>
          </div>
        }
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete project?"
        description={`"${repo.name}" and its analysis will be permanently removed. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(repo.id, { onSuccess: () => navigate('/app', { replace: true }) })
        }
        onClose={() => setConfirmOpen(false)}
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
        <Suspense
          fallback={<Skeleton className="h-[calc(100vh-15rem)] min-h-[460px] rounded-2xl" />}
        >
          <Outlet context={repo} />
        </Suspense>
      )}
    </div>
  );
}
