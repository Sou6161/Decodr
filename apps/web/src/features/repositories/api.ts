import type {
  ListRepositoriesResponse,
  RepositoryDetailResponse,
  RepositoryProgressResponse,
} from '@arcloom/types';
import { apiClient } from '@/services/apiClient';

/** Repository feature API calls. One module per feature keeps endpoints discoverable. */
export const repositoriesApi = {
  list: () => apiClient.get<ListRepositoriesResponse>('/repositories'),
  detail: (id: string) =>
    apiClient.get<RepositoryDetailResponse>(`/repositories/${id}`),
  progress: (id: string) =>
    apiClient.get<RepositoryProgressResponse>(`/repositories/${id}/progress`),
};

/** Query keys, centralized to avoid string drift across hooks. */
export const repositoryKeys = {
  all: ['repositories'] as const,
  detail: (id: string) => ['repositories', id] as const,
  progress: (id: string) => ['repositories', id, 'progress'] as const,
};
