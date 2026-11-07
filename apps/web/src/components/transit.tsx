import { cn } from '@/utils/cn';

/** The route colours, in the order projects are given them. */
export const LINE_COLORS = [
  'var(--color-line-teal)',
  'var(--color-line-orange)',
  'var(--color-line-pink)',
  'var(--color-line-blue)',
  'var(--color-line-lime)',
  'var(--color-line-sun)',
];

/** A stable line colour for a name, so a project keeps its colour everywhere. */
export function lineColorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LINE_COLORS[h % LINE_COLORS.length]!;
}

/** Station name board: white on dark, with the line colour along the bottom. */
export function StationBoard({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string;
  color: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <span className={cn('inline-flex max-w-full flex-col overflow-hidden rounded-md', className)}>
      <span
        className={cn(
          'truncate bg-ink font-display font-bold text-white',
          size === 'lg' ? 'px-5 pb-2 pt-2.5 text-3xl tracking-tight' : 'px-4 pb-1.5 pt-2 text-2xl uppercase tracking-wide',
        )}
      >
        {name}
      </span>
      <span className="h-[6px]" style={{ background: color }} />
    </span>
  );
}

/** A tiny two-car train seen from above. Pass `horizontal` to lay it on its side. */
export function Train({ horizontal = false }: { horizontal?: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center justify-between rounded-[7px] bg-foreground p-[3px]',
        horizontal ? 'h-[18px] w-[30px] flex-row' : 'h-[30px] w-[18px] flex-col',
      )}
    >
      <span className={cn('rounded-[3px] bg-line-sun', horizontal ? 'h-full w-[8px]' : 'h-[8px] w-full')} />
      <span className={cn('rounded bg-surface/40', horizontal ? 'h-[8px] w-[2px]' : 'h-[2px] w-[8px]')} />
      <span className={cn('rounded-[3px] bg-surface/80', horizontal ? 'h-full w-[8px]' : 'h-[8px] w-full')} />
    </span>
  );
}
