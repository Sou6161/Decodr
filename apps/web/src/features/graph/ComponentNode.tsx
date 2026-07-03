import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ExportKind } from '@arcloom/types';
import { cn } from '@/utils/cn';
import type { ComponentFlowNode } from './layout';

/**
 * Custom graph node — a rounded card showing the component name, its file, and
 * its in-degree. Dimmed when a search is active and it doesn't match; ringed
 * when selected.
 */
function ComponentNodeImpl({ data, selected }: NodeProps<ComponentFlowNode>) {
  const { name, filePath, exportKind, importedByCount, dimmed } = data;
  const fileName = filePath.split('/').pop() ?? filePath;

  return (
    <div
      className={cn(
        'w-[210px] rounded-xl border bg-surface-raised px-3.5 py-2.5 shadow-sm transition-all duration-150',
        selected
          ? 'border-primary ring-2 ring-primary/50'
          : 'border-border hover:border-border-strong',
        dimmed && 'opacity-25',
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0 !bg-border-strong" />

      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
        {importedByCount > 0 && (
          <span
            className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary"
            title={`Imported by ${importedByCount} component(s)`}
          >
            {importedByCount}
          </span>
        )}
      </div>

      <div className="mt-0.5 flex items-center gap-1.5">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            exportKind === ExportKind.Default ? 'bg-accent' : 'bg-subtle',
          )}
          title={exportKind === ExportKind.Default ? 'Default export' : 'Named export'}
        />
        <span className="truncate text-[11px] text-subtle">{fileName}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0 !bg-border-strong" />
    </div>
  );
}

export const ComponentNode = memo(ComponentNodeImpl);
