import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

/** Shimmering placeholder used for loading states. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-surface-raised/80',
        className,
      )}
      {...props}
    />
  );
}
