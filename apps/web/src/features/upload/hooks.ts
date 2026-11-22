import { useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadApi } from './api';
import type { UploadSelection } from './collectFiles';
import { repositoryKeys } from '@/features/repositories/api';

/** Uploads a filtered project folder and refreshes the repository list. */
export function useUploadRepository() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (selection: UploadSelection) =>
      uploadApi.uploadFolder(selection.name, selection.files),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: repositoryKeys.all });
    },
  });
}
