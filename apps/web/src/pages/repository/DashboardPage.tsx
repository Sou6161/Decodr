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
import { useDashboard } from '@/features/dashboard/hooks';
import { DepartureBoard, RankedList } from '@/features/dashboard/DashboardWidgets';
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

  const cells = [
    { label: 'Files', value: stats.totalFiles },
    { label: 'Folders', value: stats.totalFolders },
    { label: 'Components', value: stats.totalComponents },
    { label: 'Hooks', value: stats.totalHooks },
    { label: 'Routes', value: stats.totalRoutes },
    { label: 'Lines', value: stats.totalLines },
  ];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={fadeUpItem}>
        <DepartureBoard
          title="At a glance"
          note={`${stats.totalFiles} files across ${stats.totalFolders} folders`}
          cells={cells}
        />
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
          color="var(--color-line-blue)"
          items={stats.largestComponents}
          emptyLabel="No components detected."
        />
        <RankedList
          title="Most imported components"
          unit="imports"
          color="var(--color-line-orange)"
          items={stats.mostImportedComponents}
          emptyLabel="No shared components yet."
        />
      </motion.div>
    </motion.div>
  );
}
