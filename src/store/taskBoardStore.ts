import { create } from "zustand";
import { generateId } from "../utils/id";

export interface TaskBoard {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface TaskBoardStore {
  boards: Map<string, TaskBoard>;
  addBoard: (opts?: { position?: { x: number; y: number } }) => string;
  updateBoard: (id: string, patch: Partial<Omit<TaskBoard, "id">>) => void;
  removeBoard: (id: string) => void;
  bringToFront: (id: string) => void;
}

export const useTaskBoardStore = create<TaskBoardStore>((set) => ({
  boards: new Map(),

  addBoard: (opts = {}) => {
    const id = generateId("tb");
    const board: TaskBoard = {
      id,
      label: "Tasks",
      position: opts.position ?? { x: 300, y: 200 },
      size: { width: 320, height: 400 },
      zIndex: Date.now(),
    };
    set((state) => {
      const next = new Map(state.boards);
      next.set(id, board);
      return { boards: next };
    });
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
  },

  removeBoard: (id) => {
    set((state) => {
      const next = new Map(state.boards);
      next.delete(id);
      return { boards: next };
    });
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
}));
