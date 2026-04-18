import { useCallback, useRef } from "react";
import { useCanvasStore } from "../store/canvasStore";
import { useCanvasInteractionStore } from "../store/canvasInteractionStore";
import { ZOOM_STEP } from "../utils/constants";

export function useCanvas() {
  const { panX, panY, zoom, adjustPan, setZoom } = useCanvasStore();
  const mode = useCanvasInteractionStore((s) => s.mode);
  const panningRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

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
        if (target.closest(".terminal-node, [data-node-id]") || target.closest("button")) return;

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

  return { panX, panY, zoom, handleWheel, handleCanvasMouseDown };
}
