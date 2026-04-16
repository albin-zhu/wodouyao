import { useRef, useEffect, useCallback } from "react";
import { useTerminalIO } from "../../hooks/useTerminalIO";
import { useTerminalStore } from "../../store/terminalStore";
import { TERMINAL_THEMES } from "../../utils/terminalThemes";
import "@xterm/xterm/css/xterm.css";

interface TerminalBodyProps {
  terminalId: string;
}

export default function TerminalBody({ terminalId }: TerminalBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fit, termRef } = useTerminalIO(terminalId, containerRef);
  const themeName = useTerminalStore((s) => s.terminals.get(terminalId)?.theme ?? "tokyonight");
  const bg = TERMINAL_THEMES[themeName]?.background ?? "#1a1b26";

  const handleClick = useCallback(() => {
    termRef.current?.focus();
  }, [termRef]);

  // Resize observer to auto-fit terminal when container size changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div
      ref={containerRef}
      className="terminal-body"
      onClick={handleClick}
      style={{
        flex: 1,
        overflow: "hidden",
        padding: 4,
        background: bg,
      }}
    />
  );
}
