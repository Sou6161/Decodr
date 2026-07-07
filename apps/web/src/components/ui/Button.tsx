import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

// Chunky "pop" buttons: a solid bottom edge that presses down on click.
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-[0_4px_0_0_var(--color-primary-soft)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-primary-soft)]',
  secondary:
    'bg-surface-raised text-foreground border-2 border-border-strong shadow-[0_4px_0_0_var(--color-border)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-border)]',
  ghost: 'text-muted hover:text-foreground hover:bg-surface-raised',
  danger:
    'bg-danger text-white shadow-[0_4px_0_0_var(--color-danger-soft)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--color-danger-soft)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Hand-built button primitive. No component library. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-all duration-150 outline-none cursor-pointer select-none',
        'focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
