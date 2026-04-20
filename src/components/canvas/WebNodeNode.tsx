import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useWebNodeStore, type WebNode } from "../../store/webNodeStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useNodeDrag } from "../../hooks/useNodeDrag";
import { open as openUrl } from "@tauri-apps/plugin-shell";

interface Props {
  node: WebNode;
}

const HEADER_H = 28;
const ACCENT = "#7dcfff";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function WebNodeImpl({ node }: Props) {
  const updateWebNode = useWebNodeStore((s) => s.updateWebNode);
  const removeWebNode = useWebNodeStore((s) => s.removeWebNode);
  const bringToFront = useWebNodeStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const [hovered, setHovered] = useState(false);
  const [interact, setInteract] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { handleDragStart, handleResizeStart } = useNodeDrag({
    position: node.position,
    size: node.size,
    minWidth: 260,
    minHeight: 200,
    onDrag: (p) => updateWebNode(node.id, { position: p }),
    onResize: (s) => updateWebNode(node.id, { size: s }),
    onBringToFront: () => bringToFront(node.id),
  });

  const handleWireAnchorDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== "wire") setMode("wire");
      setWireStart(node.id);
    },
    [node.id, mode, setMode, setWireStart]
  );

  const openInBrowser = useCallback(() => {
    openUrl(node.url).catch((e) => console.error("open url:", e));
  }, [node.url]);

  const reload = useCallback(() => {
    setLoadFailed(false);
    setReloadNonce((n) => n + 1);
  }, []);

  const favicon = (() => {
    try {
      const u = new URL(node.url);
      return `${u.protocol}//${u.host}/favicon.ico`;
    } catch {
      return null;
    }
  })();

  // Many sites block iframing via X-Frame-Options / CSP. We can't read the
  // iframe's document (cross-origin), so we set a watchdog: if `load` never
  // fires within 6s, assume the site refused to render and show a fallback.
  const watchdogRef = useRef<number | null>(null);
  const stopWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);
  useEffect(() => {
    if (loadFailed) return;
    if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
    watchdogRef.current = window.setTimeout(() => {
      setLoadFailed(true);
    }, 6000);
    return stopWatchdog;
    // Re-arm whenever URL or reloadNonce changes.
  }, [node.url, reloadNonce, loadFailed, stopWatchdog]);

  return (
    <div
      className="web-node"
      data-node-id={node.id}
      onMouseDown={() => bringToFront(node.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: node.position.x,
        top: node.position.y,
        width: node.size.width,
        height: node.size.height,
        zIndex: node.zIndex,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        background: "#1a1b26",
        border: `1px solid ${ACCENT}66`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      <div
        onMouseDown={handleDragStart}
        onDoubleClick={openInBrowser}
        style={{
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          gap: 6,
          background: `${ACCENT}22`,
          color: ACCENT,
          fontSize: 11,
          fontWeight: 600,
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
          borderBottom: `1px solid ${ACCENT}33`,
        }}
      >
        {favicon ? (
          <img
            src={favicon}
            alt=""
            width={14}
            height={14}
            style={{ borderRadius: 2, flexShrink: 0 }}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span style={{ fontSize: 12 }}>{"\u{1F310}"}</span>
        )}
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={node.url}
        >
          {node.title ?? hostOf(node.url)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setInteract((v) => !v);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title={interact ? "Lock interactions (restore drag)" : "Enable click / scroll inside the page"}
          style={{
            background: interact ? ACCENT : "transparent",
            color: interact ? "#1a1b26" : ACCENT,
            border: `1px solid ${ACCENT}88`,
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 10,
            padding: "1px 6px",
            lineHeight: 1.2,
          }}
        >
          {interact ? "locked" : "interact"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            reload();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Reload"
          style={{
            background: "none",
            border: "none",
            color: ACCENT,
            cursor: "pointer",
            fontSize: 12,
            padding: "0 2px",
            lineHeight: 1,
          }}
        >
          {"\u21BB"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            openInBrowser();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Open in system browser"
          style={{
            background: "none",
            border: "none",
            color: ACCENT,
            cursor: "pointer",
            fontSize: 12,
            padding: "0 2px",
            lineHeight: 1,
          }}
        >
          {"\u2197"}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeWebNode(node.id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Delete"
          style={{
            background: "none",
            border: "none",
            color: ACCENT,
            cursor: "pointer",
            fontSize: 12,
            padding: "0 2px",
            lineHeight: 1,
          }}
        >
          {"\u2715"}
        </button>
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          background: "#0f1016",
          overflow: "hidden",
        }}
      >
        {!loadFailed && (
          <iframe
            key={reloadNonce}
            ref={iframeRef}
            src={node.url}
            title={node.title ?? node.url}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer"
            onLoad={() => {
              stopWatchdog();
              setLoadFailed(false);
            }}
            onError={() => setLoadFailed(true)}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              // When `interact` is false, the iframe doesn't steal pointer
              // events, so dragging / resizing the card still works. Click
              // the `interact` toggle in the header to scroll / click inside.
              pointerEvents: interact ? "auto" : "none",
              background: "#fff",
            }}
          />
        )}
        {loadFailed && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              textAlign: "center",
              color: "#c0caf5",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: 24 }}>{"\u26A0\uFE0F"}</div>
            <div style={{ color: "#a9b1d6" }}>
              This site refused to load inside a frame.
            </div>
            {node.description && (
              <div
                className="selectable"
                style={{ color: "#565f89", fontSize: 11, maxWidth: 260 }}
              >
                {node.description}
              </div>
            )}
            <button
              onClick={openInBrowser}
              style={{
                background: ACCENT,
                color: "#1a1b26",
                border: "none",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Open in browser
            </button>
          </div>
        )}
        {!interact && !loadFailed && (
          // Subtle hint overlay so the user knows why clicks aren't reaching
          // the page; disappears the moment they hover somewhere else.
          <div
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              background: "rgba(26,27,38,0.75)",
              color: "#a9b1d6",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 10,
              border: `1px solid ${ACCENT}55`,
              pointerEvents: "none",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.15s",
            }}
          >
            click "interact" to scroll / click
          </div>
        )}
      </div>
      {(hovered || mode === "wire") && (
        <div
          onMouseDown={handleWireAnchorDown}
          style={{
            position: "absolute",
            right: -6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: ACCENT,
            border: "2px solid #1f2335",
            cursor: "crosshair",
            zIndex: 10,
            opacity: mode === "wire" ? 1 : 0.6,
          }}
        />
      )}
      <div
        onMouseDown={handleResizeStart}
        title="Drag to resize"
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 14,
          height: 14,
          cursor: "se-resize",
          background: `linear-gradient(135deg, transparent 0 60%, ${ACCENT}99 60% 70%, transparent 70% 80%, ${ACCENT}cc 80%)`,
          borderBottomRightRadius: 8,
          zIndex: 11,
        }}
      />
    </div>
  );
}

export default memo(WebNodeImpl);
