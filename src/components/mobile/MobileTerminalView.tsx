import { useRef, useEffect } from "react";
import TerminalBody from "../terminal/TerminalBody";

interface MobileTerminalViewProps {
  terminalId: string;
  active?: boolean;
}

export default function MobileTerminalView({ terminalId, active = true }: MobileTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the xterm textarea when this terminal becomes active so the
  // on-screen keyboard appears immediately on mobile. Triggered on `active`
  // (not just terminalId) so drawer switches re-focus the now-visible
  // terminal — every terminal stays mounted via display:none, so a one-shot
  // mount-time focus would only fire for the very first activation.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(
        "textarea.xterm-helper-textarea"
      );
      if (textarea) textarea.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [terminalId, active]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TerminalBody key={terminalId} terminalId={terminalId} />
    </div>
  );
}
