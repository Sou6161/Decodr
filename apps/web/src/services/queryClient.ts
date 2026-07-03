import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from './apiClient';

/** Shared TanStack Query client with sensible defaults for this app. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Don't retry client errors (4xx) — only transient/server failures.
        if (error instanceof ApiClientError && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
