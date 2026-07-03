import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { UploadIcon } from '@/components/icons';
import { useRepositories } from '@/features/repositories/hooks';
import { RepositoryCard } from '@/features/repositories/RepositoryCard';

export function RepositoriesPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useRepositories();

  return (
    <div>
      <PageHeader
        title="Repositories"
        description="Upload a React + TypeScript project to map its architecture."
        actions={
          <Button onClick={() => navigate('/upload')}>
            <UploadIcon width={16} height={16} />
            Upload repository
          </Button>
        }
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
          title="Couldn't load repositories"
          description="The API may be offline. Check that the backend is running."
          action={{ label: 'Retry', onClick: () => void refetch() }}
        />
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={<UploadIcon width={28} height={28} />}
          title="No repositories yet"
          description="Upload a ZIP of a React + TypeScript project and Arcloom will analyze its architecture."
          action={{ label: 'Upload your first repository', onClick: () => navigate('/upload') }}
        />
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((repo) => (
            <RepositoryCard key={repo.id} repository={repo} />
          ))}
        </div>
      )}
    </div>
  );
}
