import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Repository } from '@decodr/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
} from '@/components/ui';
import {
  FileIcon,
  FolderIcon,
  GraphIcon,
  DashboardIcon,
  SparkIcon,
} from '@/components/icons';
import { useDashboard } from '@/features/dashboard/hooks';
import { RankedList, StatTile } from '@/features/dashboard/DashboardWidgets';
import { FolderTree } from '@/features/dashboard/FolderTree';
import { fadeUpItem, staggerContainer } from '@/utils/motion';

export function DashboardPage() {
  const repo = useOutletContext<Repository>();
  const { data: stats, isLoading, isError, refetch } = useDashboard(repo.id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
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
    { label: 'Files', value: stats.totalFiles, icon: <FileIcon width={16} height={16} /> },
    { label: 'Folders', value: stats.totalFolders, icon: <FolderIcon width={16} height={16} /> },
    { label: 'Components', value: stats.totalComponents, icon: <GraphIcon width={16} height={16} /> },
    { label: 'Hooks', value: stats.totalHooks, icon: <SparkIcon width={16} height={16} /> },
    { label: 'Routes', value: stats.totalRoutes, icon: <DashboardIcon width={16} height={16} /> },
    { label: 'Lines', value: stats.totalLines, icon: <DashboardIcon width={16} height={16} /> },
  ];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
      <motion.div
        variants={staggerContainer}
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6"
      >
        {tiles.map((t) => (
          <motion.div key={t.label} variants={fadeUpItem}>
            <StatTile {...t} />
          </motion.div>
        ))}
      </motion.div>

      {/* Project structure — the clearest read on how the codebase is organized. */}
      <motion.div variants={fadeUpItem}>
        <Card>
          <CardHeader>
            <CardTitle>Project structure</CardTitle>
            <p className="mt-1 text-xs text-subtle">
              {stats.totalFiles} files across {stats.totalFolders} folders · click a folder to
              expand. Counts show files and React components in each folder.
            </p>
          </CardHeader>
          <CardContent>
            {stats.tree.length === 0 ? (
              <p className="py-6 text-center text-sm text-subtle">No source files found.</p>
            ) : (
              <FolderTree nodes={stats.tree} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={fadeUpItem} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
      </motion.div>
    </motion.div>
  );
}
