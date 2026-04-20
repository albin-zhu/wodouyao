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

  // Resize observer to auto-fit terminal when container size changes.
  // Debounced + rAF-coalesced so fast mouse drags don't reflow xterm on
  // every pixel (which caused the viewport to jump around mid-drag).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const term = termRef.current;
        if (!term) {
          fit();
          return;
        }
        const buf = term.buffer.active;
        // Preserve scrollback position across the resize so reflow doesn't
        // yank the viewport. We snapshot viewportY relative to the top of
        // the scrollback buffer and restore it afterward.
        const wasAtBottom = buf.viewportY + term.rows >= buf.length;
        const anchorLine = buf.baseY + buf.cursorY;
        fit();
        // fit() → xterm reflow happens synchronously; restore scroll next tick.
        requestAnimationFrame(() => {
          const t = termRef.current;
          if (!t) return;
          if (wasAtBottom) {
            t.scrollToBottom();
          } else {
            const nb = t.buffer.active;
            const target = Math.max(0, anchorLine - t.rows + 1);
            t.scrollToLine(Math.min(target, nb.length - t.rows));
          }
        });
      }, 60);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [fit, termRef]);

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
