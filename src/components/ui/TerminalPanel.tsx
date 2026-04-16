import { useState, useMemo, useRef, useCallback } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWireStore } from "../../store/wireStore";
import { useTerminal } from "../../hooks/useTerminal";
import { readTerminalBuffer } from "../../services/terminalRegistry";

export default function TerminalPanel() {
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState("");
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const terminals = useMemo(
    () => Array.from(terminalsMap.values()),
    [terminalsMap]
  );
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

  const focusTerminal = useCallback(
    (id: string) => {
      const t = terminalsMap.get(id);
      if (!t) return;
      const centerX =
        window.innerWidth / 2 -
        (t.position.x + t.size.width / 2) * zoom;
      const centerY =
        (window.innerHeight - 40) / 2 -
        (t.position.y + t.size.height / 2) * zoom;
      setPan(centerX, centerY);
      bringToFront(id);
    },
    [terminalsMap, zoom, setPan, bringToFront]
  );

  const getWireCount = (terminalId: string) => {
    return Array.from(wiresMap.values()).filter(
      (w) => w.sourceId === terminalId || w.targetId === terminalId
    ).length;
  };

  const filtered = filter
    ? terminals.filter((t) =>
        t.name.toLowerCase().includes(filter.toLowerCase())
      )
    : terminals;

  const statusColor = (status: string) => {
    switch (status) {
      case "running":
        return "#9ece6a";
      case "terminated":
        return "#565f89";
      case "error":
        return "#f7768e";
      default:
        return "#e0af68";
    }
  };

  // Position: if pos.y < 0, anchor to bottom
  const posStyle: React.CSSProperties =
    pos.y < 0
      ? { left: pos.x, bottom: 60 }
      : { left: pos.x, top: pos.y + 40 }; // 40 = toolbar height

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Terminal Panel"
        style={{
          position: "fixed",
          ...posStyle,
          zIndex: 50,
          background: "#1f2335",
          border: "1px solid #292e42",
          borderRadius: 8,
          color: "#7aa2f7",
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}
      >
        {"\u2630"} {terminals.length}
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
        width: 220,
        maxHeight: 320,
        background: "#1f2335",
        border: "1px solid #292e42",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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
          borderBottom: "1px solid #292e42",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "grab",
        }}
      >
        <span style={{ color: "#c0caf5", fontSize: 12, fontWeight: 600 }}>
          Terminals ({terminals.length})
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none",
            border: "none",
            color: "#565f89",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
          }}
        >
          {"\u2212"}
        </button>
      </div>

      {/* Search */}
      {terminals.length > 3 && (
        <div style={{ padding: "6px 10px" }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            style={{
              width: "100%",
              background: "#13141b",
              border: "1px solid #292e42",
              borderRadius: 4,
              color: "#c0caf5",
              padding: "4px 8px",
              fontSize: 11,
              outline: "none",
            }}
          />
        </div>
      )}

      {/* Terminal list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <div style={{ padding: "12px 10px", color: "#565f89", fontSize: 11 }}>
            No terminals
          </div>
        )}
        {filtered.map((t) => {
          const wireCount = getWireCount(t.id);
          return (
            <div
              key={t.id}
              onClick={() => focusTerminal(t.id)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid #1a1b26",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: t.color ?? statusColor(t.status),
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "#c0caf5",
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name}
                </span>
                {wireCount > 0 && (
                  <span
                    style={{
                      color: "#7aa2f7",
                      fontSize: 10,
                      flexShrink: 0,
                    }}
                  >
                    {wireCount}w
                  </span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const content = readTerminalBuffer(t.id);
                  navigator.clipboard.writeText(content).catch(console.error);
                }}
                title="Copy terminal buffer"
                style={{
                  background: "none",
                  border: "none",
                  color: "#565f89",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "0 4px",
                  flexShrink: 0,
                }}
              >
                {"\u2398"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  kill(t.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#565f89",
                  cursor: "pointer",
                  fontSize: 11,
                  padding: "0 4px",
                  flexShrink: 0,
                }}
              >
                {"\u2715"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
