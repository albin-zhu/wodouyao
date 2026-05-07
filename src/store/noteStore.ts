import { create } from "zustand";
import type { NoteNode } from "../types/note";
import { generateId } from "../utils/id";
import {
  notesCreate,
  notesUpdate as notesUpdateIpc,
  notesRemove as notesRemoveIpc,
  type NoteIpc,
} from "../services/tauriCommands";
import { useWorkspaceStore } from "./workspaceStore";
import { toast } from "./toastStore";
import { getNextZ, seed as seedZ } from "../utils/zIndex";
import { getViewportCenteredPosition } from "../utils/viewport";

const DEFAULT_NOTE_WIDTH = 240;
const DEFAULT_NOTE_HEIGHT = 160;
const DEFAULT_NOTE_COLOR = "var(--color-warning)";

function fromIpc(n: NoteIpc): NoteNode {
  return {
    id: n.id,
    text: n.text,
    color: n.color,
    position: n.position,
    size: n.size,
    zIndex: n.z_index,
    createdAt: n.created_at,
    workspaceId: n.workspace_id ?? null,
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
  getVisibleNotes: () => NoteNode[];
  syncFromRust: (ipcNotes: NoteIpc[]) => void;
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: new Map(),
  nextZIndex: 1,

  addNote: (overrides) => {
    const id = overrides?.id ?? generateId();
    const state = get();
    const wsId =
      overrides?.workspaceId ??
      useWorkspaceStore.getState().currentWorkspace?.id ??
      null;
    const size = overrides?.size ?? { width: DEFAULT_NOTE_WIDTH, height: DEFAULT_NOTE_HEIGHT };
    const note: NoteNode = {
      id,
      text: overrides?.text ?? "",
      color: overrides?.color ?? DEFAULT_NOTE_COLOR,
      position:
        overrides?.position ??
        getViewportCenteredPosition(size, state.notes.size),
      size,
      zIndex: getNextZ(),
      createdAt: Date.now(),
      workspaceId: wsId,
    };
    const newMap = new Map(state.notes);
    newMap.set(id, note);
    set({ notes: newMap });

    notesCreate({
      text: note.text || undefined,
      color: note.color,
      position: note.position,
      size: note.size,
      workspace_id: wsId,
    }).catch((e) => {
      console.error("[noteStore] create failed:", e);
      toast("Failed to save note", "error");
    });

    return note;
  },

  removeNote: (id) => {
    set((state) => {
      const newMap = new Map(state.notes);
      newMap.delete(id);
      return { notes: newMap };
    });
    notesRemoveIpc(id).catch((e) => {
      console.error("[noteStore] remove failed:", e);
    });
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
      notesUpdateIpc(id, patch).catch((e) => {
        console.error("[noteStore] update failed:", e);
      });
    }
  },

  bringToFront: (id) =>
    set((state) => {
      const note = state.notes.get(id);
      if (!note) return state;
      const newMap = new Map(state.notes);
      newMap.set(id, { ...note, zIndex: getNextZ() });
      return { notes: newMap };
    }),

  getNotes: () => Array.from(get().notes.values()),

  getVisibleNotes: () => {
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const all = Array.from(get().notes.values());
    if (wsId === null) return all;
    return all.filter((n) => (n.workspaceId ?? wsId) === wsId);
  },

  syncFromRust: (ipcNotes) => {
    const newMap = new Map<string, NoteNode>();
    let maxZ = 0;
    for (const n of ipcNotes) {
      const node = fromIpc(n);
      newMap.set(node.id, node);
      if (node.zIndex > maxZ) maxZ = node.zIndex;
    }
    seedZ(maxZ);
    set({ notes: newMap });
  },
}));
