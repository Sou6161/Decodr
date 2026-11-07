import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/PageHeader';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { UploadIcon } from '@/components/icons';
import { Train } from '@/components/transit';
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
        <EmptyPlatform onUpload={() => navigate('/upload')} />
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

/** No projects yet: an empty platform, a train waiting at the buffer stop. */
function EmptyPlatform({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="pop rounded-3xl border border-border bg-surface px-6 py-14 text-center">
      <div aria-hidden className="mx-auto flex max-w-xs items-center">
        <span className="h-[7px] flex-1 rounded-full bg-[repeating-linear-gradient(90deg,var(--color-border-strong)_0_14px,transparent_14px_22px)]" />
        <span className="mx-2">
          <Train horizontal />
        </span>
        <span className="h-[18px] w-[7px] rounded-full bg-foreground" />
      </div>
      <h2 className="mt-8 font-display text-2xl font-bold">Nothing on the map yet</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
        Upload a project folder and Decodr will map its components, dependencies, and structure.
      </p>
      <Button className="mt-6" onClick={onUpload}>
        <UploadIcon width={16} height={16} />
        Upload your first project
      </Button>
    </div>
  );
}
