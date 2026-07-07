import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  add: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 4200;

/** Lightweight, hand-built toast queue. No toast library. */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  add: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Imperative helper for use outside React (e.g. mutation callbacks). */
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().add({ title, variant: 'success', ...(description ? { description } : {}) }),
  error: (title: string, description?: string) =>
    useToastStore.getState().add({ title, variant: 'error', ...(description ? { description } : {}) }),
  info: (title: string, description?: string) =>
    useToastStore.getState().add({ title, variant: 'info', ...(description ? { description } : {}) }),
};
