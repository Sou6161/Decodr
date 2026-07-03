import { useMutation } from '@tanstack/react-query';
import { explainApi } from './api';

/** Fires a single explanation request. This is a focused Q&A, not a chat. */
export function useExplain(repositoryId: string) {
  return useMutation({
    mutationFn: (question: string) => explainApi.ask(repositoryId, question),
  });
}
