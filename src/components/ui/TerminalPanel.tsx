import { useState, useMemo, useRef, useCallback } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWireStore } from "../../store/wireStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useTerminal } from "../../hooks/useTerminal";
import { readTerminalBuffer } from "../../services/terminalRegistry";

type NodeKind = "terminal" | "note" | "file" | "board";

interface UnifiedNode {
  id: string;
  kind: NodeKind;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  workspaceId?: string | null;
  // Terminal-specific (only set for kind === "terminal"):
  status?: string;
  color?: string;
  shellType?: string;
  initialCommand?: string;
}

const KIND_GLYPH: Record<NodeKind, string> = {
  terminal: "■", // ■
  note: "✎",     // ✎
  file: "▤",     // ▤
  board: "☰",    // ☰
};
const KIND_LABEL: Record<NodeKind, string> = {
  terminal: "term",
  note: "note",
  file: "file",
  board: "board",
};

export default function TerminalPanel() {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const notesMap = useNoteStore((s) => s.notes);
  const fileNodesMap = useFileNodeStore((s) => s.fileNodes);
  const boardsMap = useTaskBoardStore((s) => s.boards);
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const zenMode = useCanvasStore((s) => s.zenMode);
  const currentWsId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);

  const nodes = useMemo<UnifiedNode[]>(() => {
    const out: UnifiedNode[] = [];
    const inWs = (wsId: string | null | undefined) =>
      currentWsId === null || (wsId ?? currentWsId) === currentWsId;

    for (const t of terminalsMap.values()) {
      if (!inWs(t.workspaceId)) continue;
      out.push({
        id: t.id,
        kind: "terminal",
        label: t.name,
        position: t.position,
        size: t.size,
        workspaceId: t.workspaceId,
        status: t.status,
        color: t.color,
        shellType: t.shellType,
        initialCommand: t.initialCommand,
      });
    }
    for (const n of notesMap.values()) {
      if (!inWs(n.workspaceId)) continue;
      const firstLine = (n.text ?? "").split("\n")[0]?.trim() ?? "";
      out.push({
        id: n.id,
        kind: "note",
        label: firstLine || "(empty note)",
        position: n.position,
        size: n.size,
        workspaceId: n.workspaceId,
      });
    }
    for (const f of fileNodesMap.values()) {
      if (!inWs(f.workspaceId)) continue;
      out.push({
        id: f.id,
        kind: "file",
        label: f.name || "(file)",
        position: f.position,
        size: f.size,
        workspaceId: f.workspaceId,
      });
    }
    for (const b of boardsMap.values()) {
      if (!inWs(b.workspaceId)) continue;
      out.push({
        id: b.id,
        kind: "board",
        label: "Task board",
        position: b.position,
        size: b.size,
        workspaceId: b.workspaceId,
      });
    }
    return out;
  }, [terminalsMap, notesMap, fileNodesMap, boardsMap, currentWsId]);

  const { setPan } = useCanvasStore();
  const zoom = useCanvasStore((s) => s.zoom);
  const wiresMap = useWireStore((s) => s.wires);
  const { kill } = useTerminal();

  // Drag state
  const [pos, setPos] = useState({ x: 12, y: -1 }); // -1 = bottom-relative
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("input"))
        return;
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: pos.x,
        startPosY: pos.y,
      };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPos({
          x: dragRef.current.startPosX + dx,
          y: dragRef.current.startPosY + dy,
        });
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [pos]
  );

  const focusNode = useCallback(
    (n: UnifiedNode) => {
      const centerX =
        window.innerWidth / 2 - (n.position.x + n.size.width / 2) * zoom;
      const centerY =
        (window.innerHeight - 40) / 2 -
        (n.position.y + n.size.height / 2) * zoom;
      setPan(centerX, centerY);
      if (n.kind === "terminal") bringToFront(n.id);
    },
    [zoom, setPan, bringToFront]
  );

  const getWireCount = (id: string) => {
    return Array.from(wiresMap.values()).filter(
      (w) => w.sourceId === id || w.targetId === id
    ).length;
  };

  const filtered = filter
    ? nodes.filter(
        (n) =>
          n.label.toLowerCase().includes(filter.toLowerCase()) ||
          n.kind.includes(filter.toLowerCase())
      )
    : nodes;

  const statusColor = (status?: string) => {
    switch (status) {
      case "running":
        return "var(--color-success)";
      case "terminated":
        return "var(--color-text-muted)";
      case "error":
        return "var(--color-danger)";
      default:
        return "var(--color-warning)";
    }
  };

  // Position: if pos.y < 0, anchor to bottom
  const posStyle: React.CSSProperties =
    pos.y < 0
      ? { left: pos.x, bottom: 60 }
      : { left: pos.x, top: pos.y + 40 };

  if (zenMode) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Nodes"
        style={{
          position: "fixed",
          ...posStyle,
          zIndex: 50,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          color: "var(--color-accent)",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "var(--shadow-panel)",
        }}
      >
        {"☰"} {nodes.length}
      </button>
    );
  }

  return (
    <div
      onMouseDown={handleDragStart}
      style={{
        position: "fixed",
        ...posStyle,
        zIndex: 50,
        width: 240,
        maxHeight: 360,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        boxShadow: "var(--shadow-dropdown)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "grab",
        }}
      >
        <span style={{ color: "var(--color-text)", fontSize: 12, fontWeight: 600 }}>
          Nodes ({nodes.length})
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
          }}
        >
          {"−"}
        </button>
      </div>

      {/* Search */}
      {nodes.length > 3 && (
        <div style={{ padding: "6px 10px" }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter (name or kind)…"
            style={{
              width: "100%",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              color: "var(--color-text)",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none",
            }}
          />
        </div>
      )}

      {/* Node list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "12px 10px", color: "var(--color-text-muted)", fontSize: 11 }}>
            No nodes
          </div>
        )}
        {filtered.map((n) => {
          const wireCount = getWireCount(n.id);
          return (
            <div
              key={`${n.kind}-${n.id}`}
              onClick={() => focusNode(n)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--color-bg-alt)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <span
                  title={KIND_LABEL[n.kind]}
                  style={{
                    width: 14,
                    color: "var(--color-text-muted)",
                    fontSize: 11,
                    flexShrink: 0,
                    textAlign: "center",
                  }}
                >
                  {KIND_GLYPH[n.kind]}
                </span>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      n.kind === "terminal"
                        ? n.color ?? statusColor(n.status)
                        : "var(--color-text-muted)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "var(--color-text)",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.label}
                </span>
                {wireCount > 0 && (
                  <span
                    style={{
                      color: "var(--color-accent)",
                      fontSize: 10,
                      flexShrink: 0,
                    }}
                  >
                    {wireCount}w
                  </span>
                )}
              </div>
              {n.kind === "terminal" && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const content = readTerminalBuffer(n.id);
                      navigator.clipboard.writeText(content).catch(console.error);
                    }}
                    title="Copy terminal buffer"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                      fontSize: 11,
                      padding: "0 4px",
                      flexShrink: 0,
                    }}
                  >
                    {"⎘"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      kill(n.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-text-muted)",
                      cursor: "pointer",
                      fontSize: 11,
                      padding: "0 4px",
                      flexShrink: 0,
                    }}
                  >
                    {"✕"}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
