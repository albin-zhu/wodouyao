import { useMemo } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import TerminalNode from "../terminal/TerminalNode";
import NoteNode from "./NoteNode";
import FileNode from "./FileNode";
import TaskBoardNode from "./TaskBoardNode";
import DrawPreview from "./DrawPreview";

/** Single layer for every node type that can sit on the canvas. The four
 *  types (terminal/note/file/task_board) share one stacking context so
 *  bringToFront from any store can pull a node above every other node
 *  globally. The container applies the pan/zoom transform; each node
 *  renders in world coordinates and inherits the parent transform. xterm
 *  canvases scale visually with the container (fixed pixel grid, GPU-
 *  composited) — same trade-off NoteNode/FileNode already accepted. */
type NodeKind = "terminal" | "note" | "file" | "board";
interface RenderItem {
  kind: NodeKind;
  id: string;
  zIndex: number;
}

export default function NodeLayer() {
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const notesMap = useNoteStore((s) => s.notes);
  const filesMap = useFileNodeStore((s) => s.fileNodes);
  const boardsMap = useTaskBoardStore((s) => s.boards);
  const wsId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);
  const { panX, panY, zoom } = useCanvasStore();

  // Find a maximized terminal (if any). When one is maximized, everything
  // else in the layer is hidden — same semantics the old layers had.
  const maximizedTerminalId = useMemo(() => {
    for (const t of terminalsMap.values()) {
      if (t.prevBounds) return t.id;
    }
    return null;
  }, [terminalsMap]);

  const inWs = <T extends { workspaceId?: string | null }>(item: T) =>
    wsId === null || (item.workspaceId ?? wsId) === wsId;

  // Always render all terminals in the NodeLayer so that React keeps the
  // xterm instances mounted across workspace switches. Terminals that do not
  // belong to the active workspace are hidden with display: none — this
  // preserves the DOM node and xterm state while removing them from layout
  // and hit-testing.
  const items: RenderItem[] = useMemo(() => {
    const out: RenderItem[] = [];
    for (const t of terminalsMap.values()) {
      // Do NOT skip non-active-workspace terminals — they must stay mounted
      // for xterm保活 (see workspace-switch fix).
      out.push({ kind: "terminal", id: t.id, zIndex: t.zIndex });
    }
    if (maximizedTerminalId === null) {
      for (const n of notesMap.values()) {
        if (!inWs(n)) continue;
        out.push({ kind: "note", id: n.id, zIndex: n.zIndex });
      }
      for (const f of filesMap.values()) {
        if (!inWs(f)) continue;
        out.push({ kind: "file", id: f.id, zIndex: f.zIndex });
      }
      for (const b of boardsMap.values()) {
        if (!inWs(b)) continue;
        out.push({ kind: "board", id: b.id, zIndex: b.zIndex });
      }
    }
    out.sort((a, b) => a.zIndex - b.zIndex);
    return out;
  }, [terminalsMap, notesMap, filesMap, boardsMap, wsId, maximizedTerminalId]);

  return (
    <div
      id="node-layer"
      style={
        {
          position: "absolute",
          top: 0,
          left: 0,
          // World-space canvas: children use their stored world coords;
          // pan/zoom are applied here once. `isolation: isolate` puts every
          // child into the same stacking context so cross-type z-index
          // comparisons work.
          transformOrigin: "0 0",
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          pointerEvents: "none",
          isolation: "isolate",
          // Drag/resize handlers and StatusBadge read this CSS var to
          // unwind the parent scale when computing pixel deltas.
          "--zoom": zoom,
        } as React.CSSProperties
      }
    >
      {items.map((it) => {
        if (it.kind === "terminal") {
          const t = terminalsMap.get(it.id);
          if (!t) return null;
          const hiddenByMaximize =
            maximizedTerminalId !== null && t.id !== maximizedTerminalId;
          const hiddenByWorkspace =
            wsId !== null && (t.workspaceId ?? wsId) !== wsId;
          const hidden = hiddenByMaximize || hiddenByWorkspace;
          return (
            <div
              key={`t:${t.id}`}
              style={
                hidden
                  ? {
                      display: "none",
                      visibility: "hidden",
                      pointerEvents: "none",
                    }
                  : undefined
              }
            >
              <TerminalNode terminal={t} />
            </div>
          );
        }
        if (it.kind === "note") {
          const n = notesMap.get(it.id);
          if (!n) return null;
          return <NoteNode key={`n:${n.id}`} note={n} />;
        }
        if (it.kind === "file") {
          const f = filesMap.get(it.id);
          if (!f) return null;
          return <FileNode key={`f:${f.id}`} file={f} />;
        }
        const b = boardsMap.get(it.id);
        if (!b) return null;
        return <TaskBoardNode key={`b:${b.id}`} board={b} />;
      })}
      <DrawPreview />
    </div>
  );
}
