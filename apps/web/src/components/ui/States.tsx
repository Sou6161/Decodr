import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Button } from './Button';

interface StateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** Generic empty state — no data yet. */
export function EmptyState({ icon, title, description, action, className }: StateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border',
        'px-6 py-16 text-center',
        className,
      )}
    >
      {icon && <div className="mb-4 text-subtle">{icon}</div>}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && (
        <Button className="mt-5" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/** Error state with optional retry. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: Partial<StateProps>) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-danger/30 bg-danger/5',
        'px-6 py-14 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger/15 text-danger">
        !
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && (
        <Button className="mt-5" size="sm" variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
