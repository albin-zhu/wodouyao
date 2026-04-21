import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import { invoke } from "@tauri-apps/api/core";
import { writeTerminal, resizeTerminal, destroyTerminal } from "../services/tauriCommands";
import { listenTerminalOutput, listenTerminalExit } from "../services/tauriEvents";
import { registerXterm, unregisterXterm } from "../services/terminalRegistry";
import { useTerminalStore } from "../store/terminalStore";
import { useWireStore } from "../store/wireStore";
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
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      fontFamily:
        "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: xtermTheme,
      // Custom OSC 8 hyperlink handler — bypasses xterm's built-in
      // window.confirm() prompt which tauri-plugin-dialog would intercept.
      linkHandler: {
        activate: (_e, text) => {
          invoke("open_url", { url: text }).catch(console.error);
        },
        allowNonHttpProtocols: true,
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    // Detect any scheme://... URL and open with system default handler.
    const URL_REGEX = /[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/[^\s"'<>()[\]{}]+/g;
    term.registerLinkProvider({
      provideLinks(y, cb) {
        const line = term.buffer.active.getLine(y);
        if (!line) { cb([]); return; }
        const text = line.translateToString(true);
        const links: import("@xterm/xterm").ILink[] = [];
        let m: RegExpExecArray | null;
        URL_REGEX.lastIndex = 0;
        while ((m = URL_REGEX.exec(text)) !== null) {
          const url = m[0].replace(/[.,;:!?)]+$/, "");
          const startX = m.index;
          const endX = startX + url.length;
          links.push({
            range: { start: { x: startX + 1, y }, end: { x: endX, y } },
            text: url,
            activate() { invoke("open_url", { url }).catch(console.error); },
          });
        }
        cb(links);
      },
    });

    // Canvas renderer — required for xterm.js v5.5+ to render text. We
    // intentionally do NOT use the WebGL addon: the whole TerminalLayer
    // lives under a CSS `transform: scale()` (canvas pan/zoom), which the
    // WebGL renderer can't handle correctly — glyphs and ANSI colors drop
    // out on some GPUs (notably inside Tauri's webview), which is why
    // Claude's output looked colorless. Canvas renderer is transform-safe.
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

    // Send user input to backend PTY, and mirror it to any io-wired peer
    // terminals so Enter / Ctrl keys / arrow keys travel together.
    const encoder = new TextEncoder();
    term.onData((data) => {
      const bytes = Array.from(encoder.encode(data));
      writeTerminal(terminalId, bytes).catch(console.error);

      const wires = useWireStore.getState().wires;
      if (wires.size === 0) return;
      const terminals = useTerminalStore.getState().terminals;
      for (const w of wires.values()) {
        if (w.kind !== "io") continue;
        let peerId: string | null = null;
        if (w.sourceId === terminalId && terminals.has(w.targetId)) {
          peerId = w.targetId;
        } else if (w.targetId === terminalId && terminals.has(w.sourceId)) {
          peerId = w.sourceId;
        }
        if (peerId) {
          writeTerminal(peerId, bytes).catch(console.error);
        }
      }
    });

    // Listen for PTY output and exit
    const unlistenFns: Array<() => void> = [];

    listenTerminalOutput(terminalId, (bytes) => {
      term.write(bytes);
      // Piggyback: mark activity timestamp for status tracking.
      useTerminalStore.getState().markActivity(terminalId, Date.now());
    }).then((fn) => unlistenFns.push(fn)).catch(() => {});

    listenTerminalExit(terminalId, (exitCode) => {
      useTerminalStore.getState().setExitCode(terminalId, exitCode ?? 0);
      // Shell exited on its own; reap the backend session and then drop the
      // node from the canvas so the UI matches reality. Brief delay so the
      // final output + "terminated" badge are visible for a moment.
      destroyTerminal(terminalId).catch(() => {});
      setTimeout(() => {
        useTerminalStore.getState().removeTerminal(terminalId);
      }, 400);
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
