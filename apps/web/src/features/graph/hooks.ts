import type { RepositoryEntitiesResponse } from '@decodr/types';
import { useQuery } from '@tanstack/react-query';
import { graphApi } from './api';
import { apiClient } from '@/services/apiClient';

/** Files, components, hooks and routes — used to tell routed screens from orphans. */
export function useRepositoryEntities(id: string | undefined) {
  return useQuery({
    queryKey: ['repositories', id, 'entities'],
    queryFn: async () =>
      apiClient.get<RepositoryEntitiesResponse>(`/repositories/${id as string}/components`),
    enabled: Boolean(id),
  });
}

export function useRepositoryGraph(id: string | undefined) {
  return useQuery({
    queryKey: ['repositories', id, 'graph'],
    queryFn: async () => (await graphApi.get(id as string)).graph,
    enabled: Boolean(id),
  });
}
