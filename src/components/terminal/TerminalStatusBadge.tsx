import { useEffect } from "react";
import type { TerminalStatus } from "../../types/terminal";

interface TerminalStatusBadgeProps {
  status: TerminalStatus;
}

const STATUS_COLORS: Record<TerminalStatus, string> = {
  starting:   "var(--color-warning)",
  running:    "var(--color-success)",
  idle:       "var(--color-text-muted)",
  error:      "var(--color-danger)",
  terminated: "var(--color-border-strong)",
};

export default function TerminalStatusBadge({ status }: TerminalStatusBadgeProps) {
  useEffect(() => {
    if (document.getElementById("wd-statusdot-keyframes")) return;
    const style = document.createElement("style");
    style.id = "wd-statusdot-keyframes";
    // Use calc(Xpx / var(--zoom, 1)) so the glow radius stays visually
    // constant regardless of canvas zoom level.
    style.textContent = [
      "@keyframes wd-dot-pulse {",
      "  0%,100% { box-shadow: 0 0 0 0 rgba(158,206,106,0.55); }",
      "  50% { box-shadow: 0 0 0 calc(4px / var(--zoom, 1)) rgba(158,206,106,0); }",
      "}",
    ].join(" ");
    document.head.appendChild(style);
  }, []);

  return (
    <span
      style={{
        display: "inline-block",
        // Compensate for canvas scale: the dot lives inside a CSS-transformed
        // TerminalLayer, so at zoom=0.5 an 8px dot appears as 4px on screen.
        // calc(8px / var(--zoom, 1)) inverts the scale, keeping it ~8px
        // visually. Clamped so it never exceeds 18px (avoids huge dots when
        // zoomed far out, where the terminal node itself is also very small).
        width:  "clamp(6px, calc(8px / var(--zoom, 1)), 18px)",
        height: "clamp(6px, calc(8px / var(--zoom, 1)), 18px)",
        borderRadius: "50%",
        backgroundColor: STATUS_COLORS[status],
        marginRight: "calc(6px / var(--zoom, 1))",
        flexShrink: 0,
        animation: status === "running" ? "wd-dot-pulse 1.4s ease-in-out infinite" : undefined,
      }}
      title={status}
    />
  );
}
