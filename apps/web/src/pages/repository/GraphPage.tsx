import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { Repository } from '@arcloom/types';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { GraphIcon } from '@/components/icons';
import { useRepositoryGraph } from '@/features/graph/hooks';
import { GraphView } from '@/features/graph/GraphView';
import { FeatureMap } from '@/features/graph/FeatureMap';
import { cn } from '@/utils/cn';

type View = 'overview' | 'graph';

export function GraphPage() {
  const repo = useOutletContext<Repository>();
  const { data: graph, isLoading, isError, refetch } = useRepositoryGraph(repo.id);
  const [view, setView] = useState<View>('overview');

  if (isLoading) {
    return <Skeleton className="h-[calc(100vh-13rem)] min-h-[460px] rounded-2xl" />;
  }

  if (isError || !graph) {
    return (
      <ErrorState
        title="Couldn't load the architecture"
        action={{ label: 'Retry', onClick: () => void refetch() }}
      />
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <EmptyState
        icon={<GraphIcon width={28} height={28} />}
        title="No components to visualize"
        description="Arcloom didn't detect any React components in this repository."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface-raised p-0.5">
          {(['overview', 'graph'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'overview' ? <FeatureMap graph={graph} /> : <GraphView graph={graph} />}
    </div>
  );
}
