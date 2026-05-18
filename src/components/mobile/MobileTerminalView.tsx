import { useRef, useEffect } from "react";
import TerminalBody from "../terminal/TerminalBody";

interface MobileTerminalViewProps {
  terminalId: string;
}

export default function MobileTerminalView({ terminalId }: MobileTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the xterm textarea when this terminal becomes active so the
  // on-screen keyboard appears immediately on mobile.
  useEffect(() => {
    const timer = setTimeout(() => {
      const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>(
        "textarea.xterm-helper-textarea"
      );
      if (textarea) textarea.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [terminalId]);

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
