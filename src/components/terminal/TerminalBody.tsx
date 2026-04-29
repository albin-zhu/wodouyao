import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTerminalIO } from "../../hooks/useTerminalIO";
import { useTerminalStore } from "../../store/terminalStore";
import { useSettingsStore } from "../../store/settingsStore";
import { getXtermThemeMap } from "../../utils/terminalThemes";

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}
import { convertFileSrc } from "@tauri-apps/api/core";
import { writeTerminal, saveClipboardImage } from "../../services/tauriCommands";
import PasteConfirmDialog from "./PasteConfirmDialog";
import "@xterm/xterm/css/xterm.css";

interface TerminalBodyProps {
  terminalId: string;
}

export default function TerminalBody({ terminalId }: TerminalBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { fit, termRef } = useTerminalIO(terminalId, containerRef);
  const themeName = useTerminalStore((s) => s.terminals.get(terminalId)?.theme ?? "tokyonight");
  const opacity = useSettingsStore((s) => s.settings?.terminal_opacity ?? 1);
  const rawBg = getXtermThemeMap()[themeName]?.background ?? "var(--color-bg-alt)";
  const bg = opacity < 1 ? hexToRgba(rawBg, opacity) : rawBg;
  const [pendingPaste, setPendingPaste] = useState<string | null>(null);

  interface ImageTooltip { x: number; y: number; src: string; filename: string }
  const [imageTooltip, setImageTooltip] = useState<ImageTooltip | null>(null);

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
        // Skip when hidden (display:none on any ancestor makes offsetParent
        // null and contentRect collapse to 0). Calling fit() in that state
        // would send a ~0-column resize to the backend PTY, breaking TUI
        // program layouts in the hidden workspace.
        if (el.offsetParent === null) return;
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

  // Intercept paste — xterm captures paste on its hidden textarea,
  // so we listen there with capture-phase to preempt xterm's handler.
  // Handles two cases:
  //   1. Image paste: detect file path via text/uri-list, else queue for save.
  //   2. Multi-line text paste: show confirm dialog.
  useEffect(() => {
    const term = termRef.current;
    const target = term?.textarea;
    if (!target) return;

    const onPaste = (e: ClipboardEvent) => {
      const cd = e.clipboardData;
      if (!cd) return;

      // ── Image paste ────────────────────────────────────────────────────────
      const imageItem = Array.from(cd.items).find((item) =>
        item.type.startsWith("image/")
      );
      if (imageItem) {
        e.preventDefault();
        e.stopPropagation();
        void (async () => {
          const blob = imageItem.getAsFile();
          if (!blob) return;
          const ext = imageItem.type.split("/")[1] ?? "png";

          // If clipboard also carries a file:// URI (copied from file manager)
          // use that path directly without saving.
          const uriList = cd.getData("text/uri-list");
          if (uriList) {
            const filePath = uriList
              .split("\n")
              .filter((l) => !l.startsWith("#") && l.trim().startsWith("file://"))
              .map((l) => {
                let p = decodeURIComponent(l.trim().replace(/^file:\/\//, ""));
                // Windows: /C:/path → C:/path
                if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
                return p;
              })[0];
            if (filePath) {
              writeTerminal(terminalId, Array.from(new TextEncoder().encode(filePath))).catch(console.error);
              return;
            }
          }

          // Raw binary (screenshot, web copy) — save to Downloads, insert path.
          const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
          const path = await saveClipboardImage(bytes, ext);
          writeTerminal(terminalId, Array.from(new TextEncoder().encode(path))).catch(console.error);
        })();
        return;
      }

      // ── Multi-line text paste ───────────────────────────────────────────────
      const text = cd.getData("text") ?? "";
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

  // Image path hover tooltip — sniff buffer text under cursor for image extensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i;
    // Characters that cannot appear in a file path
    const PATH_BREAK = /[\s"'`\[\](){}|<>]/;

    let controller: AbortController | null = null;

    const onMove = (e: MouseEvent) => {
      // Cancel any in-flight delayed check from previous position.
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;

      const timerId = setTimeout(() => {
        if (signal.aborted) return;

        const term = termRef.current;
        if (!term) return;

        const rect = container.getBoundingClientRect();
        const relX = e.clientX - rect.left - 4;
        const relY = e.clientY - rect.top  - 4;
        if (relX < 0 || relY < 0) { setImageTooltip(null); return; }

        const cellW = (container.clientWidth  - 8) / term.cols;
        const cellH = (container.clientHeight - 8) / term.rows;
        const col = Math.floor(relX / cellW);
        const row = Math.floor(relY / cellH);
        if (col < 0 || row < 0 || col >= term.cols || row >= term.rows) {
          setImageTooltip(null); return;
        }

        const bufRow = term.buffer.active.baseY + row;
        const line = term.buffer.active.getLine(bufRow);
        if (!line) { setImageTooltip(null); return; }

        const text = line.translateToString(true);
        let s = col, end = col;
        while (s > 0 && !PATH_BREAK.test(text[s - 1])) s--;
        while (end < text.length && !PATH_BREAK.test(text[end])) end++;
        const word = text.slice(s, end).trim();

        if (word && IMAGE_EXT.test(word)) {
          try {
            const src = convertFileSrc(word);
            const filename = word.replace(/\\/g, "/").split("/").pop() ?? word;
            if (!signal.aborted) setImageTooltip({ x: e.clientX, y: e.clientY, src, filename });
          } catch {
            setImageTooltip(null);
          }
        } else {
          setImageTooltip(null);
        }
      }, 280);

      // If aborted before timer fires, cancel it.
      signal.addEventListener("abort", () => clearTimeout(timerId));
    };

    const onLeave = () => {
      controller?.abort();
      controller = null;
      setImageTooltip(null);
    };

    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
      controller?.abort();
    };
  }, [termRef, containerRef]);

  return (
    <>
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
    {imageTooltip != null && createPortal(
      <div
        style={{
          position: "fixed",
          left: imageTooltip.x + 18,
          top: imageTooltip.y - 18,
          zIndex: 9999,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: 8,
          boxShadow: "var(--shadow-dropdown)",
          pointerEvents: "none",
          maxWidth: 220,
        }}
      >
        <img
          src={imageTooltip.src}
          alt={imageTooltip.filename}
          onError={() => setImageTooltip(null)}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 160,
            borderRadius: 4,
            objectFit: "contain",
          }}
        />
        <div style={{
          marginTop: 5,
          fontSize: 10,
          color: "var(--color-text-muted)",
          wordBreak: "break-all",
          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        }}>
          {imageTooltip.filename}
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
