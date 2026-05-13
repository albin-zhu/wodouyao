import { create } from "zustand";
import {
  clonesCreate,
  clonesList,
  clonesRemove,
  clonesUpdate,
  clonesValidate,
} from "../services/tauriCommands";
import type { Clone, CloneCreateInput, ClonePatchInput, CloneValidation } from "../types/clone";
import { useWorkspaceStore } from "./workspaceStore";

interface CloneStore {
  clones: Map<string, Clone>;
  drawerOpen: boolean;
  loaded: boolean;
  /** Per-clone validation results; populated lazily. */
  validation: Map<string, CloneValidation>;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  hydrate: () => Promise<void>;
  createClone: (input: CloneCreateInput) => Promise<Clone | null>;
  updateClone: (id: string, patch: ClonePatchInput) => Promise<Clone | null>;
  removeClone: (id: string) => Promise<void>;
  validateClone: (id: string) => Promise<CloneValidation | null>;

  /** Visible (current-workspace) clones, sorted by last_used desc / created desc. */
  getVisible: () => Clone[];
}

export const useCloneStore = create<CloneStore>((set, get) => ({
  clones: new Map(),
  drawerOpen: false,
  loaded: false,
  validation: new Map(),

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),

  hydrate: async () => {
    try {
      const list = await clonesList();
      const map = new Map<string, Clone>();
      for (const c of list) map.set(c.id, c);
      set({ clones: map, loaded: true });
    } catch (e) {
      console.error("cloneStore.hydrate failed:", e);
    }
  },

  createClone: async (input) => {
    try {
      const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
      const c = await clonesCreate({ ...input, workspace_id: input.workspace_id ?? wsId });
      const next = new Map(get().clones);
      next.set(c.id, c);
      set({ clones: next });
      return c;
    } catch (e) {
      console.error("cloneStore.createClone failed:", e);
      return null;
    }
  },

  updateClone: async (id, patch) => {
    try {
      const c = await clonesUpdate(id, patch);
      const next = new Map(get().clones);
      next.set(c.id, c);
      set({ clones: next });
      return c;
    } catch (e) {
      console.error("cloneStore.updateClone failed:", e);
      return null;
    }
  },

  removeClone: async (id) => {
    try {
      await clonesRemove(id);
      const next = new Map(get().clones);
      next.delete(id);
      const nextVal = new Map(get().validation);
      nextVal.delete(id);
      set({ clones: next, validation: nextVal });
    } catch (e) {
      console.error("cloneStore.removeClone failed:", e);
    }
  },

  validateClone: async (id) => {
    try {
      const v = await clonesValidate(id);
      const next = new Map(get().validation);
      next.set(id, v);
      set({ validation: next });
      return v;
    } catch (e) {
      console.error("cloneStore.validateClone failed:", e);
      return null;
    }
  },

  getVisible: () => {
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    if (!wsId) return [];
    return Array.from(get().clones.values()).sort(
      (a, b) => (b.last_used_at || b.created_at) - (a.last_used_at || a.created_at)
    );
  },
}));
