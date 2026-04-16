import { create } from "zustand";
import type { Workspace, WorkspaceMeta } from "../types/workspace";
import {
  saveWorkspace,
  loadWorkspace,
  listWorkspaces,
  deleteWorkspace,
} from "../services/tauriCommands";
import { generateId } from "../utils/id";

interface WorkspaceStore {
  currentWorkspace: WorkspaceMeta | null;
  currentWorkspaceCwd: string | null;
  workspaces: WorkspaceMeta[];
  loading: boolean;

  setCurrentWorkspace: (meta: WorkspaceMeta | null) => void;
  setWorkspaceCwd: (cwd: string | null) => void;
  loadWorkspaceList: () => Promise<void>;
  saveCurrentWorkspace: (
    name: string | undefined,
    buildWorkspace: () => Workspace
  ) => Promise<void>;
  loadWorkspaceById: (
    id: string,
    applyWorkspace: (ws: Workspace) => void
  ) => Promise<void>;
  createWorkspace: (
    name: string,
    buildWorkspace: () => Workspace
  ) => Promise<string>;
  deleteWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (
    id: string,
    name: string,
    buildWorkspace: () => Workspace
  ) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  currentWorkspace: null,
  currentWorkspaceCwd: null,
  workspaces: [],
  loading: false,

  setCurrentWorkspace: (meta) => set({ currentWorkspace: meta }),
  setWorkspaceCwd: (cwd) => set({ currentWorkspaceCwd: cwd }),

  loadWorkspaceList: async () => {
    try {
      const list = await listWorkspaces();
      set({ workspaces: list });
    } catch (e) {
      console.error("Failed to list workspaces:", e);
    }
  },

  saveCurrentWorkspace: async (name, buildWorkspace) => {
    const { currentWorkspace } = get();
    const ws = buildWorkspace();

    if (currentWorkspace) {
      ws.id = currentWorkspace.id;
      ws.name = name ?? currentWorkspace.name;
      ws.created_at = currentWorkspace.updated_at; // preserve original
    } else {
      ws.id = generateId();
      ws.name = name ?? "Default Workspace";
    }
    ws.updated_at = Date.now();

    try {
      await saveWorkspace(ws);
      const meta: WorkspaceMeta = {
        id: ws.id,
        name: ws.name,
        terminal_count: ws.terminals.length,
        updated_at: ws.updated_at,
      };
      set({ currentWorkspace: meta });
      await get().loadWorkspaceList();
    } catch (e) {
      console.error("Failed to save workspace:", e);
    }
  },

  loadWorkspaceById: async (id, applyWorkspace) => {
    set({ loading: true });
    try {
      const ws = await loadWorkspace(id);
      applyWorkspace(ws);
      set({
        currentWorkspace: {
          id: ws.id,
          name: ws.name,
          terminal_count: ws.terminals.length,
          updated_at: ws.updated_at,
        },
        currentWorkspaceCwd: ws.cwd ?? null,
        loading: false,
      });
    } catch (e) {
      console.error("Failed to load workspace:", e);
      set({ loading: false });
    }
  },

  createWorkspace: async (name, buildWorkspace) => {
    const ws = buildWorkspace();
    ws.id = generateId();
    ws.name = name;
    ws.updated_at = Date.now();
    ws.created_at = Date.now();

    try {
      await saveWorkspace(ws);
      const meta: WorkspaceMeta = {
        id: ws.id,
        name: ws.name,
        terminal_count: ws.terminals.length,
        updated_at: ws.updated_at,
      };
      set({ currentWorkspace: meta });
      await get().loadWorkspaceList();
      return ws.id;
    } catch (e) {
      console.error("Failed to create workspace:", e);
      return ws.id;
    }
  },

  deleteWorkspace: async (id) => {
    try {
      await deleteWorkspace(id);
      const { currentWorkspace } = get();
      if (currentWorkspace?.id === id) {
        set({ currentWorkspace: null });
      }
      await get().loadWorkspaceList();
    } catch (e) {
      console.error("Failed to delete workspace:", e);
    }
  },

  renameWorkspace: async (id, name, _buildWorkspace) => {
    try {
      const ws = await loadWorkspace(id);
      ws.name = name;
      ws.updated_at = Date.now();
      await saveWorkspace(ws);
      const { currentWorkspace } = get();
      if (currentWorkspace?.id === id) {
        set({ currentWorkspace: { ...currentWorkspace, name } });
      }
      await get().loadWorkspaceList();
    } catch (e) {
      console.error("Failed to rename workspace:", e);
    }
  },
}));
