import { create } from "zustand";
import { generateId } from "../utils/id";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  toast: (message: string, type?: ToastType, duration?: number) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  toast: (message, type = "info", duration = 3000) => {
    const id = generateId();
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, message, type }] }));
    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

// Non-hook accessor for use inside stores and plain functions
export const toast = (message: string, type?: ToastType, duration?: number) =>
  useToastStore.getState().toast(message, type, duration);
