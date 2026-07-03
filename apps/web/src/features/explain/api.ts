import type { ExplainResponse } from '@arcloom/types';
import { apiClient } from '@/services/apiClient';

export const explainApi = {
  ask: (id: string, question: string) =>
    apiClient.post<ExplainResponse>(`/repositories/${id}/explain`, { question }),
};
