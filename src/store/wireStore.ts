import { create } from "zustand";
import type { Wire } from "../types/wire";
import { generateId } from "../utils/id";

interface WireStore {
  wires: Map<string, Wire>;

  addWire: (sourceId: string, targetId: string) => Wire;
  removeWire: (wireId: string) => void;
  getWiresForTerminal: (terminalId: string) => Wire[];
  toggleForward: (wireId: string) => void;
  getWires: () => Wire[];
  clearAll: () => void;
}

export const useWireStore = create<WireStore>((set, get) => ({
  wires: new Map(),

  addWire: (sourceId, targetId) => {
    const id = generateId();
    const wire: Wire = { id, sourceId, targetId, forwardOutput: true };
    const newMap = new Map(get().wires);
    newMap.set(id, wire);
    set({ wires: newMap });
    return wire;
  },

  removeWire: (wireId) => {
    const newMap = new Map(get().wires);
    newMap.delete(wireId);
    set({ wires: newMap });
  },

  getWiresForTerminal: (terminalId) => {
    return Array.from(get().wires.values()).filter(
      (w) => w.sourceId === terminalId || w.targetId === terminalId
    );
  },

  toggleForward: (wireId) => {
    const wire = get().wires.get(wireId);
    if (!wire) return;
    const newMap = new Map(get().wires);
    newMap.set(wireId, { ...wire, forwardOutput: !wire.forwardOutput });
    set({ wires: newMap });
  },

  getWires: () => Array.from(get().wires.values()),

  clearAll: () => set({ wires: new Map() }),
}));
