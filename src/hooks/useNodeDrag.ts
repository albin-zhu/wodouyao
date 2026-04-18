import { useCallback, useRef } from "react";

export interface NodeDragOptions {
  position: { x: number; y: number };
  size: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  onDrag: (next: { x: number; y: number }) => void;
  onResize: (next: { width: number; height: number }) => void;
  onBringToFront?: () => void;
}

function getCanvasZoom(): number {
  const v = document
    .getElementById("terminal-layer")
    ?.style.getPropertyValue("--zoom");
  const z = parseFloat(v ?? "1");
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Drag-to-move + resize handlers for canvas nodes. Mirrors TerminalNode patterns. */
export function useNodeDrag(opts: NodeDragOptions) {
  const dragStartRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const minW = opts.minWidth ?? 160;
  const minH = opts.minHeight ?? 80;

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, textarea, input")) return;
      e.preventDefault();
      opts.onBringToFront?.();
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: opts.position.x,
        startY: opts.position.y,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return;
        const zoom = getCanvasZoom();
        const dx = (ev.clientX - dragStartRef.current.x) / zoom;
        const dy = (ev.clientY - dragStartRef.current.y) / zoom;
        opts.onDrag({
          x: dragStartRef.current.startX + dx,
          y: dragStartRef.current.startY + dy,
        });
      };

      const onMouseUp = () => {
        dragStartRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [opts]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startW: opts.size.width,
        startH: opts.size.height,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeStartRef.current) return;
        const zoom = getCanvasZoom();
        const dw = (ev.clientX - resizeStartRef.current.mouseX) / zoom;
        const dh = (ev.clientY - resizeStartRef.current.mouseY) / zoom;
        opts.onResize({
          width: Math.max(minW, resizeStartRef.current.startW + dw),
          height: Math.max(minH, resizeStartRef.current.startH + dh),
        });
      };

      const onMouseUp = () => {
        resizeStartRef.current = null;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [opts, minW, minH]
  );

  return { handleDragStart, handleResizeStart };
}
