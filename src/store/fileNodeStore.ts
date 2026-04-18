import { create } from "zustand";
import type { FileKind, FileNode } from "../types/fileNode";
import { generateId } from "../utils/id";

const DEFAULT_FILE_WIDTH = 280;
const DEFAULT_FILE_HEIGHT = 220;

interface FileNodeStore {
  fileNodes: Map<string, FileNode>;
  nextZIndex: number;

  addFileNode: (input: {
    path: string;
    name: string;
    kind: FileKind;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    id?: string;
  }) => FileNode;
  removeFileNode: (id: string) => void;
  updateFileNode: (id: string, updates: Partial<FileNode>) => void;
  bringToFront: (id: string) => void;
  getFileNodes: () => FileNode[];
}

export const useFileNodeStore = create<FileNodeStore>((set, get) => ({
  fileNodes: new Map(),
  nextZIndex: 1,

  addFileNode: (input) => {
    const id = input.id ?? generateId();
    const state = get();
    const node: FileNode = {
      id,
      path: input.path,
      name: input.name,
      kind: input.kind,
      position:
        input.position ??
        { x: 250 + state.fileNodes.size * 20, y: 250 + state.fileNodes.size * 20 },
      size: input.size ?? { width: DEFAULT_FILE_WIDTH, height: DEFAULT_FILE_HEIGHT },
      zIndex: state.nextZIndex,
      createdAt: Date.now(),
    };
    const newMap = new Map(state.fileNodes);
    newMap.set(id, node);
    set({ fileNodes: newMap, nextZIndex: state.nextZIndex + 1 });
    return node;
  },

  removeFileNode: (id) =>
    set((state) => {
      const newMap = new Map(state.fileNodes);
      newMap.delete(id);
      return { fileNodes: newMap };
    }),

  updateFileNode: (id, updates) =>
    set((state) => {
      const node = state.fileNodes.get(id);
      if (!node) return state;
      const newMap = new Map(state.fileNodes);
      newMap.set(id, { ...node, ...updates });
      return { fileNodes: newMap };
    }),

  bringToFront: (id) =>
    set((state) => {
      const node = state.fileNodes.get(id);
      if (!node) return state;
      const newMap = new Map(state.fileNodes);
      newMap.set(id, { ...node, zIndex: state.nextZIndex });
      return { fileNodes: newMap, nextZIndex: state.nextZIndex + 1 };
    }),

  getFileNodes: () => Array.from(get().fileNodes.values()),
}));
