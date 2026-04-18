import { create } from "zustand";
import type { NoteNode } from "../types/note";
import { generateId } from "../utils/id";
import {
  notesCreate,
  notesUpdate as notesUpdateIpc,
  notesRemove as notesRemoveIpc,
  type NoteIpc,
} from "../services/tauriCommands";

const DEFAULT_NOTE_WIDTH = 240;
const DEFAULT_NOTE_HEIGHT = 160;
const DEFAULT_NOTE_COLOR = "#e0af68";

function fromIpc(n: NoteIpc): NoteNode {
  return {
    id: n.id,
    text: n.text,
    color: n.color,
    position: n.position,
    size: n.size,
    zIndex: n.z_index,
    createdAt: n.created_at,
  };
}

interface NoteStore {
  notes: Map<string, NoteNode>;
  nextZIndex: number;

  addNote: (overrides?: Partial<NoteNode>) => NoteNode;
  removeNote: (id: string) => void;
  updateNote: (id: string, updates: Partial<NoteNode>) => void;
  bringToFront: (id: string) => void;
  getNotes: () => NoteNode[];
  syncFromRust: (ipcNotes: NoteIpc[]) => void;
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

    notesCreate({
      text: note.text || undefined,
      color: note.color,
      position: note.position,
      size: note.size,
    }).catch(() => {});

    return note;
  },

  removeNote: (id) => {
    set((state) => {
      const newMap = new Map(state.notes);
      newMap.delete(id);
      return { notes: newMap };
    });
    notesRemoveIpc(id).catch(() => {});
  },

  updateNote: (id, updates) => {
    set((state) => {
      const note = state.notes.get(id);
      if (!note) return state;
      const newMap = new Map(state.notes);
      newMap.set(id, { ...note, ...updates });
      return { notes: newMap };
    });
    const patch: Record<string, unknown> = {};
    if (updates.text !== undefined) patch.text = updates.text;
    if (updates.color !== undefined) patch.color = updates.color;
    if (updates.position !== undefined) patch.position = updates.position;
    if (updates.size !== undefined) patch.size = updates.size;
    if (Object.keys(patch).length > 0) {
      notesUpdateIpc(id, patch).catch(() => {});
    }
  },

  bringToFront: (id) =>
    set((state) => {
      const note = state.notes.get(id);
      if (!note) return state;
      const newMap = new Map(state.notes);
      newMap.set(id, { ...note, zIndex: state.nextZIndex });
      return { notes: newMap, nextZIndex: state.nextZIndex + 1 };
    }),

  getNotes: () => Array.from(get().notes.values()),

  syncFromRust: (ipcNotes) => {
    const newMap = new Map<string, NoteNode>();
    let maxZ = 0;
    for (const n of ipcNotes) {
      const node = fromIpc(n);
      newMap.set(node.id, node);
      if (node.zIndex > maxZ) maxZ = node.zIndex;
    }
    set({ notes: newMap, nextZIndex: maxZ + 1 });
  },
}));
