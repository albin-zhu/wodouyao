import { useTerminalStore } from "../../store/terminalStore";
import { useTerminal } from "../../hooks/useTerminal";
import TerminalStatusBadge from "./TerminalStatusBadge";
import type { TerminalNode } from "../../types/terminal";

interface TerminalTitleBarProps {
  terminal: TerminalNode;
}

export default function TerminalTitleBar({ terminal }: TerminalTitleBarProps) {
  const foldTerminal = useTerminalStore((s) => s.foldTerminal);
  const unfoldTerminal = useTerminalStore((s) => s.unfoldTerminal);
  const { kill } = useTerminal();

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
        cursor: "grab",
        userSelect: "none",
        borderRadius: terminal.isFolded ? "8px" : "8px 8px 0 0",
      }}
    >
      <TerminalStatusBadge status={terminal.status} />
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
