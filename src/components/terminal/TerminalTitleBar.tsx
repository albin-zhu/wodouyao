import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useTerminal } from "../../hooks/useTerminal";
import { useTeamStore } from "../../store/teamStore";
import TerminalStatusBadge from "./TerminalStatusBadge";
import type { TerminalNode } from "../../types/terminal";

interface TerminalTitleBarProps {
  terminal: TerminalNode;
}

export default function TerminalTitleBar({ terminal }: TerminalTitleBarProps) {
  const foldTerminal = useTerminalStore((s) => s.foldTerminal);
  const unfoldTerminal = useTerminalStore((s) => s.unfoldTerminal);
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const bringToFront = useTerminalStore((s) => s.bringToFront);
  const { kill } = useTerminal();
  const team = useTeamStore((s) => s.getTeamForTerminal(terminal.id));

  const isMaximized = !!terminal.prevBounds;

  const handleFoldToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (terminal.isFolded) {
      unfoldTerminal(terminal.id);
    } else {
      foldTerminal(terminal.id);
    }
  };

  const handleMaxToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMaximized && terminal.prevBounds) {
      // Restore
      updateTerminal(terminal.id, {
        position: terminal.prevBounds.position,
        size: terminal.prevBounds.size,
        prevBounds: undefined,
      });
      return;
    }
    // Maximize: fill the current canvas viewport in world coords.
    const vp = document.getElementById("canvas-viewport");
    const rect = vp?.getBoundingClientRect();
    if (!rect) return;
    const { panX, panY, zoom } = useCanvasStore.getState();
    const worldX = -panX / zoom;
    const worldY = -panY / zoom;
    const worldW = rect.width / zoom;
    const worldH = rect.height / zoom;
    updateTerminal(terminal.id, {
      prevBounds: { position: terminal.position, size: terminal.size },
      position: { x: worldX, y: worldY },
      size: { width: worldW, height: worldH },
    });
    bringToFront(terminal.id);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    kill(terminal.id);
  };

  return (
    <div
      className="terminal-title-bar"
      style={{
        height: 36,
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        background: "#1f2335",
        borderBottom: terminal.isFolded ? "none" : "1px solid #292e42",
        borderLeft: `3px solid ${terminal.color}`,
        cursor: "grab",
        userSelect: "none",
        borderRadius: terminal.isFolded ? "8px" : "8px 8px 0 0",
      }}
    >
      <TerminalStatusBadge status={terminal.status} />
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: terminal.color,
          marginRight: 8,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: "#c0caf5",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {team && (
          <span
            style={{
              padding: "1px 6px",
              marginRight: 6,
              borderRadius: 3,
              background: team.palette.base,
              color: "#1a1b26",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.3,
            }}
          >
            {team.name}
          </span>
        )}
        {terminal.name}
      </span>
      <button
        onClick={handleFoldToggle}
        title={terminal.isFolded ? "Expand" : "Collapse"}
        style={{
          background: "none",
          border: "none",
          color: "#565f89",
          cursor: "pointer",
          fontSize: 14,
          padding: "2px 6px",
          lineHeight: 1,
        }}
      >
        {terminal.isFolded ? "\u25B3" : "\u25BD"}
      </button>
      <button
        onClick={handleMaxToggle}
        title={isMaximized ? "Restore" : "Maximize"}
        style={{
          background: "none",
          border: "none",
          color: isMaximized ? "#7aa2f7" : "#565f89",
          cursor: "pointer",
          fontSize: 13,
          padding: "2px 6px",
          lineHeight: 1,
        }}
      >
        {isMaximized ? "\u29C9" : "\u2610"}
      </button>
      <button
        onClick={handleClose}
        title="Close terminal"
        style={{
          background: "none",
          border: "none",
          color: "#565f89",
          cursor: "pointer",
          fontSize: 14,
          padding: "2px 6px",
          lineHeight: 1,
        }}
      >
        {"\u2715"}
      </button>
    </div>
  );
}
