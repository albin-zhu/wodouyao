import { create } from "zustand";
import type { TerminalNode, TerminalStatus } from "../types/terminal";
import {
  DEFAULT_TERMINAL_WIDTH,
  DEFAULT_TERMINAL_HEIGHT,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TITLE_BAR_HEIGHT,
} from "../utils/constants";
import { generateId } from "../utils/id";

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
  getTerminals: () => TerminalNode[];
  clearAll: () => void;
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: new Map(),
  nextZIndex: 1,

  addTerminal: (overrides) => {
    const id = overrides?.id ?? generateId();
    const state = get();
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
      ...overrides,
      // Ensure id is not overwritten by spread
    };
    terminal.id = id;
    terminal.zIndex = state.nextZIndex;

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

  getTerminals: () => Array.from(get().terminals.values()),

  clearAll: () => set({ terminals: new Map(), nextZIndex: 1 }),
}));
