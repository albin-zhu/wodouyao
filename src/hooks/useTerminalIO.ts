import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { CanvasAddon } from "@xterm/addon-canvas";
import { invoke } from "@tauri-apps/api/core";
import { writeTerminal, resizeTerminal, destroyTerminal } from "../services/tauriCommands";
import { listenTerminalOutput, listenTerminalExit } from "../services/tauriEvents";
import { registerXterm, unregisterXterm } from "../services/terminalRegistry";
import { useTerminalStore } from "../store/terminalStore";
import { useSettingsStore } from "../store/settingsStore";
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
    const baseTheme = TERMINAL_THEMES[initialTheme] ?? TERMINAL_THEMES.tokyonight;
    const settings = useSettingsStore.getState().settings;
    const opacity = settings?.terminal_opacity ?? 1;
    const isHdpi = settings?.is_hdpi ?? true;
    // When the user wants transparency, give xterm a fully-transparent
    // background and let the TerminalBody container render the tinted color.
    // The Canvas addon paints cell backgrounds opaquely even with
    // allowTransparency, so fighting it per-cell is brittle; CSS compositing
    // behind the canvas is reliable.
    const xtermTheme =
      opacity < 1
        ? { ...baseTheme, background: "rgba(0, 0, 0, 0)" }
        : baseTheme;

    const term = new Terminal({
      cursorBlink: true,
      // Treat the macOS Option key as Meta (Alt) in xterm. Without this,
      // Option-key shortcuts in agents (claude, codex, vim, emacs) get
      // swallowed by macOS's "insert special char" behavior.
      macOptionIsMeta: true,
      // Non-HDPI displays need beefier glyphs — bump the size and weight
      // so strokes don't disappear into the pixel grid.
      fontSize: isHdpi ? 13 : 14,
      lineHeight: isHdpi ? 1.2 : 1.25,
      letterSpacing: isHdpi ? 0 : 0.2,
      fontWeight: isHdpi ? "normal" : 500,
      fontWeightBold: isHdpi ? "bold" : 700,
      fontFamily:
        "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: xtermTheme,
      allowTransparency: opacity < 1,
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

    // Send user input to backend PTY only. Wires are ACL for hub peer
    // communication, not live keystroke mirroring — agents talk to peers
    // explicitly via the `wodouyao send` CLI.
    const encoder = new TextEncoder();
    term.onData((data) => {
      const bytes = Array.from(encoder.encode(data));
      writeTerminal(terminalId, bytes).catch(console.error);
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

  // React to global opacity + HDPI changes — apply in place (no remount).
  // xterm's setters swap theme/font live; allowTransparency was chosen at
  // construction, so we pre-enable it below at opacity<1.
  const opacity = useSettingsStore((s) => s.settings?.terminal_opacity ?? 1);
  const isHdpi = useSettingsStore((s) => s.settings?.is_hdpi ?? true);
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const current = useTerminalStore.getState().terminals.get(terminalId);
    const themeName = current?.theme ?? themeRef.current;
    const base = TERMINAL_THEMES[themeName] ?? TERMINAL_THEMES.tokyonight;
    term.options.theme = {
      ...base,
      background: opacity < 1 ? "rgba(0, 0, 0, 0)" : base.background,
    };
    term.options.fontSize = isHdpi ? 13 : 14;
    term.options.lineHeight = isHdpi ? 1.2 : 1.25;
    term.options.letterSpacing = isHdpi ? 0 : 0.2;
    term.options.fontWeight = isHdpi ? "normal" : 500;
    term.options.fontWeightBold = isHdpi ? "bold" : 700;
    // Trigger a re-fit so the new font metrics take effect.
    if (fitAddonRef.current) {
      try { fitAddonRef.current.fit(); } catch { /* ignore */ }
    }
  }, [opacity, isHdpi, terminalId]);

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
