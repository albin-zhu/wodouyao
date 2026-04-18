import { create } from "zustand";
import type { NoteNode } from "../types/note";
import { generateId } from "../utils/id";

const DEFAULT_NOTE_WIDTH = 240;
const DEFAULT_NOTE_HEIGHT = 160;
const DEFAULT_NOTE_COLOR = "#e0af68";

interface NoteStore {
  notes: Map<string, NoteNode>;
  nextZIndex: number;

  addNote: (overrides?: Partial<NoteNode>) => NoteNode;
  removeNote: (id: string) => void;
  updateNote: (id: string, updates: Partial<NoteNode>) => void;
  bringToFront: (id: string) => void;
  getNotes: () => NoteNode[];
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: new Map(),
  nextZIndex: 1,

  addNote: (overrides) => {
    const id = overrides?.id ?? generateId();
    const state = get();
    const note: NoteNode = {
      id,
      text: overrides?.text ?? "",
      color: overrides?.color ?? DEFAULT_NOTE_COLOR,
      position:
        overrides?.position ??
        { x: 200 + state.notes.size * 20, y: 200 + state.notes.size * 20 },
      size: overrides?.size ?? { width: DEFAULT_NOTE_WIDTH, height: DEFAULT_NOTE_HEIGHT },
      zIndex: state.nextZIndex,
      createdAt: Date.now(),
    };
    const newMap = new Map(state.notes);
    newMap.set(id, note);
    set({ notes: newMap, nextZIndex: state.nextZIndex + 1 });
    return note;
  },

  removeNote: (id) =>
    set((state) => {
      const newMap = new Map(state.notes);
      newMap.delete(id);
      return { notes: newMap };
    }),

  updateNote: (id, updates) =>
    set((state) => {
      const note = state.notes.get(id);
      if (!note) return state;
      const newMap = new Map(state.notes);
      newMap.set(id, { ...note, ...updates });
      return { notes: newMap };
    }),

  bringToFront: (id) =>
    set((state) => {
      const note = state.notes.get(id);
      if (!note) return state;
      const newMap = new Map(state.notes);
      newMap.set(id, { ...note, zIndex: state.nextZIndex });
      return { notes: newMap, nextZIndex: state.nextZIndex + 1 };
    }),

  getNotes: () => Array.from(get().notes.values()),
}));
