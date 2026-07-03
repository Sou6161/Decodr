import type { UploadRepositoryResponse } from '@arcloom/types';
import { apiClient } from '@/services/apiClient';

export const uploadApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.postForm<UploadRepositoryResponse>('/repositories', form);
  },
};
