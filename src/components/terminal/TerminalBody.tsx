import { useRef, useEffect, useCallback, useState } from "react";
import { useTerminalIO } from "../../hooks/useTerminalIO";
import { useTerminalStore } from "../../store/terminalStore";
import { TERMINAL_THEMES } from "../../utils/terminalThemes";
import { writeTerminal } from "../../services/tauriCommands";
import PasteConfirmDialog from "./PasteConfirmDialog";
import "@xterm/xterm/css/xterm.css";

interface TerminalBodyProps {
  terminalId: string;
}

export default function TerminalBody({ terminalId }: TerminalBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fit, termRef } = useTerminalIO(terminalId, containerRef);
  const themeName = useTerminalStore((s) => s.terminals.get(terminalId)?.theme ?? "tokyonight");
  const bg = TERMINAL_THEMES[themeName]?.background ?? "#1a1b26";
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);

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

  // Intercept multi-line paste — xterm captures paste on its hidden textarea,
  // so we listen there with capture-phase to preempt xterm's handler.
  useEffect(() => {
    const term = termRef.current;
    const target = term?.textarea;
    if (!target) return;

    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      if (text.includes("\n")) {
        e.preventDefault();
        e.stopPropagation();
        setPendingPaste(text);
      }
    };

    target.addEventListener("paste", onPaste, true);
    return () => {
      target.removeEventListener("paste", onPaste, true);
    };
  }, [termRef, terminalId]);

  const confirmPaste = useCallback(() => {
    if (pendingPaste != null) {
      const bytes = Array.from(new TextEncoder().encode(pendingPaste));
      writeTerminal(terminalId, bytes).catch(console.error);
    }
    setPendingPaste(null);
    termRef.current?.focus();
  }, [pendingPaste, terminalId, termRef]);

  const cancelPaste = useCallback(() => {
    setPendingPaste(null);
    termRef.current?.focus();
  }, [termRef]);

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
        position: "relative",
      }}
    >
      {pendingPaste != null && (
        <PasteConfirmDialog
          text={pendingPaste}
          onConfirm={confirmPaste}
          onCancel={cancelPaste}
        />
      )}
    </div>
  );
}
