import { useCallback, useRef } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useCanvasInteractionStore } from "../store/canvasInteractionStore";
import { ZOOM_STEP } from "../utils/constants";

export function useCanvas() {
  const { panX, panY, zoom, adjustPan, setZoom } = useCanvasStore();
  const mode = useCanvasInteractionStore((s) => s.mode);
  const panningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // Touch/mobile gesture tracking
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    startDist: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Ctrl/Meta+wheel always zooms the canvas, regardless of target.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom(zoom + delta, e.clientX, e.clientY);
        return;
      }
      // Over a node's interior (terminal body, note textarea, file preview):
      // let the inner element scroll instead of panning the canvas.
      const target = e.target as HTMLElement;
      if (
        target.closest(".terminal-body") ||
        target.closest(".note-node") ||
        target.closest(".file-node")
      ) {
        return;
      }
      adjustPan(-e.deltaX, -e.deltaY);
    },
    [zoom, adjustPan, setZoom]
  );

  // Middle-button drag to pan, or left-click drag when in select mode on empty canvas
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle button (button 1) always pans
      if (e.button === 1) {
        e.preventDefault();
        panningRef.current = true;
        lastPosRef.current = { x: e.clientX, y: e.clientY };

        const onMove = (ev: MouseEvent) => {
          if (!panningRef.current) return;
          const dx = ev.clientX - lastPosRef.current.x;
          const dy = ev.clientY - lastPosRef.current.y;
          lastPosRef.current = { x: ev.clientX, y: ev.clientY };
          adjustPan(dx, dy);
        };

        const onUp = () => {
          panningRef.current = false;
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      // Left button in select mode on empty canvas: pan
      if (e.button === 0 && mode === "select") {
        const target = e.target as HTMLElement;
        if (
          target.closest(".terminal-node, [data-node-id]") ||
          target.closest("button") ||
          // Don't preventDefault on form fields — that breaks the browser's
          // default "mousedown focuses the field" behavior and inputs become
          // keyboard-only. Affects portal'd dialogs whose React events still
          // bubble through the canvas component tree.
          target.closest("input, textarea, select")
        )
          return;

        e.preventDefault();
        panningRef.current = true;
        lastPosRef.current = { x: e.clientX, y: e.clientY };

        const onMove = (ev: MouseEvent) => {
          if (!panningRef.current) return;
          const dx = ev.clientX - lastPosRef.current.x;
          const dy = ev.clientY - lastPosRef.current.y;
          lastPosRef.current = { x: ev.clientX, y: ev.clientY };
          adjustPan(dx, dy);
        };

        const onUp = () => {
          panningRef.current = false;
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }
    },
    [mode, adjustPan]
  );

  // Pointer event handlers for touch/mobile gestures
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return; // Desktop uses mouse handlers
      e.preventDefault();
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Reset pinch state when new pointer touches
      if (pointersRef.current.size === 2) {
        pinchStateRef.current = null;
      }
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;

      // Check if this pointer is being tracked
      if (!pointersRef.current.has(e.pointerId)) return;

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pointers = pointersRef.current;

      if (pointers.size === 1) {
        // Single finger pan
        const entries = [...pointers.entries()];
        const [id, start] = entries[0];
        if (id === e.pointerId) {
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          adjustPan(dx, dy);
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
      } else if (pointers.size === 2) {
        // Two-finger pinch zoom + pan
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);

        // Initialize pinch state on first frame with 2 fingers
        if (!pinchStateRef.current) {
          pinchStateRef.current = {
            startDist: dist,
            startZoom: zoom,
            startPanX: panX,
            startPanY: panY,
          };
        }

        const state = pinchStateRef.current;
        const scale = dist / state.startDist;

        // Clamp scale to reasonable bounds
        const newZoom = Math.max(0.1, Math.min(5, state.startZoom * scale));

        // Center point of pinch gesture
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;

        setZoom(newZoom, cx, cy);
      }
    },
    [zoom, panX, panY, adjustPan, setZoom]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) {
        pinchStateRef.current = null;
      }
    },
    []
  );

  return {
    panX,
    panY,
    zoom,
    handleWheel,
    handleCanvasMouseDown,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
