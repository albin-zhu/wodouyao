import { create } from "zustand";
import type { FileKind, FileNode } from "../types/fileNode";
import { generateId } from "../utils/id";
import {
  fileNodesCreate,
  fileNodesUpdate as fileNodesUpdateIpc,
  fileNodesRemove as fileNodesRemoveIpc,
  type FileNodeIpc,
} from "../services/tauriCommands";
import { useWorkspaceStore } from "./workspaceStore";

const DEFAULT_FILE_WIDTH = 280;
const DEFAULT_FILE_HEIGHT = 220;

function fromIpc(n: FileNodeIpc): FileNode {
  return {
    id: n.id,
    path: n.path,
    name: n.name,
    kind: n.kind as FileKind,
    position: n.position,
    size: n.size,
    zIndex: n.z_index,
    createdAt: n.created_at,
    workspaceId: n.workspace_id ?? null,
  };
}

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
  getVisibleFileNodes: () => FileNode[];
  syncFromRust: (ipc: FileNodeIpc[]) => void;
}

export const useFileNodeStore = create<FileNodeStore>((set, get) => ({
  fileNodes: new Map(),
  nextZIndex: 1,

  addFileNode: (input) => {
    const id = input.id ?? generateId("f");
    const state = get();
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
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
      workspaceId: wsId,
    };
    const newMap = new Map(state.fileNodes);
    newMap.set(id, node);
    set({ fileNodes: newMap, nextZIndex: state.nextZIndex + 1 });

    fileNodesCreate({
      id: node.id,
      path: node.path,
      name: node.name,
      kind: node.kind,
      position: node.position,
      size: node.size,
      workspace_id: wsId,
    }).catch(() => {});

    return node;
  },

  removeFileNode: (id) => {
    set((state) => {
      const newMap = new Map(state.fileNodes);
      newMap.delete(id);
      return { fileNodes: newMap };
    });
    fileNodesRemoveIpc(id).catch(() => {});
  },

  updateFileNode: (id, updates) => {
    set((state) => {
      const node = state.fileNodes.get(id);
      if (!node) return state;
      const newMap = new Map(state.fileNodes);
      newMap.set(id, { ...node, ...updates });
      return { fileNodes: newMap };
    });
    const patch: Record<string, unknown> = {};
    if (updates.position !== undefined) patch.position = updates.position;
    if (updates.size !== undefined) patch.size = updates.size;
    if (Object.keys(patch).length > 0) {
      fileNodesUpdateIpc(id, patch).catch(() => {});
    }
  },

  bringToFront: (id) =>
    set((state) => {
      const node = state.fileNodes.get(id);
      if (!node) return state;
      const newMap = new Map(state.fileNodes);
      newMap.set(id, { ...node, zIndex: state.nextZIndex });
      return { fileNodes: newMap, nextZIndex: state.nextZIndex + 1 };
    }),

  getFileNodes: () => Array.from(get().fileNodes.values()),

  getVisibleFileNodes: () => {
    const wsId = useWorkspaceStore.getState().currentWorkspace?.id ?? null;
    const all = Array.from(get().fileNodes.values());
    if (wsId === null) return all;
    return all.filter((n) => (n.workspaceId ?? wsId) === wsId);
  },

  syncFromRust: (ipc) => {
    const newMap = new Map<string, FileNode>();
    let maxZ = 0;
    for (const n of ipc) {
      const node = fromIpc(n);
      newMap.set(node.id, node);
      if (node.zIndex > maxZ) maxZ = node.zIndex;
    }
    set({ fileNodes: newMap, nextZIndex: maxZ + 1 });
  },
}));
