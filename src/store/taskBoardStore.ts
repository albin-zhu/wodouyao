import { create } from "zustand";
import { generateId } from "../utils/id";
import {
  taskBoardsCreate,
  taskBoardsUpdate as taskBoardsUpdateIpc,
  taskBoardsRemove as taskBoardsRemoveIpc,
  type TaskBoardIpc,
} from "../services/tauriCommands";
import { useWorkspaceStore } from "./workspaceStore";

export interface TaskBoard {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  workspaceId?: string | null;
}

function fromIpc(b: TaskBoardIpc): TaskBoard {
  return {
    id: b.id,
    label: b.label,
    position: b.position,
    size: b.size,
    zIndex: b.z_index,
    workspaceId: b.workspace_id ?? null,
  };
}

interface TaskBoardStore {
  boards: Map<string, TaskBoard>;
  addBoard: (opts?: { position?: { x: number; y: number } }) => string;
  updateBoard: (id: string, patch: Partial<Omit<TaskBoard, "id">>) => void;
  removeBoard: (id: string) => void;
  bringToFront: (id: string) => void;
  getVisibleBoards: () => TaskBoard[];
  syncFromRust: (ipc: TaskBoardIpc[]) => void;
}

export const useTaskBoardStore = create<TaskBoardStore>((set, get) => ({
  boards: new Map(),

  addBoard: (opts = {}) => {
    const id = generateId("tb");
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const board: TaskBoard = {
      id,
      label: "Tasks",
      position: opts.position ?? { x: 300, y: 200 },
      size: { width: 320, height: 400 },
      zIndex: Date.now(),
      workspaceId: wsId,
    };
    set((state) => {
      const next = new Map(state.boards);
      next.set(id, board);
      return { boards: next };
    });
    taskBoardsCreate({
      id: board.id,
      label: board.label,
      position: board.position,
      size: board.size,
      workspace_id: wsId,
    }).catch(() => {});
    return id;
  },

  updateBoard: (id, patch) => {
    set((state) => {
      const board = state.boards.get(id);
      if (!board) return state;
      const next = new Map(state.boards);
      next.set(id, { ...board, ...patch });
      return { boards: next };
    });
    const ipcPatch: Record<string, unknown> = {};
    if (patch.label !== undefined) ipcPatch.label = patch.label;
    if (patch.position !== undefined) ipcPatch.position = patch.position;
    if (patch.size !== undefined) ipcPatch.size = patch.size;
    if (Object.keys(ipcPatch).length > 0) {
      taskBoardsUpdateIpc(id, ipcPatch).catch(() => {});
    }
  },

  removeBoard: (id) => {
    set((state) => {
      const next = new Map(state.boards);
      next.delete(id);
      return { boards: next };
    });
    taskBoardsRemoveIpc(id).catch(() => {});
  },

  bringToFront: (id) => {
    set((state) => {
      const board = state.boards.get(id);
      if (!board) return state;
      const next = new Map(state.boards);
      next.set(id, { ...board, zIndex: Date.now() });
      return { boards: next };
    });
  },

  syncFromRust: (ipc) => {
    const next = new Map<string, TaskBoard>();
    for (const b of ipc) {
      const node = fromIpc(b);
      next.set(node.id, node);
    }
    set({ boards: next });
  },

  getVisibleBoards: () => {
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const all = Array.from(get().boards.values());
    if (wsId === null) return all;
    return all.filter((b) => (b.workspaceId ?? wsId) === wsId);
  },
}));
