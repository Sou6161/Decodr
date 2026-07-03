import { useOutletContext } from 'react-router-dom';
import type { Repository } from '@arcloom/types';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { GraphIcon } from '@/components/icons';
import { useRepositoryGraph } from '@/features/graph/hooks';
import { GraphView } from '@/features/graph/GraphView';

export function GraphPage() {
  const repo = useOutletContext<Repository>();
  const { data: graph, isLoading, isError, refetch } = useRepositoryGraph(repo.id);

  if (isLoading) {
    return <Skeleton className="h-[calc(100vh-15rem)] min-h-[460px] rounded-2xl" />;
  }

  if (isError || !graph) {
    return (
      <ErrorState
        title="Couldn't load the graph"
        action={{ label: 'Retry', onClick: () => void refetch() }}
      />
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={<GraphIcon width={28} height={28} />}
        title="No components to graph"
        description="Arcloom didn't detect any React components in this repository."
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        {graph.nodes.length} components · {graph.edges.length} relationships. Drag to pan,
        scroll to zoom, click a node for details.
      </p>
      <GraphView graph={graph} />
    </div>
  );
}
