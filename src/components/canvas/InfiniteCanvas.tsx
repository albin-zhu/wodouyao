import { useCallback, useRef } from "react";
import { useCanvas } from "../../hooks/useCanvas";
import { useCanvasStore } from "../../store/canvasStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useWireStore } from "../../store/wireStore";
import { useNewTerminal } from "../../hooks/useNewTerminal";
import { useTerminal } from "../../hooks/useTerminal";
import { useSettingsStore } from "../../store/settingsStore";
import BackgroundLayer from "./BackgroundLayer";
import TerminalLayer from "../terminal/TerminalLayer";
import WireLayer from "./WireLayer";
import CanvasControls from "./CanvasControls";

export default function InfiniteCanvas() {
  const { handleWheel, handleCanvasMouseDown } = useCanvas();
  const { panX, panY, zoom } = useCanvasStore();
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setDrawRect = useCanvasInteractionStore((s) => s.setDrawRect);
  const clearDrawRect = useCanvasInteractionStore((s) => s.clearDrawRect);
  const drawRect = useCanvasInteractionStore((s) => s.drawRect);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const wireStartId = useCanvasInteractionStore((s) => s.wireStartId);
  const setWireEndPos = useCanvasInteractionStore((s) => s.setWireEndPos);
  const clearWire = useCanvasInteractionStore((s) => s.clearWire);
  const addWire = useWireStore((s) => s.addWire);
  const launchTerminal = useNewTerminal();
  const { spawn } = useTerminal();
  const wireEmptySpawnEnabled = useSettingsStore((s) => s.settings?.wire_empty_spawn_enabled ?? true);
  const wireEmptySpawnCommand = useSettingsStore((s) => s.settings?.wire_empty_spawn_command ?? "claude");
  const drawingRef = useRef(false);

  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => {
      const viewport = document.getElementById("canvas-viewport");
      const rect = viewport?.getBoundingClientRect();
      const offsetX = rect?.left ?? 0;
      const offsetY = rect?.top ?? 0;
      return {
        x: (screenX - offsetX - panX) / zoom,
        y: (screenY - offsetY - panY) / zoom,
      };
    },
    [panX, panY, zoom]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle button or select-mode left-click on empty canvas: pan
      if (e.button === 1 || (e.button === 0 && mode === "select")) {
        handleCanvasMouseDown(e);
        if (mode === "select") return;
      }

      if (mode !== "draw") return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest(".terminal-node") || target.closest("button")) return;

      e.preventDefault();
      const world = screenToWorld(e.clientX, e.clientY);
      drawingRef.current = true;
      setDrawRect({
        startX: world.x,
        startY: world.y,
        endX: world.x,
        endY: world.y,
      });
    },
    [mode, screenToWorld, setDrawRect, handleCanvasMouseDown]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (mode === "draw" && drawingRef.current && drawRect) {
        const world = screenToWorld(e.clientX, e.clientY);
        setDrawRect({ ...drawRect, endX: world.x, endY: world.y });
      } else if (mode === "wire" && wireStartId) {
        const world = screenToWorld(e.clientX, e.clientY);
        setWireEndPos(world);
      }
    },
    [mode, drawRect, wireStartId, screenToWorld, setDrawRect, setWireEndPos]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // Draw mode: create terminal from rectangle
      if (mode === "draw" && drawingRef.current && drawRect) {
        drawingRef.current = false;
        const x = Math.min(drawRect.startX, drawRect.endX);
        const y = Math.min(drawRect.startY, drawRect.endY);
        const w = Math.abs(drawRect.endX - drawRect.startX);
        const h = Math.abs(drawRect.endY - drawRect.startY);
        clearDrawRect();
        if (w >= 100 && h >= 60) {
          launchTerminal({
            shiftKey: e.shiftKey,
            position: { x, y },
            size: { width: w, height: h },
          });
          setMode("select");
        }
      }

      // Wire mode: check if dropped on a terminal
      if (mode === "wire" && wireStartId) {
        const target = e.target as HTMLElement;
        const terminalNode = target.closest(".terminal-node");
        if (terminalNode) {
          const targetId = terminalNode.getAttribute("data-terminal-id");
          if (targetId && targetId !== wireStartId) {
            addWire(wireStartId, targetId);
          }
          clearWire();
          setMode("select");
        } else {
          // Dropped on empty canvas — spawn a terminal and wire to it (if enabled)
          if (wireEmptySpawnEnabled) {
            const world = screenToWorld(e.clientX, e.clientY);
            const sourceId = wireStartId;
            const cmd = wireEmptySpawnCommand;
            spawn({
              command: cmd,
              name: cmd.charAt(0).toUpperCase() + cmd.slice(1),
              color: cmd === "claude" ? "#ff9e64" : cmd === "codex" ? "#9ece6a" : "#7aa2f7",
              position: { x: world.x, y: world.y },
            }).then((t) => addWire(sourceId, t.id)).catch(console.error);
          }
          clearWire();
          setMode("select");
        }
      }
    },
    [mode, drawRect, wireStartId, clearDrawRect, launchTerminal, setMode, addWire, clearWire, screenToWorld, spawn, wireEmptySpawnEnabled, wireEmptySpawnCommand]
  );

  return (
    <div
      id="canvas-viewport"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => {
        // Only prevent default on empty canvas, not on terminal nodes
        if (!(e.target as HTMLElement).closest(".terminal-node")) {
          e.preventDefault();
        }
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#13141b",
        cursor: mode === "draw" ? "crosshair" : mode === "wire" ? "crosshair" : "default",
      }}
    >
      <BackgroundLayer />
      <WireLayer />
      <TerminalLayer />
      <CanvasControls />
    </div>
  );
}
