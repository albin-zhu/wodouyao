import { useRef, useCallback } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import TerminalTitleBar from "./TerminalTitleBar";
import TerminalBody from "./TerminalBody";
import type { TerminalNode as TerminalNodeType } from "../../types/terminal";

interface TerminalNodeProps {
  terminal: TerminalNodeType;
}

export default function TerminalNode({ terminal }: TerminalNodeProps) {
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startW: number;
    startH: number;
  } | null>(null);

  const handleMouseDown = useCallback(() => {
    bringToFront(terminal.id);
  }, [bringToFront, terminal.id]);

  // Drag to move
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      bringToFront(terminal.id);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startX: terminal.position.x,
        startY: terminal.position.y,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragStartRef.current) return;
        const zoom = parseFloat(
          document.getElementById("terminal-layer")?.style.getPropertyValue("--zoom") ?? "1"
        );
        const dx = (ev.clientX - dragStartRef.current.x) / zoom;
        const dy = (ev.clientY - dragStartRef.current.y) / zoom;
        updateTerminal(terminal.id, {
          position: {
            x: dragStartRef.current.startX + dx,
            y: dragStartRef.current.startY + dy,
          },
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
    [terminal.id, terminal.position, bringToFront, updateTerminal]
  );

  // Resize handle
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        startW: terminal.size.width,
        startH: terminal.size.height,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!resizeStartRef.current) return;
        const zoom = parseFloat(
          document.getElementById("terminal-layer")?.style.getPropertyValue("--zoom") ?? "1"
        );
        const dw = (ev.clientX - resizeStartRef.current.mouseX) / zoom;
        const dh = (ev.clientY - resizeStartRef.current.mouseY) / zoom;
        updateTerminal(terminal.id, {
          size: {
            width: Math.max(300, resizeStartRef.current.startW + dw),
            height: Math.max(100, resizeStartRef.current.startH + dh),
          },
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
    [terminal.id, terminal.size, updateTerminal]
  );

  const handleWireAnchorDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setWireStart(terminal.id);
    },
    [terminal.id, setWireStart]
  );

  return (
    <div
      className="terminal-node"
      data-terminal-id={terminal.id}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: terminal.position.x,
        top: terminal.position.y,
        width: terminal.size.width,
        height: terminal.isFolded ? 36 : terminal.size.height,
        zIndex: terminal.zIndex,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        border: mode === "wire" ? `1px solid ${terminal.color}` : `1px solid ${terminal.color}40`,
        overflow: "hidden",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
        transition: "height 0.2s ease",
        pointerEvents: "auto",
      }}
    >
      <div onMouseDown={handleDragStart}>
        <TerminalTitleBar terminal={terminal} />
      </div>
      {!terminal.isFolded && <TerminalBody terminalId={terminal.id} />}
      {!terminal.isFolded && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 16,
            height: 16,
            cursor: "se-resize",
          }}
        />
      )}
      {/* Wire connection anchor (right side) */}
      {mode === "wire" && (
        <div
          onMouseDown={handleWireAnchorDown}
          style={{
            position: "absolute",
            right: -6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: terminal.color,
            border: "2px solid #1f2335",
            cursor: "crosshair",
            zIndex: 10,
          }}
        />
      )}
    </div>
  );
}
