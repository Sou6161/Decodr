import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadApi } from './api';
import { repositoryKeys } from '@/features/repositories/api';

/** Uploads a ZIP and, on success, refreshes the repository list. */
export function useUploadRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadApi.upload(file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}
