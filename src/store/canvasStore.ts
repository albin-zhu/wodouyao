import { create } from "zustand";
import { MIN_ZOOM, MAX_ZOOM, GRID_SIZE } from "../utils/constants";

interface CanvasStore {
  panX: number;
  panY: number;
  zoom: number;
  gridVisible: boolean;
  gridSize: number;
  setPan: (x: number, y: number) => void;
  adjustPan: (dx: number, dy: number) => void;
  setZoom: (zoom: number, centerX?: number, centerY?: number) => void;
  resetView: () => void;
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  panX: 0,
  panY: 0,
  zoom: 1,
  gridVisible: true,
  gridSize: GRID_SIZE,

  setPan: (x, y) => set({ panX: x, panY: y }),

  adjustPan: (dx, dy) =>
    set((state) => ({ panX: state.panX + dx, panY: state.panY + dy })),

  setZoom: (newZoom, centerX, centerY) =>
    set((state) => {
      const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      if (centerX !== undefined && centerY !== undefined) {
        const scale = clamped / state.zoom;
        return {
          zoom: clamped,
          panX: centerX - (centerX - state.panX) * scale,
          panY: centerY - (centerY - state.panY) * scale,
        };
      }
      return { zoom: clamped };
    }),

  resetView: () => set({ panX: 0, panY: 0, zoom: 1 }),
}));
