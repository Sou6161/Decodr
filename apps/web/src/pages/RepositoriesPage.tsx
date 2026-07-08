import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { UploadIcon } from '@/components/icons';
import { useRepositories } from '@/features/repositories/hooks';
import { RepositoryCard } from '@/features/repositories/RepositoryCard';
import { fadeUpItem, staggerContainer } from '@/utils/motion';

export function RepositoriesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useRepositories();

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Upload a codebase to explore its structure, dependencies, and components."
      />

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          title="Couldn't load projects"
          description="The API may be offline. Check that the backend is running."
          action={{ label: 'Retry', onClick: () => void refetch() }}
        />
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={<UploadIcon width={28} height={28} />}
          title="No projects yet"
          description="Upload a project folder and Decodr will map its components, dependencies, and structure."
          action={{ label: 'Upload your first project', onClick: () => navigate('/upload') }}
        />
      )}

      {data && data.length > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {data.map((repo) => (
            <motion.div key={repo.id} variants={fadeUpItem}>
              <RepositoryCard repository={repo} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
