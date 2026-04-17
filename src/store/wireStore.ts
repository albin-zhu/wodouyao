import { create } from "zustand";
import type { Wire } from "../types/wire";
import {
  wireCreate,
  wireList,
  wireRemove,
  wireReplaceAll,
  type WireIpc,
} from "../services/tauriCommands";

interface WireStore {
  wires: Map<string, Wire>;

  hydrate: () => Promise<void>;
  addWire: (sourceId: string, targetId: string) => Promise<Wire | null>;
  removeWire: (wireId: string) => Promise<void>;
  getWiresForTerminal: (terminalId: string) => Wire[];
  getWires: () => Wire[];
  clearAll: () => Promise<void>;
}

function fromIpc(w: WireIpc): Wire {
  return {
    id: w.id,
    sourceId: w.source_id,
    targetId: w.target_id,
  };
}

export const useWireStore = create<WireStore>((set, get) => ({
  wires: new Map(),

  hydrate: async () => {
    try {
      const list = await wireList();
      const next = new Map<string, Wire>();
      for (const ipc of list) {
        const w = fromIpc(ipc);
        next.set(w.id, w);
      }
      set({ wires: next });
    } catch (e) {
      console.error("wireStore.hydrate failed:", e);
    }
  },

  addWire: async (sourceId, targetId) => {
    try {
      const ipc = await wireCreate(sourceId, targetId);
      const wire = fromIpc(ipc);
      const next = new Map(get().wires);
      next.set(wire.id, wire);
      set({ wires: next });
      return wire;
    } catch (e) {
      console.error("wireStore.addWire failed:", e);
      return null;
    }
  },

  removeWire: async (wireId) => {
    try {
      await wireRemove(wireId);
    } catch (e) {
      console.error("wireStore.removeWire failed:", e);
    }
    const next = new Map(get().wires);
    next.delete(wireId);
    set({ wires: next });
  },

  getWiresForTerminal: (terminalId) => {
    return Array.from(get().wires.values()).filter(
      (w) => w.sourceId === terminalId || w.targetId === terminalId
    );
  },

  getWires: () => Array.from(get().wires.values()),

  clearAll: async () => {
    try {
      await wireReplaceAll([]);
    } catch (e) {
      console.error("wireStore.clearAll failed:", e);
    }
    set({ wires: new Map() });
  },
}));
