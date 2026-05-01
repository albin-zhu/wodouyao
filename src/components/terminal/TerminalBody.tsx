import { useRef, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTerminalIO } from "../../hooks/useTerminalIO";
import { useTerminalBlocks } from "../../hooks/useTerminalBlocks";
import type { TerminalBlock } from "../../hooks/useTerminalBlocks";
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
import type { Terminal } from "@xterm/xterm";
import { writeTerminal, saveClipboardImage } from "../../services/tauriCommands";
import PasteConfirmDialog from "./PasteConfirmDialog";
import "@xterm/xterm/css/xterm.css";

// ---------------------------------------------------------------------------
// BlockOverlay — renders block separators and collapse controls on top of xterm
// ---------------------------------------------------------------------------
interface BlockOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  termRef: React.RefObject<Terminal | null>;
  blocksRef: React.MutableRefObject<TerminalBlock[]>;
  blockVersion: number;
  bg: string;
  onToggleCollapse: (id: string) => void;
}

function BlockOverlay({
  containerRef,
  termRef,
  blocksRef,
  blockVersion: _blockVersion,
  bg,
  onToggleCollapse,
}: BlockOverlayProps) {
  const container = containerRef.current;
  const term = termRef.current;
  if (!container || !term) return null;

  const w = container.clientWidth - 8;
  const h = container.clientHeight - 8;
  if (w <= 0 || h <= 0) return null;

  const cellH = h / term.rows;
  const blocks = blocksRef.current;
  const currentRow = term.buffer.active.baseY + term.buffer.active.cursorY;

  return (
    <div
      style={{
        position: "absolute",
        inset: 4,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      {blocks.map((block) => {
        const y = (block.row - term.buffer.active.baseY) * cellH;
        if (y < -cellH || y > h + cellH) return null; // off-screen

        const endRow = block.endRow ?? currentRow;
        const outputStartY = (block.execRow - term.buffer.active.baseY) * cellH;
        const outputEndY = (endRow - term.buffer.active.baseY) * cellH;
        const outputHeight = Math.max(0, outputEndY - outputStartY);

        return (
          <div key={block.id}>
            {/* Separator line at prompt row */}
            <div
              style={{
                position: "absolute",
                top: Math.max(0, y),
                left: 0,
                right: 0,
                height: 1,
                background: "rgba(255,255,255,0.08)",
                pointerEvents: "none",
              }}
            />
            {/* Collapse toggle button — pointer-events: auto */}
            <div
              style={{
                position: "absolute",
                top: Math.max(0, y) - 1,
                right: 0,
                width: 20,
                height: 14,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                pointerEvents: "auto",
                background: "rgba(26,27,38,0.85)",
                borderRadius: "2px 0 0 2px",
                fontSize: 10,
                color: "rgba(192,202,245,0.5)",
                userSelect: "none",
                zIndex: 11,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(block.id);
              }}
              title={block.collapsed ? "Expand block" : "Collapse block"}
            >
              {block.collapsed ? "▶" : "▼"}
            </div>
            {/* Collapse overlay — covers output rows */}
            {block.collapsed && outputHeight > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: Math.max(0, outputStartY),
                  left: 0,
                  right: 0,
                  height: outputHeight,
                  background: bg,
                  pointerEvents: "auto",
                  zIndex: 10,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                  fontSize: 11,
                  color: "rgba(192,202,245,0.35)",
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse(block.id);
                }}
              >
                {`${Math.max(0, endRow - block.execRow)} lines hidden`}
                {block.exitCode !== undefined && block.exitCode !== 0 && (
                  <span style={{ marginLeft: 8, color: "#f7768e" }}>
                    exit {block.exitCode}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TerminalBodyProps {
  terminalId: string;
}

export default function TerminalBody({ terminalId }: TerminalBodyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [blockVersion, setBlockVersion] = useState(0);
  const { blocksRef, registerHandlers, toggleCollapse } = useTerminalBlocks();

  // Pass registerHandlers as onTerminalReady so OSC 133 is registered on the
  // xterm instance at exactly the right moment — after open() + renderer load,
  // before any PTY output arrives. This avoids the race where useEffect runs
  // while termRef.current is still null.
  const onTerminalReady = useCallback(
    (term: Terminal) => {
      const onUpdate = () => setBlockVersion((v) => v + 1);
      return registerHandlers(term, onUpdate);
    },
    [registerHandlers],
  );

  const { fit, termRef } = useTerminalIO(terminalId, containerRef, onTerminalReady);
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
          // Recompute block overlay positions after resize.
          setBlockVersion((v) => v + 1);
        });
      }, 60);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [fit, termRef, setBlockVersion]);

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
    // Strict: no whitespace allowed (catches most paths)
    const PATH_BREAK = /[\s"'`\[\](){}|<>]/;
    // Lenient: spaces allowed — for macOS paths like "/Users/foo/My Image.png"
    const PATH_BREAK_LENIENT = /["'`\[\](){}|<>]/;

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

        // Use rect dimensions (screen-space) for cell size so calculations
        // stay correct when the canvas is zoomed via CSS transform on a
        // parent element (clientWidth/Height ignore transforms).
        const scaleX = container.clientWidth  > 0 ? rect.width  / container.clientWidth  : 1;
        const scaleY = container.clientHeight > 0 ? rect.height / container.clientHeight : 1;
        const cellW = (container.clientWidth  - 8) / term.cols * scaleX;
        const cellH = (container.clientHeight - 8) / term.rows * scaleY;
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
        let word = text.slice(s, end).trim();

        // Fallback: if strict extraction missed the image extension (path has
        // spaces), try a lenient scan — only accepted for absolute paths.
        if (!IMAGE_EXT.test(word)) {
          let ls = col, le = col;
          while (ls > 0 && !PATH_BREAK_LENIENT.test(text[ls - 1])) ls--;
          while (le < text.length && !PATH_BREAK_LENIENT.test(text[le])) le++;
          const lenientWord = text.slice(ls, le).trim();
          if (lenientWord && IMAGE_EXT.test(lenientWord) && /^[~/]/.test(lenientWord)) {
            word = lenientWord;
          }
        }

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
      {/* Block boundary overlay — recomputes on blockVersion or resize */}
      <BlockOverlay
        containerRef={containerRef}
        termRef={termRef}
        blocksRef={blocksRef}
        blockVersion={blockVersion}
        bg={bg}
        onToggleCollapse={(id) =>
          toggleCollapse(id, () => setBlockVersion((v) => v + 1))
        }
      />
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
