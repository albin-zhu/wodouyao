import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { CanvasAddon } from "@xterm/addon-canvas";
import { writeTerminal, resizeTerminal, destroyTerminal } from "../services/tauriCommands";
import { listenTerminalOutput, listenTerminalExit } from "../services/tauriEvents";
import { registerXterm, unregisterXterm } from "../services/terminalRegistry";
import { useTerminalStore } from "../store/terminalStore";
import { TERMINAL_THEMES } from "../utils/terminalThemes";
import type { TerminalTheme } from "../types/terminal";

export function useTerminalIO(terminalId: string, containerRef: React.RefObject<HTMLDivElement | null>) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const setStatus = useTerminalStore((s) => s.setStatus);
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const themeRef = useRef<TerminalTheme>("tokyonight");

  // Read initial theme from store
  const initialTheme = useTerminalStore((s) => s.terminals.get(terminalId)?.theme ?? "tokyonight");

  // Single effect that handles attach + cleanup — works with React StrictMode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    themeRef.current = initialTheme;
    const xtermTheme = TERMINAL_THEMES[initialTheme] ?? TERMINAL_THEMES.tokyonight;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: xtermTheme,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(container);

    // Load Canvas renderer — required for xterm.js v5.5+ to render text
    try {
      term.loadAddon(new CanvasAddon());
    } catch (e) {
      console.error("[xterm] Canvas renderer failed:", e);
    }

    term.focus();

    // Defer fit() so xterm.js has time to measure cell dimensions
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        updateTerminal(terminalId, { cols: term.cols, rows: term.rows });
      } catch {
        // Ignore — terminal may not be ready yet
      }
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Register in global registry for cross-terminal operations
    registerXterm(terminalId, term);

    // Send user input to backend PTY
    term.onData((data) => {
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(data));
      writeTerminal(terminalId, bytes).catch(console.error);
    });

    // Listen for PTY output and exit
    const unlistenFns: Array<() => void> = [];

    listenTerminalOutput(terminalId, (bytes) => {
      term.write(bytes);
    }).then((fn) => unlistenFns.push(fn)).catch(() => {});

    listenTerminalExit(terminalId, (_exitCode) => {
      setStatus(terminalId, "terminated");
      // Shell exited on its own; reap the backend session so the hub stops
      // returning it as a live peer. Node stays visible with a "terminated"
      // badge until the user closes it from the UI.
      destroyTerminal(terminalId).catch(() => {});
    }).then((fn) => unlistenFns.push(fn)).catch(() => {});

    setStatus(terminalId, "running");

    // Cleanup — runs on unmount (and between StrictMode re-mounts)
    return () => {
      unlistenFns.forEach((fn) => fn());
      unregisterXterm(terminalId);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = useCallback(() => {
    if (fitAddonRef.current && termRef.current) {
      try {
        fitAddonRef.current.fit();
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        updateTerminal(terminalId, { cols, rows });
        resizeTerminal(terminalId, cols, rows).catch(console.error);
      } catch {
        // Ignore — terminal render service may not be ready
      }
    }
  }, [terminalId, updateTerminal]);

  return { fit, termRef };
}
