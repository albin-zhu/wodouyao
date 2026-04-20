import { create } from "zustand";
import { generateId } from "../utils/id";
import {
  webNodesCreate,
  webNodesUpdate as webNodesUpdateIpc,
  webNodesRemove as webNodesRemoveIpc,
  type WebNodeIpc,
} from "../services/tauriCommands";

export interface WebNode {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  createdAt: number;
}

function fromIpc(w: WebNodeIpc): WebNode {
  return {
    id: w.id,
    url: w.url,
    title: w.title,
    description: w.description,
    position: w.position,
    size: w.size,
    zIndex: w.z_index,
    createdAt: w.created_at,
  };
}

interface WebNodeStore {
  webNodes: Map<string, WebNode>;
  nextZIndex: number;

  addWebNode: (input: {
    url: string;
    title?: string;
    description?: string;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
    id?: string;
  }) => WebNode;
  updateWebNode: (id: string, updates: Partial<Omit<WebNode, "id">>) => void;
  removeWebNode: (id: string) => void;
  bringToFront: (id: string) => void;
  getWebNodes: () => WebNode[];
  syncFromRust: (ipc: WebNodeIpc[]) => void;
}

export const useWebNodeStore = create<WebNodeStore>((set, get) => ({
  webNodes: new Map(),
  nextZIndex: 1,

  addWebNode: (input) => {
    const id = input.id ?? generateId("w");
    const state = get();
    const node: WebNode = {
      id,
      url: input.url,
      title: input.title ?? null,
      description: input.description ?? null,
      position:
        input.position ??
        { x: 350 + state.webNodes.size * 20, y: 250 + state.webNodes.size * 20 },
      size: input.size ?? { width: 300, height: 180 },
      zIndex: state.nextZIndex,
      createdAt: Date.now(),
    };
    const next = new Map(state.webNodes);
    next.set(id, node);
    set({ webNodes: next, nextZIndex: state.nextZIndex + 1 });

    webNodesCreate({
      id: node.id,
      url: node.url,
      title: node.title ?? undefined,
      description: node.description ?? undefined,
      position: node.position,
      size: node.size,
    }).catch(() => {});

    return node;
  },

  updateWebNode: (id, updates) => {
    set((state) => {
      const node = state.webNodes.get(id);
      if (!node) return state;
      const next = new Map(state.webNodes);
      next.set(id, { ...node, ...updates });
      return { webNodes: next };
    });
    const patch: Record<string, unknown> = {};
    if (updates.url !== undefined) patch.url = updates.url;
    if (updates.title !== undefined && updates.title !== null) patch.title = updates.title;
    if (updates.description !== undefined && updates.description !== null) {
      patch.description = updates.description;
    }
    if (updates.position !== undefined) patch.position = updates.position;
    if (updates.size !== undefined) patch.size = updates.size;
    if (Object.keys(patch).length > 0) {
      webNodesUpdateIpc(id, patch).catch(() => {});
    }
  },

  removeWebNode: (id) => {
    set((state) => {
      const next = new Map(state.webNodes);
      next.delete(id);
      return { webNodes: next };
    });
    webNodesRemoveIpc(id).catch(() => {});
  },

  bringToFront: (id) =>
    set((state) => {
      const node = state.webNodes.get(id);
      if (!node) return state;
      const next = new Map(state.webNodes);
      next.set(id, { ...node, zIndex: state.nextZIndex });
      return { webNodes: next, nextZIndex: state.nextZIndex + 1 };
    }),

  getWebNodes: () => Array.from(get().webNodes.values()),

  syncFromRust: (ipc) => {
    const next = new Map<string, WebNode>();
    let maxZ = 0;
    for (const w of ipc) {
      const node = fromIpc(w);
      next.set(node.id, node);
      if (node.zIndex > maxZ) maxZ = node.zIndex;
    }
    set({ webNodes: next, nextZIndex: maxZ + 1 });
  },
}));
