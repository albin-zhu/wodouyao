import { create } from "zustand";

export type CanvasMode = "select" | "draw" | "wire";

interface DrawRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface CanvasInteractionStore {
  mode: CanvasMode;
  setMode: (mode: CanvasMode) => void;

  // Draw mode
  drawRect: DrawRect | null;
  setDrawRect: (rect: DrawRect | null) => void;
  clearDrawRect: () => void;

  // Wire mode
  wireStartId: string | null;
  wireEndPos: { x: number; y: number } | null;
  setWireStart: (id: string) => void;
  setWireEndPos: (pos: { x: number; y: number } | null) => void;
  clearWire: () => void;
}

export const useCanvasInteractionStore = create<CanvasInteractionStore>(
  (set) => ({
    mode: "select",
    setMode: (mode) => set({ mode, drawRect: null, wireStartId: null, wireEndPos: null }),

    drawRect: null,
    setDrawRect: (rect) => set({ drawRect: rect }),
    clearDrawRect: () => set({ drawRect: null }),

    wireStartId: null,
    wireEndPos: null,
    setWireStart: (id) => set({ wireStartId: id }),
    setWireEndPos: (pos) => set({ wireEndPos: pos }),
    clearWire: () => set({ wireStartId: null, wireEndPos: null }),
  })
);
