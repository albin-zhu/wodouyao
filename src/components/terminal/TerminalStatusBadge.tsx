import { useEffect } from "react";
import type { TerminalStatus } from "../../types/terminal";

interface TerminalStatusBadgeProps {
  status: TerminalStatus;
}

const STATUS_COLORS: Record<TerminalStatus, string> = {
  starting: "#e0af68",
  running: "#9ece6a",
  idle: "#565f89",
  error: "#f7768e",
  terminated: "#3b4261",
};

export default function TerminalStatusBadge({ status }: TerminalStatusBadgeProps) {
  useEffect(() => {
    if (document.getElementById("wd-statusdot-keyframes")) return;
    const style = document.createElement("style");
    style.id = "wd-statusdot-keyframes";
    style.textContent =
      "@keyframes wd-dot-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(158,206,106,0.55); } 50% { box-shadow: 0 0 0 4px rgba(158,206,106,0); } }";
    document.head.appendChild(style);
  }, []);
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: STATUS_COLORS[status],
        marginRight: 6,
        flexShrink: 0,
        animation: status === "running" ? "wd-dot-pulse 1.4s ease-in-out infinite" : undefined,
      }}
      title={status}
    />
  );
}
