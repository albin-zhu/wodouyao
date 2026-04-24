import { create } from "zustand";
import type { Workspace, WorkspaceMeta } from "../types/workspace";
import {
  saveWorkspace,
  loadWorkspace,
  listWorkspaces,
  deleteWorkspace,
  destroyTerminal,
} from "../services/tauriCommands";
import { generateId } from "../utils/id";
import { toast } from "./toastStore";
import i18n from "../i18n";

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
    cwd?: string | null
  ) => Promise<string>;
  deleteWorkspace: (id: string) => Promise<void>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
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
    // Monotonic switch token: if another switch starts before this one
    // finishes, the stale one detects the mismatch and bails out before
    // writing currentWorkspace/loading — preventing store corruption on
    // rapid consecutive switches.
    const token = Date.now() + Math.random();
    (get() as any)._pendingSwitchToken = token;

    set({ loading: true });
    try {
      const ws = await loadWorkspace(id);
      // Bail if a newer switch has started since we called loadWorkspace.
      if ((get() as any)._pendingSwitchToken !== token) return;
      await (applyWorkspace as (w: Workspace) => Promise<void> | void)(ws);
      if ((get() as any)._pendingSwitchToken !== token) return;
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
      toast(i18n.t("toast.workspaceSwitched", { name: ws.name }), "info", 2500);
    } catch (e) {
      console.error("Failed to load workspace:", e);
      set({ loading: false });
      toast(i18n.t("toast.workspaceError"), "error");
    }
  },

  createWorkspace: async (name, cwd) => {
    const id = generateId();
    const now = Date.now();
    // Save a BLANK workspace — no terminals, no notes, no wires.
    // Stamping live entities from the current WS would contaminate the new
    // one and is the root cause of cross-workspace leakage.
    const ws: Workspace = {
      id,
      name,
      cwd: cwd ?? undefined,
      canvas: { pan_x: 0, pan_y: 0, zoom: 1, grid_visible: true, grid_size: 40 },
      terminals: [],
      wires: [],
      tasks: [],
      notes: [],
      file_nodes: [],
      task_boards: [],
      created_at: now,
      updated_at: now,
    };

    try {
      await saveWorkspace(ws);
      await get().loadWorkspaceList();
      toast(i18n.t("toast.workspaceCreated"), "success", 2000);
      return id;
    } catch (e) {
      console.error("Failed to create workspace:", e);
      return id;
    }
    // Note: we do NOT set currentWorkspace here. The caller (WorkspaceSwitcher)
    // must call loadWorkspaceById(id, applyWorkspace) to do a proper
    // reconcile-switch, which isolates notes/canvas/wires from the old WS.
  },

  deleteWorkspace: async (id) => {
    try {
      // Kill any live terminals belonging to this workspace + scrub their
      // entities from the FE stores so we don't keep zombie PTYs around.
      // Loaded lazily to avoid a cycle (these stores import workspaceStore).
      const { useTerminalStore } = await import("./terminalStore");
      const { useWireStore } = await import("./wireStore");
      const { useNoteStore } = await import("./noteStore");
      const { useFileNodeStore } = await import("./fileNodeStore");
      const { useTaskBoardStore } = await import("./taskBoardStore");
      const { useTaskStore } = await import("./taskStore");

      const termStore = useTerminalStore.getState();
      const doomedTerms = Array.from(termStore.terminals.values()).filter(
        (t) => t.workspaceId === id
      );
      for (const t of doomedTerms) {
        await destroyTerminal(t.id).catch(() => {});
        termStore.removeTerminal(t.id);
      }

      const trim = <V extends { workspaceId?: string | null }>(
        m: Map<string, V>
      ): Map<string, V> => {
        const next = new Map<string, V>();
        for (const [k, v] of m) {
          if (v.workspaceId !== id) next.set(k, v);
        }
        return next;
      };
      useWireStore.setState({ wires: trim(useWireStore.getState().wires) });
      useNoteStore.setState({ notes: trim(useNoteStore.getState().notes) });
      useFileNodeStore.setState({
        fileNodes: trim(useFileNodeStore.getState().fileNodes),
      });
      useTaskBoardStore.setState({
        boards: trim(useTaskBoardStore.getState().boards),
      });
      // Tasks use snake_case workspace_id (matches Rust struct).
      const tasks = useTaskStore.getState().tasks;
      const trimmedTasks = new Map<string, import("../types/task").Task>();
      for (const [k, v] of tasks) {
        if (v.workspace_id !== id) trimmedTasks.set(k, v);
      }
      useTaskStore.setState({ tasks: trimmedTasks });

      await deleteWorkspace(id);
      const { currentWorkspace } = get();
      if (currentWorkspace?.id === id) {
        set({ currentWorkspace: null });
      }
      await get().loadWorkspaceList();
      toast(i18n.t("toast.workspaceDeleted"), "warning", 3000);
    } catch (e) {
      console.error("Failed to delete workspace:", e);
    }
  },

  renameWorkspace: async (id, name) => {
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
