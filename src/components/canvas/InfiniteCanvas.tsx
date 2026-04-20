import { useCallback, useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useCanvas } from "../../hooks/useCanvas";
import { useCanvasStore } from "../../store/canvasStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useWireStore } from "../../store/wireStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useNewTerminal } from "../../hooks/useNewTerminal";
import { useTerminal } from "../../hooks/useTerminal";
import { useSettingsStore } from "../../store/settingsStore";
import { fileInspect } from "../../services/tauriCommands";
import type { FileKind } from "../../types/fileNode";
import BackgroundLayer from "./BackgroundLayer";
import ResourceLayer from "./ResourceLayer";
import TerminalLayer from "../terminal/TerminalLayer";
import WireLayer from "./WireLayer";
import CanvasControls from "./CanvasControls";

const TEXT_EXTS = new Set([
  "txt", "md", "json", "yaml", "yml", "toml", "ini", "env",
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rs", "go", "java", "kt", "swift", "c", "cc", "cpp", "h", "hpp",
  "rb", "php", "sh", "bash", "zsh", "fish", "ps1",
  "html", "css", "scss", "sass", "less", "svg",
  "xml", "csv", "log", "lock",
]);
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tiff"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "mkv", "avi", "m4v"]);

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function extOf(p: string): string {
  const name = basename(p);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function classifyByExt(path: string): FileKind {
  const e = extOf(path);
  if (IMAGE_EXTS.has(e)) return "image";
  if (VIDEO_EXTS.has(e)) return "video";
  if (TEXT_EXTS.has(e)) return "text";
  return "other";
}

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
  const anyMaximized = useTerminalStore((s) =>
    Array.from(s.terminals.values()).some((t) => !!t.prevBounds)
  );
  const wireEmptySpawnCommand = useSettingsStore((s) => s.settings?.wire_empty_spawn_command ?? "claude");
  const drawingRef = useRef(false);

  // Compute kind ("io" | "note" | "file" | derived) for a wire between two nodes.
  const deriveWireKind = useCallback((a: string, b: string): string => {
    const t = useTerminalStore.getState().terminals;
    const n = useNoteStore.getState().notes;
    const f = useFileNodeStore.getState().fileNodes;
    const tb = useTaskBoardStore.getState().boards;
    const kindOf = (id: string) =>
      t.has(id)
        ? "terminal"
        : n.has(id)
        ? "note"
        : f.has(id)
        ? "file"
        : tb.has(id)
        ? "board"
        : "unknown";
    const ka = kindOf(a);
    const kb = kindOf(b);
    if (ka === "terminal" && kb === "terminal") return "io";
    if (ka === "terminal") return kb;
    if (kb === "terminal") return ka;
    return `${ka}-${kb}`;
  }, []);

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
      if (target.closest("[data-node-id], [data-terminal-id]") || target.closest("button")) return;

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

      // Wire mode: check if dropped on a node (terminal/note/file)
      if (mode === "wire" && wireStartId) {
        const target = e.target as HTMLElement;
        const node =
          target.closest("[data-node-id]") ?? target.closest("[data-terminal-id]");
        const targetId =
          node?.getAttribute("data-node-id") ?? node?.getAttribute("data-terminal-id") ?? null;
        if (targetId) {
          if (targetId !== wireStartId) {
            const kind = deriveWireKind(wireStartId, targetId);
            addWire(wireStartId, targetId, kind);
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
            }).then((t) => {
              const kind = deriveWireKind(sourceId, t.id);
              return addWire(sourceId, t.id, kind);
            }).catch(console.error);
          }
          clearWire();
          setMode("select");
        }
      }
    },
    [mode, drawRect, wireStartId, clearDrawRect, launchTerminal, setMode, addWire, clearWire, screenToWorld, spawn, wireEmptySpawnEnabled, wireEmptySpawnCommand, deriveWireKind]
  );

  // OS-level file/folder drop onto the canvas → spawn FileNodes.
  // Register exactly ONCE; read pan/zoom via store.getState() inside the
  // handler so the effect doesn't re-register on every viewport change
  // (the async unlisten Promise made re-registration leak listeners).
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const webview = getCurrentWebview();
    webview
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== "drop") return;
        const paths: string[] = (event.payload as { paths: string[] }).paths ?? [];
        if (!paths.length) return;
        const pos = (event.payload as { position?: { x: number; y: number } }).position;
        const viewport = document.getElementById("canvas-viewport");
        const rect = viewport?.getBoundingClientRect();
        const { panX, panY, zoom } = useCanvasStore.getState();
        const offsetX = rect?.left ?? 0;
        const offsetY = rect?.top ?? 0;
        const screenX = pos?.x ?? offsetX;
        const screenY = pos?.y ?? offsetY;
        const baseWorld = {
          x: (screenX - offsetX - panX) / zoom,
          y: (screenY - offsetY - panY) / zoom,
        };
        for (let i = 0; i < paths.length; i++) {
          const p = paths[i];
          let kind: FileKind = classifyByExt(p);
          try {
            const info = await fileInspect(p);
            if (info.exists && info.is_dir) kind = "directory";
          } catch {
            // ignore — fall back to extension classification
          }
          useFileNodeStore.getState().addFileNode({
            path: p,
            name: basename(p),
            kind,
            position: { x: baseWorld.x + i * 28, y: baseWorld.y + i * 28 },
          });
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div
      id="canvas-viewport"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => {
        // Only prevent default on empty canvas, not on terminal/note/file nodes
        const target = e.target as HTMLElement;
        if (!target.closest("[data-node-id], [data-terminal-id]")) {
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
      {!anyMaximized && <WireLayer />}
      <TerminalLayer />
      {!anyMaximized && <ResourceLayer />}
      {!anyMaximized && <CanvasControls />}
    </div>
  );
}
