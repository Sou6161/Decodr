import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore, type ToastVariant } from '@/stores/toastStore';
import { CloseIcon } from '@/components/icons';
import { cn } from '@/utils/cn';

const ACCENT: Record<ToastVariant, string> = {
  success: 'before:bg-success',
  error: 'before:bg-danger',
  info: 'before:bg-primary',
};

/** Fixed toast stack, bottom-right. Mounted once in the app shell. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-border glass p-4 pl-5 shadow-lg shadow-black/30',
              'before:absolute before:inset-y-0 before:left-0 before:w-1',
              ACCENT[t.variant],
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-sm text-muted">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="-mr-1 -mt-1 shrink-0 rounded-lg p-1 text-subtle hover:bg-surface-raised hover:text-foreground"
                aria-label="Dismiss"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
