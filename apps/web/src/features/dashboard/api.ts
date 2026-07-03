import type { RepositoryDashboardResponse } from '@arcloom/types';
import { apiClient } from '@/services/apiClient';

export const dashboardApi = {
  get: (id: string) =>
    apiClient.get<RepositoryDashboardResponse>(`/repositories/${id}/dashboard`),
};
