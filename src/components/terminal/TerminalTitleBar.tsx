import { useTerminalStore } from "../../store/terminalStore";
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
  const { kill } = useTerminal();
  const team = useTeamStore((s) => s.getTeamForTerminal(terminal.id));

  const handleFoldToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (terminal.isFolded) {
      unfoldTerminal(terminal.id);
    } else {
      foldTerminal(terminal.id);
    }
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
