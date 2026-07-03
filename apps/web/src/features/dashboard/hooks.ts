import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from './api';

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['repositories', id, 'dashboard'],
    queryFn: async () => (await dashboardApi.get(id as string)).stats,
    enabled: Boolean(id),
  });
}
