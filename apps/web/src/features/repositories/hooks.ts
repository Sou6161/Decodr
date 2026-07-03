import { useQuery } from '@tanstack/react-query';
import { RepositoryStatus } from '@arcloom/types';
import { repositoriesApi, repositoryKeys } from './api';

/** True for statuses where processing has settled (no more polling needed). */
function isTerminal(status: RepositoryStatus): boolean {
  return status === RepositoryStatus.Ready || status === RepositoryStatus.Failed;
}

/** Lists all analyzed repositories. */
export function useRepositories() {
  return useQuery({
    queryKey: repositoryKeys.all,
    queryFn: async () => (await repositoriesApi.list()).repositories,
  });
}

/** Fetches a single repository's summary. */
export function useRepository(id: string | undefined) {
  return useQuery({
    queryKey: repositoryKeys.detail(id ?? ''),
    queryFn: async () => (await repositoriesApi.detail(id as string)).repository,
    enabled: Boolean(id),
  });
}

/**
 * Polls a repository's processing progress every second until it reaches a
 * terminal status, then stops.
 */
export function useRepositoryProgress(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: repositoryKeys.progress(id ?? ''),
    queryFn: async () => (await repositoriesApi.progress(id as string)).progress,
    enabled: Boolean(id) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminal(status) ? false : 1000;
    },
  });
}
