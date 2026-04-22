import { create } from "zustand";
import type { TerminalNode, TerminalRole, TerminalStatus } from "../types/terminal";
import {
  DEFAULT_TERMINAL_WIDTH,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TITLE_BAR_HEIGHT,
} from "../utils/constants";
import { DEFAULT_COLOR, DEFAULT_THEME } from "../utils/terminalThemes";
import { generateId } from "../utils/id";
import { useWorkspaceStore } from "./workspaceStore";

interface TerminalStore {
  terminals: Map<string, TerminalNode>;
  nextZIndex: number;

  addTerminal: (overrides?: Partial<TerminalNode>) => TerminalNode;
  removeTerminal: (id: string) => void;
  updateTerminal: (id: string, updates: Partial<TerminalNode>) => void;
  foldTerminal: (id: string) => void;
  unfoldTerminal: (id: string) => void;
  foldAll: () => void;
  unfoldAll: () => void;
  bringToFront: (id: string) => void;
  setStatus: (id: string, status: TerminalStatus) => void;
  setRole: (id: string, role: TerminalRole | undefined) => void;
  markActivity: (id: string, ts: number) => void;
  setExitCode: (id: string, code: number) => void;
  getTerminals: () => TerminalNode[];
  /** Terminals belonging to the currently active workspace, plus any
   *  un-stamped legacy terminals (treated as belonging to the active ws). */
  getVisibleTerminals: () => TerminalNode[];
  clearAll: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: new Map(),
  nextZIndex: 1,

  addTerminal: (overrides) => {
    const id = overrides?.id ?? generateId();
    const state = get();
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const terminal: TerminalNode = {
      id,
      name: overrides?.name ?? `Terminal ${state.terminals.size + 1}`,
      shellType: overrides?.shellType ?? "Bash",
      initialCommand: overrides?.initialCommand,
      position: overrides?.position ?? { x: 100 + state.terminals.size * 30, y: 100 + state.terminals.size * 30 },
      size: overrides?.size ?? { width: DEFAULT_TERMINAL_WIDTH, height: DEFAULT_TERMINAL_HEIGHT },
      isFolded: false,
      zIndex: state.nextZIndex,
      status: "starting",
      cols: overrides?.cols ?? DEFAULT_COLS,
      rows: overrides?.rows ?? DEFAULT_ROWS,
      createdAt: Date.now(),
      color: overrides?.color ?? DEFAULT_COLOR,
      theme: overrides?.theme ?? DEFAULT_THEME,
      cwd: overrides?.cwd,
      role: overrides?.role,
      workspaceId: overrides?.workspaceId ?? wsId,
      ...overrides,
      // Ensure id/workspaceId are not overwritten by spread when not provided
    };
    terminal.id = id;
    terminal.zIndex = state.nextZIndex;
    if (overrides?.workspaceId === undefined) {
      terminal.workspaceId = wsId;
    }

    const newMap = new Map(state.terminals);
    newMap.set(id, terminal);
    set({ terminals: newMap, nextZIndex: state.nextZIndex + 1 });
    return terminal;
  },

  removeTerminal: (id) =>
    set((state) => {
      const newMap = new Map(state.terminals);
      newMap.delete(id);
      return { terminals: newMap };
    }),

  updateTerminal: (id, updates) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...term, ...updates });
      return { terminals: newMap };
    }),

  foldTerminal: (id) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, {
        ...term,
        isFolded: true,
        size: { ...term.size, height: TITLE_BAR_HEIGHT },
      });
      return { terminals: newMap };
    }),

  unfoldTerminal: (id) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, {
        ...term,
        isFolded: false,
        size: { ...term.size, height: DEFAULT_TERMINAL_HEIGHT },
      });
      return { terminals: newMap };
    }),

  foldAll: () =>
    set((state) => {
      const newMap = new Map<string, TerminalNode>();
      state.terminals.forEach((term, id) => {
        newMap.set(id, { ...term, isFolded: true, size: { ...term.size, height: TITLE_BAR_HEIGHT } });
      });
      return { terminals: newMap };
    }),

  unfoldAll: () =>
    set((state) => {
      const newMap = new Map<string, TerminalNode>();
      state.terminals.forEach((term, id) => {
        newMap.set(id, { ...term, isFolded: false, size: { ...term.size, height: DEFAULT_TERMINAL_HEIGHT } });
      });
      return { terminals: newMap };
    }),

  bringToFront: (id) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...term, zIndex: state.nextZIndex });
      return { terminals: newMap, nextZIndex: state.nextZIndex + 1 };
    }),

  setStatus: (id, status) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...term, status });
      return { terminals: newMap };
    }),

  setRole: (id, role) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      newMap.set(id, { ...term, role });
      return { terminals: newMap };
    }),

  markActivity: (id, ts) => {
    // Mutate in place to avoid re-rendering every TerminalNode on each output
    // chunk; the activity tick in useTerminalActivity reads this lazily and
    // calls setStatus only when the derived state actually flips.
    const term = get().terminals.get(id);
    if (term) {
      term.lastOutputAt = ts;
    }
  },

  setExitCode: (id, code) =>
    set((state) => {
      const term = state.terminals.get(id);
      if (!term) return state;
      const newMap = new Map(state.terminals);
      const status: TerminalStatus = code === 0 ? "terminated" : "error";
      newMap.set(id, { ...term, lastExitCode: code, status });
      return { terminals: newMap };
    }),

  getTerminals: () => Array.from(get().terminals.values()),

  getVisibleTerminals: () => {
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const all = Array.from(get().terminals.values());
    if (wsId === null) return all;
    return all.filter((t) => (t.workspaceId ?? wsId) === wsId);
  },

  clearAll: () => set({ terminals: new Map(), nextZIndex: 1 }),
}));
