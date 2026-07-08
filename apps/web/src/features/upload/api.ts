import type { UploadRepositoryResponse } from '@decodr/types';
import { apiClient } from '@/services/apiClient';
import type { PickedFile } from './collectFiles';

export const uploadApi = {
  /** Upload a single ZIP archive. */
  uploadZip: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.postForm<UploadRepositoryResponse>('/repositories', form);
  },

  /** Upload pre-filtered source files from a folder (no archive). */
  uploadFolder: (name: string, files: PickedFile[]) => {
    const form = new FormData();
    form.append('name', name);
    // Manifest and files share the same order so the server can pair them.
    form.append('manifest', JSON.stringify(files.map((f) => f.path)));
    for (const f of files) form.append('files', f.file, f.file.name);
    return apiClient.postForm<UploadRepositoryResponse>('/repositories/folder', form);
  },
};
