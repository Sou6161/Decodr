import { RepositoryStatus } from '@decodr/types';
import type { BadgeProps } from '@/components/ui';

/** Maps a repository status to a badge tone + label for consistent display. */
export const STATUS_META: Record<
  RepositoryStatus,
  { tone: NonNullable<BadgeProps['tone']>; label: string }
> = {
  [RepositoryStatus.Pending]: { tone: 'neutral', label: 'Queued' },
  [RepositoryStatus.Extracting]: { tone: 'primary', label: 'Extracting' },
  [RepositoryStatus.Scanning]: { tone: 'primary', label: 'Scanning' },
  [RepositoryStatus.Analyzing]: { tone: 'primary', label: 'Analyzing' },
  [RepositoryStatus.Ready]: { tone: 'success', label: 'Ready' },
  [RepositoryStatus.Failed]: { tone: 'danger', label: 'Failed' },
};
