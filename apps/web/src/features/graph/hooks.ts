import { useQuery } from '@tanstack/react-query';
import { graphApi } from './api';

export function useRepositoryGraph(id: string | undefined) {
  return useQuery({
    queryKey: ['repositories', id, 'graph'],
    queryFn: async () => (await graphApi.get(id as string)).graph,
    enabled: Boolean(id),
  });
}
