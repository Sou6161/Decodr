import { useOutletContext } from 'react-router-dom';
import type { Repository } from '@arcloom/types';
import { ErrorState, Skeleton } from '@/components/ui';
import {
  DashboardIcon,
  GraphIcon,
  SparkIcon,
  UploadIcon,
} from '@/components/icons';
import { useDashboard } from '@/features/dashboard/hooks';
import {
  FolderOverview,
  RankedList,
  StatTile,
} from '@/features/dashboard/DashboardWidgets';

export function DashboardPage() {
  const repo = useOutletContext<Repository>();
  const { data: stats, isLoading, isError, refetch } = useDashboard(repo.id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <ErrorState
        title="Couldn't load insights"
        action={{ label: 'Retry', onClick: () => void refetch() }}
      />
    );
  }

  const tiles = [
    { label: 'Files', value: stats.totalFiles, icon: <UploadIcon width={16} height={16} /> },
    { label: 'Components', value: stats.totalComponents, icon: <GraphIcon width={16} height={16} /> },
    { label: 'Hooks', value: stats.totalHooks, icon: <SparkIcon width={16} height={16} /> },
    { label: 'Routes', value: stats.totalRoutes, icon: <DashboardIcon width={16} height={16} /> },
    { label: 'Lines', value: stats.totalLines, icon: <DashboardIcon width={16} height={16} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankedList
          title="Largest components"
          unit="lines"
          items={stats.largestComponents}
          emptyLabel="No components detected."
        />
        <RankedList
          title="Most imported components"
          unit="imports"
          items={stats.mostImportedComponents}
          emptyLabel="No shared components yet."
        />
      </div>

      <FolderOverview folders={stats.folders} />
    </div>
  );
}
