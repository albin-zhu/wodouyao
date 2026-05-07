import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { ImageAddon } from "@xterm/addon-image";
import { invoke } from "@tauri-apps/api/core";
import { writeTerminal, resizeTerminal, destroyTerminal } from "../services/tauriCommands";
import { listenTerminalOutput, listenTerminalExit } from "../services/tauriEvents";
import { registerXterm, unregisterXterm } from "../services/terminalRegistry";
import { useTerminalStore } from "../store/terminalStore";
import { useSettingsStore } from "../store/settingsStore";
import { useCanvasStore } from "../store/canvasStore";
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
    lineHeight: Math.max(1, opts.line_height),
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

export function useTerminalIO(
  terminalId: string,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onTerminalReady?: (term: Terminal) => (() => void) | void,
) {
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

    // Renderer: Canvas is the default because it is robust under the per-node
    // CSS transform (zoom). The WebGL renderer is faster but its glyph atlas
    // gets corrupted when the effective DPR shifts (zoom, monitor swap) and
    // on WKWebView in particular — symptoms are sliced/jumbled characters.
    // Users who want WebGL anyway can opt in via settings.terminal_gpu_renderer.
    const loadCanvasFallback = () => {
      try {
        term.loadAddon(new CanvasAddon());
      } catch (e) {
        console.error("[xterm] Canvas renderer failed:", e);
      }
    };
    const useWebgl = settings?.terminal_gpu_renderer ?? false;
    if (useWebgl) {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          console.warn("[xterm] WebGL context lost — falling back to Canvas");
          webgl.dispose();
          loadCanvasFallback();
        });
        term.loadAddon(webgl);
      } catch (e) {
        console.warn("[xterm] WebGL unavailable, using Canvas renderer:", e);
        loadCanvasFallback();
      }
    } else {
      loadCanvasFallback();
    }

    // Re-apply theme after open() so the renderer picks it up even if
    // the constructor options were partially applied.
    try { term.options.theme = baseTheme; } catch { /* ignore */ }

    // Inline image support: iTerm2 protocol (ESC]1337;File=...) and Sixel.
    // This lets CLI tools like `imgcat`, `chafa`, or `wezterm imgcat` render
    // images directly inside the terminal buffer. Must be loaded AFTER the
    // renderer (CanvasAddon/WebGL) is in place.
    try {
      term.loadAddon(new ImageAddon({ enableSizeReports: true }));
    } catch (e) {
      console.warn("[xterm] ImageAddon failed to load:", e);
    }

    // OSC 0/2 title sequences — update the canvas node's display name.
    term.onTitleChange((title) => {
      if (title) updateTerminal(terminalId, { name: title });
    });

    term.focus();

    // CJK IME path on macOS WKWebView. xterm's built-in handling drops or
    // duplicates committed CJK characters because the order of events is
    // (input → keydown) instead of (keydown → input), and xterm's
    // `_inputEvent` filter `(!ev.composed || !_keyDownSeen)` plus
    // `_keyPressHandled` end up gating the wrong half of consecutive
    // commits. Symptoms: typing 全角 ？ once produces no output; user
    // presses again and one ？ finally appears.
    //
    // We sidestep xterm entirely for IME commits: a document-level capture
    // listener on `input` runs BEFORE xterm's textarea-level capture
    // listener (DOM capture phase walks parent → child), writes the
    // committed text straight to the PTY, clears the helper textarea, and
    // calls stopImmediatePropagation so xterm's `_inputEvent` never runs.
    // ASCII keys never generate an `input` event (xterm's `_keyDown`
    // cancels them with preventDefault), so this only sees IME commits,
    // emoji-picker insertions, and mobile predictive text — all of which
    // we want to forward verbatim.
    const helperTextarea = term.element?.querySelector<HTMLTextAreaElement>(
      "textarea.xterm-helper-textarea",
    );
    const handleIMEInput = (ev: Event) => {
      if (ev.target !== helperTextarea) return;
      const ie = ev as InputEvent;
      if (ie.inputType !== "insertText" || !ie.data) return;
      const bytes = Array.from(new TextEncoder().encode(ie.data));
      writeTerminal(terminalId, bytes).catch(console.error);
      if (helperTextarea) helperTextarea.value = "";
      ev.stopImmediatePropagation();
    };
    document.addEventListener("input", handleIMEInput, true);

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

    // Let callers (e.g. block tracking) register on the xterm instance at
    // exactly the right moment — after open() and renderer load, before
    // any PTY output arrives.
    let readyCleanup: (() => void) | void;
    if (onTerminalReady) {
      readyCleanup = onTerminalReady(term);
    }

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
      document.removeEventListener("input", handleIMEInput, true);
      readyCleanup?.();
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
      try { Object.assign(term.options, applied); } catch (e) { console.error("[xterm] options update failed:", e); }
      // Set theme explicitly — Object.assign iterates in insertion order and
      // may bail before reaching `theme` if an earlier property throws.
      try { term.options.theme = applied.theme; } catch { /* ignore */ }
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit(); } catch { /* ignore */ }
      }
    };
    reApply();
    window.addEventListener("wd-theme-changed", reApply);
    return () => window.removeEventListener("wd-theme-changed", reApply);
  }, [opacity, terminalOptions, terminalId, appTheme]);

  // Glyph atlas rebuild — only relevant under the WebGL renderer. The
  // CanvasAddon redraws from scratch every frame so there is no atlas to
  // go stale. Guarded by the setting to avoid needless work for the default
  // (Canvas) path.
  const gpuRenderer = useSettingsStore((s) => s.settings?.terminal_gpu_renderer ?? false);
  const canvasZoom = useCanvasStore((s) => s.zoom);
  useEffect(() => {
    if (!gpuRenderer) return;
    const term = termRef.current;
    if (!term) return;
    const timer = setTimeout(() => {
      try {
        (term as unknown as { clearTextureAtlas?: () => void }).clearTextureAtlas?.();
      } catch (e) {
        console.warn("[xterm] clearTextureAtlas failed:", e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [canvasZoom, gpuRenderer]);

  // Also rebuild on devicePixelRatio change (dragging between Retina and
  // external monitor). matchMedia fires reliably on DPR crossings.
  useEffect(() => {
    if (!gpuRenderer) return;
    const term = termRef.current;
    if (!term) return;
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      try {
        (term as unknown as { clearTextureAtlas?: () => void }).clearTextureAtlas?.();
      } catch { /* ignore */ }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [terminalId, gpuRenderer]);

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
