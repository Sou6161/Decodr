import type { RepositoryGraphResponse } from '@arcloom/types';
import { apiClient } from '@/services/apiClient';

export const graphApi = {
  get: (id: string) =>
    apiClient.get<RepositoryGraphResponse>(`/repositories/${id}/graph`),
};
