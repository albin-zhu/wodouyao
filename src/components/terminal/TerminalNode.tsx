import { memo, useRef, useCallback, useState } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useTeamStore } from "../../store/teamStore";
import { useTaskStore } from "../../store/taskStore";
import { showTerminalContextMenu } from "./TerminalContextMenu";
import TerminalTitleBar from "./TerminalTitleBar";
import TerminalBody from "./TerminalBody";
import type { TerminalNode as TerminalNodeType } from "../../types/terminal";

interface TerminalNodeProps {
  terminal: TerminalNodeType;
}

function TerminalNodeImpl({ terminal }: TerminalNodeProps) {
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const team = useTeamStore((s) => s.getTeamForTerminal(terminal.id));
  const updateTask = useTaskStore((s) => s.updateTask);
  const [taskDropOver, setTaskDropOver] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [hovered, setHovered] = useState(false);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      showTerminalContextMenu(e.clientX, e.clientY, terminal);
    },
    [terminal]
  );

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

  // Resize from any edge or corner. `dir` is a subset of n/s/e/w.
  // Uses rAF coalescing so rapid mouse events collapse into one update
  // per frame, which keeps the drag feeling smooth.
  const startResize = useCallback(
    (dir: { n?: boolean; s?: boolean; e?: boolean; w?: boolean }) =>
      (e: React.MouseEvent) => {
        // In wire mode the crosshair is doing something else — let the
        // click fall through to the canvas / wire anchor logic.
        if (mode === "wire") return;
        e.preventDefault();
        e.stopPropagation();
        bringToFront(terminal.id);

        // Lock cursor globally for the duration of the drag so it doesn't
        // flicker back to default when the mouse moves off the hit strip.
        const cursorName =
          (dir.n && dir.w) || (dir.s && dir.e)
            ? "nwse-resize"
            : (dir.n && dir.e) || (dir.s && dir.w)
            ? "nesw-resize"
            : dir.n || dir.s
            ? "ns-resize"
            : "ew-resize";
        const prevBodyCursor = document.body.style.cursor;
        const prevUserSelect = document.body.style.userSelect;
        document.body.style.cursor = cursorName;
        document.body.style.userSelect = "none";

        const start = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          x: terminal.position.x,
          y: terminal.position.y,
          w: terminal.size.width,
          h: terminal.size.height,
        };
        const MIN_W = 300;
        const MIN_H = 100;

        let pendingFrame = 0;
        let latest: MouseEvent | null = null;

        const flush = () => {
          pendingFrame = 0;
          if (!latest) return;
          const zoom = parseFloat(
            document
              .getElementById("terminal-layer")
              ?.style.getPropertyValue("--zoom") ?? "1"
          );
          const dx = (latest.clientX - start.mouseX) / zoom;
          const dy = (latest.clientY - start.mouseY) / zoom;

          let x = start.x;
          let y = start.y;
          let w = start.w;
          let h = start.h;
          if (dir.e) w = start.w + dx;
          if (dir.s) h = start.h + dy;
          if (dir.w) {
            x = start.x + dx;
            w = start.w - dx;
          }
          if (dir.n) {
            y = start.y + dy;
            h = start.h - dy;
          }
          if (w < MIN_W) {
            if (dir.w) x = start.x + start.w - MIN_W;
            w = MIN_W;
          }
          if (h < MIN_H) {
            if (dir.n) y = start.y + start.h - MIN_H;
            h = MIN_H;
          }

          updateTerminal(terminal.id, {
            position: { x, y },
            size: { width: w, height: h },
          });
        };

        const onMouseMove = (ev: MouseEvent) => {
          latest = ev;
          if (pendingFrame) return;
          pendingFrame = requestAnimationFrame(flush);
        };
        const onMouseUp = () => {
          if (pendingFrame) cancelAnimationFrame(pendingFrame);
          window.removeEventListener("mousemove", onMouseMove);
          window.removeEventListener("mouseup", onMouseUp);
          document.body.style.cursor = prevBodyCursor;
          document.body.style.userSelect = prevUserSelect;
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
      },
    [terminal.id, terminal.position, terminal.size, updateTerminal, bringToFront, mode]
  );

  const handleWireAnchorDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Auto-switch to wire mode if not already
      if (mode !== "wire") {
        setMode("wire");
      }
      setWireStart(terminal.id);
    },
    [terminal.id, mode, setWireStart, setMode]
  );

  return (
    <div
      className="terminal-node"
      data-terminal-id={terminal.id}
      data-node-id={terminal.id}
      onMouseDown={handleMouseDown}
      onContextMenuCapture={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-wd-task")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setTaskDropOver(true);
        }
      }}
      onDragLeave={() => setTaskDropOver(false)}
      onDrop={(e) => {
        const taskId = e.dataTransfer.getData("application/x-wd-task");
        if (taskId) {
          e.preventDefault();
          updateTask(taskId, { owner_term_id: terminal.id, status: "in_progress" });
        }
        setTaskDropOver(false);
      }}
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
        border: taskDropOver
          ? "2px dashed var(--color-warning)"
          : mode === "wire"
          ? `1px solid ${terminal.color}`
          : `1px solid ${terminal.color}40`,
        overflow: "hidden",
        boxShadow: team ? `0 0 0 3px ${team.palette.base}55` : "none",
        transition: "height 0.2s ease",
        pointerEvents: "auto",
      }}
    >
      <div onMouseDown={handleDragStart}>
        <TerminalTitleBar terminal={terminal} />
      </div>
      {!terminal.isFolded && <TerminalBody terminalId={terminal.id} />}
      {!terminal.isFolded && mode !== "wire" && (
        <>
          {/* Bottom-right corner is the only resize handle — edges/other
              corners removed so accidental drags from those areas are
              impossible (they were also fighting wire-mode hits). */}
          <div
            onMouseDown={startResize({ s: true, e: true })}
            title="Drag to resize"
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 16,
              height: 16,
              cursor: "nwse-resize",
              pointerEvents: "auto",
              zIndex: 21,
              borderBottomRightRadius: 8,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              style={{
                display: "block",
                opacity: hovered ? 0.65 : 0.25,
                transition: "opacity 0.15s",
                pointerEvents: "none",
              }}
            >
              <line x1="12" y1="4" x2="4" y2="12" stroke="var(--color-text)" strokeWidth="1.25" strokeLinecap="round" />
              <line x1="13.5" y1="7.5" x2="7.5" y2="13.5" stroke="var(--color-text)" strokeWidth="1.25" strokeLinecap="round" />
              <line x1="15" y1="11" x2="11" y2="15" stroke="var(--color-text)" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
          </div>
        </>
      )}
      {/* Wire connection anchor (right side) — visible on hover or wire mode */}
      {(hovered || mode === "wire") && (
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
            border: "2px solid var(--color-surface)",
            cursor: "crosshair",
            zIndex: 10,
            opacity: mode === "wire" ? 1 : 0.6,
            transition: "opacity 0.15s",
          }}
        />
      )}
    </div>
  );
}

// Memoize so that moving/resizing ONE terminal (which replaces the
// terminalStore's Map reference) doesn't re-render every other node.
// Props-level Object.is on `terminal` is enough because updateTerminal only
// replaces the entry for the node being changed; unchanged nodes keep their
// old object reference.
export default memo(TerminalNodeImpl);
