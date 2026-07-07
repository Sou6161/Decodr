import { useState } from 'react';
import type { FolderTreeNode } from '@arcloom/types';
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
} from '@/components/icons';
import { cn } from '@/utils/cn';

/**
 * Collapsible project structure tree. Folders roll up file/component counts and
 * expand on click; the top level is open by default so the shape is visible.
 */
export function FolderTree({ nodes }: { nodes: FolderTreeNode[] }) {
  return (
    <div className="max-h-[28rem] overflow-y-auto pr-1">
      {nodes.map((node) => (
        <TreeRow key={node.path} node={node} depth={0} defaultOpen />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  defaultOpen = false,
}: {
  node: FolderTreeNode;
  depth: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isFolder = node.type === 'folder';
  const pad = 8 + depth * 16;

  if (!isFolder) {
    return (
      <div
        className="flex items-center gap-2 rounded-md py-1.5 pr-2 text-sm"
        style={{ paddingLeft: pad + 20 }}
      >
        <FileIcon width={15} height={15} className="shrink-0 text-subtle" />
        <span className="truncate font-mono text-xs text-muted">{node.name}</span>
        {node.componentCount > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {node.componentCount} comp
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors hover:bg-surface-raised/60"
        style={{ paddingLeft: pad }}
      >
        <ChevronRightIcon
          width={14}
          height={14}
          className={cn('shrink-0 text-subtle transition-transform', open && 'rotate-90')}
        />
        <FolderIcon width={15} height={15} className="shrink-0 text-accent" />
        <span className="truncate text-sm font-medium text-foreground">{node.name}</span>
        <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] tabular-nums text-subtle">
          {node.fileCount} file{node.fileCount === 1 ? '' : 's'}
          {node.componentCount > 0 && ` · ${node.componentCount} comp`}
        </span>
      </button>

      {open &&
        node.children?.map((child) => (
          <TreeRow key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}
