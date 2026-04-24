import { create } from "zustand";
import { MIN_ZOOM, MAX_ZOOM, GRID_SIZE } from "../utils/constants";

interface CanvasView {
  panX: number;
  panY: number;
  zoom: number;
  gridVisible: boolean;
  gridSize: number;
}

interface CanvasStore extends CanvasView {
  /** Per-workspace snapshot of pan/zoom/grid. Active fields above are the
   *  rendered view; switching workspaces snapshots into the outgoing slot
   *  and restores from the incoming slot. */
  workspaceViews: Map<string, CanvasView>;
  /** When true, hide all app chrome (toolbar, canvas controls) so only
   *  terminals/notes/wires/background show. Toggled by F11 / Cmd+F11. */
  zenMode: boolean;
  /** When true, the window is sized + positioned to span every monitor.
   *  Snapshot of pre-span bounds is kept on `prevWindowBounds` so the
   *  next toggle restores the previous geometry. */
  spanAllMonitors: boolean;
  prevWindowBounds: { x: number; y: number; width: number; height: number } | null;
  setPan: (x: number, y: number) => void;
  adjustPan: (dx: number, dy: number) => void;
  setZoom: (zoom: number, centerX?: number, centerY?: number) => void;
  resetView: () => void;
  toggleZenMode: () => void;
  setSpanAllMonitors: (
    on: boolean,
    prev: { x: number; y: number; width: number; height: number } | null
  ) => void;
  /** Snapshot the current view under `outgoingId` (if non-null) and restore
   *  view for `incomingId` if one was previously snapshotted. Otherwise
   *  leaves the active view untouched (so a brand-new workspace inherits
   *  the current camera position rather than slamming back to origin). */
  switchTo: (incomingId: string, outgoingId: string | null) => void;
}

export const useCanvasStore = create<CanvasStore>((set) => ({
  panX: 0,
  panY: 0,
  zoom: 1,
  gridVisible: true,
  gridSize: GRID_SIZE,
  workspaceViews: new Map(),
  zenMode: false,
  spanAllMonitors: false,
  prevWindowBounds: null,

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

  toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),

  setSpanAllMonitors: (on, prev) =>
    set({ spanAllMonitors: on, prevWindowBounds: prev }),

  switchTo: (incomingId, outgoingId) =>
    set((state) => {
      const views = new Map(state.workspaceViews);
      if (outgoingId) {
        views.set(outgoingId, {
          panX: state.panX,
          panY: state.panY,
          zoom: state.zoom,
          gridVisible: state.gridVisible,
          gridSize: state.gridSize,
        });
      }
      const incoming = views.get(incomingId);
      if (incoming) {
        return {
          workspaceViews: views,
          panX: incoming.panX,
          panY: incoming.panY,
          zoom: incoming.zoom,
          gridVisible: incoming.gridVisible,
          gridSize: incoming.gridSize,
        };
      }
      return { workspaceViews: views };
    }),
}));
