import { create } from "zustand";
import type { Task, TaskCreateInput, TaskPatchInput } from "../types/task";
import {
  tasksList,
  tasksCreate,
  tasksUpdate,
  tasksRemove,
} from "../services/tauriCommands";
import { useWorkspaceStore } from "./workspaceStore";

interface TaskStore {
  tasks: Map<string, Task>;
  drawerOpen: boolean;
  loaded: boolean;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  hydrate: () => Promise<void>;
  createTask: (input: TaskCreateInput) => Promise<Task | null>;
  updateTask: (id: string, patch: TaskPatchInput) => Promise<Task | null>;
  removeTask: (id: string) => Promise<void>;
  getTasks: () => Task[];
  getVisibleTasks: () => Task[];
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: new Map(),
  drawerOpen: false,
  loaded: false,

  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),

  hydrate: async () => {
    try {
      const list = await tasksList();
      const next = new Map<string, Task>();
      for (const t of list) next.set(t.id, t);
      set({ tasks: next, loaded: true });
    } catch (e) {
      console.error("taskStore.hydrate failed:", e);
    }
  },

  createTask: async (input) => {
    try {
      const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
      const t = await tasksCreate({ ...input, workspace_id: input.workspace_id ?? wsId });
      const next = new Map(get().tasks);
      next.set(t.id, t);
      set({ tasks: next });
      return t;
    } catch (e) {
      console.error("taskStore.createTask failed:", e);
      return null;
    }
  },

  updateTask: async (id, patch) => {
    try {
      const t = await tasksUpdate(id, patch);
      const next = new Map(get().tasks);
      next.set(t.id, t);
      set({ tasks: next });
      return t;
    } catch (e) {
      console.error("taskStore.updateTask failed:", e);
      return null;
    }
  },

  removeTask: async (id) => {
    try {
      await tasksRemove(id);
    } catch (e) {
      console.error("taskStore.removeTask failed:", e);
    }
    const next = new Map(get().tasks);
    next.delete(id);
    set({ tasks: next });
  },

  getTasks: () => Array.from(get().tasks.values()),

  getVisibleTasks: () => {
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const all = Array.from(get().tasks.values());
    if (wsId === null) return all;
    return all.filter((t) => (t.workspace_id ?? wsId) === wsId);
  },
}));
