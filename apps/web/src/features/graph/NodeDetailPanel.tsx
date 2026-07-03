import { motion } from 'framer-motion';
import { ExportKind, type GraphNodeData } from '@arcloom/types';
import { Badge } from '@/components/ui';
import { CloseIcon } from '@/components/icons';

interface NodeDetailPanelProps {
  data: GraphNodeData;
  onClose: () => void;
}

/** Slide-in panel showing metadata for the selected component node. */
export function NodeDetailPanel({ data, onClose }: NodeDetailPanelProps) {
  const rows: { label: string; value: string }[] = [
    { label: 'File', value: data.filePath },
    { label: 'Export', value: data.exportKind === ExportKind.Default ? 'Default' : 'Named' },
    { label: 'Imported by', value: `${data.importedByCount} component(s)` },
    { label: 'Lines', value: String(data.lineCount) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="absolute right-3 top-3 z-10 w-72 rounded-xl border border-border glass p-4 shadow-lg shadow-black/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{data.name}</h3>
          <Badge tone="primary" className="mt-1.5">
            Component
          </Badge>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted hover:bg-surface-raised hover:text-foreground"
          aria-label="Close details"
        >
          <CloseIcon width={16} height={16} />
        </button>
      </div>

      <dl className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] uppercase tracking-wide text-subtle">{row.label}</dt>
            <dd className="mt-0.5 break-words font-mono text-xs text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </motion.div>
  );
}
