import type { TerminalStatus } from "../../types/terminal";

interface TerminalStatusBadgeProps {
  status: TerminalStatus;
}

const STATUS_COLORS: Record<TerminalStatus, string> = {
  starting: "#e0af68",
  running: "#9ece6a",
  idle: "#565f89",
  error: "#f7768e",
  terminated: "#565f89",
};

export default function TerminalStatusBadge({ status }: TerminalStatusBadgeProps) {
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
      }}
      title={status}
    />
  );
}
