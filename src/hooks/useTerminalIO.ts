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
import { getXtermThemeMap } from "../utils/terminalThemes";
import { DEFAULT_TERMINAL_OPTIONS } from "../types/settings";
import type { TerminalTheme } from "../types/terminal";
import type { TerminalOptions } from "../types/settings";

function toXtermOptions(opts: TerminalOptions, opacity: number, baseTheme: import("@xterm/xterm").ITheme) {
  return {
    fontSize: opts.font_size,
    fontFamily: opts.font_family,
    fontWeight: opts.font_weight as import("@xterm/xterm").FontWeight,
    fontWeightBold: opts.font_weight_bold as import("@xterm/xterm").FontWeight,
    lineHeight: opts.line_height,
    letterSpacing: opts.letter_spacing,
    cursorBlink: opts.cursor_blink,
    cursorStyle: opts.cursor_style as "block" | "underline" | "bar",
    cursorWidth: opts.cursor_width,
    cursorInactiveStyle: opts.cursor_inactive_style as "outline" | "block" | "bar" | "underline" | "none",
    scrollback: opts.scrollback,
    scrollSensitivity: opts.scroll_sensitivity,
    fastScrollSensitivity: opts.fast_scroll_sensitivity,
    fastScrollModifier: opts.fast_scroll_modifier as "none" | "alt" | "ctrl" | "shift",
    smoothScrollDuration: opts.smooth_scroll_duration,
    customGlyphs: opts.custom_glyphs,
    drawBoldTextInBrightColors: opts.draw_bold_text_in_bright_colors,
    minimumContrastRatio: opts.minimum_contrast_ratio,
    macOptionIsMeta: opts.mac_option_is_meta,
    rightClickSelectsWord: opts.right_click_selects_word,
    wordSeparator: opts.word_separator,
    theme: {
      ...baseTheme,
      background: opacity < 1 ? "rgba(0, 0, 0, 0)" : baseTheme.background,
    },
    allowTransparency: opacity < 1,
  };
}

export function useTerminalIO(terminalId: string, containerRef: React.RefObject<HTMLDivElement | null>) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const setStatus = useTerminalStore((s) => s.setStatus);
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);
  const themeRef = useRef<TerminalTheme>("tokyonight");

  const initialTheme = useTerminalStore((s) => s.terminals.get(terminalId)?.theme ?? "tokyonight");

  // Single effect that handles attach + cleanup — works with React StrictMode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    themeRef.current = initialTheme;
    const xtermMap = getXtermThemeMap();
    const baseTheme = xtermMap[initialTheme] ?? xtermMap.tokyonight;
    const settings = useSettingsStore.getState().settings;
    const opacity = settings?.terminal_opacity ?? 1;
    const opts = settings?.terminal_options ?? DEFAULT_TERMINAL_OPTIONS;

    const term = new Terminal({
      ...toXtermOptions(opts, opacity, baseTheme),
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

  // React to opacity / terminal_options / top-level theme changes in-place.
  const opacity = useSettingsStore((s) => s.settings?.terminal_opacity ?? 1);
  const terminalOptions = useSettingsStore((s) => s.settings?.terminal_options ?? DEFAULT_TERMINAL_OPTIONS);
  const appTheme = useSettingsStore((s) => s.settings?.theme ?? "system");
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const reApply = () => {
      const current = useTerminalStore.getState().terminals.get(terminalId);
      const themeName = current?.theme ?? themeRef.current;
      const map = getXtermThemeMap();
      const base = map[themeName] ?? map.tokyonight;
      const opts = useSettingsStore.getState().settings?.terminal_options ?? DEFAULT_TERMINAL_OPTIONS;
      const currentOpacity = useSettingsStore.getState().settings?.terminal_opacity ?? 1;
      const applied = toXtermOptions(opts, currentOpacity, base);
      Object.assign(term.options, applied);
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit(); } catch { /* ignore */ }
      }
    };
    reApply();
    window.addEventListener("wd-theme-changed", reApply);
    return () => window.removeEventListener("wd-theme-changed", reApply);
  }, [opacity, terminalOptions, terminalId, appTheme]);

  const fit = useCallback(() => {
    const container = containerRef.current;
    // Skip if the container is hidden (display:none on ancestor → offsetParent
    // is null and FitAddon measures 0 cols/rows → PTY gets a damaging resize).
    if (container && container.offsetParent === null) return;
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
