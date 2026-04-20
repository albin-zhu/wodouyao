import { memo, useCallback, useState } from "react";
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

  const { handleDragStart, handleResizeStart } = useNodeDrag({
    position: node.position,
    size: node.size,
    minWidth: 220,
    minHeight: 140,
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

  const favicon = (() => {
    try {
      const u = new URL(node.url);
      return `${u.protocol}//${u.host}/favicon.ico`;
    } catch {
      return null;
    }
  })();

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
        background: `${ACCENT}14`,
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
          background: `${ACCENT}33`,
          color: ACCENT,
          fontSize: 11,
          fontWeight: 600,
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
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
            removeWebNode(node.id);
          }}
          title="Delete"
          style={{
            background: "none",
            border: "none",
            color: ACCENT,
            cursor: "pointer",
            fontSize: 12,
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          {"\u2715"}
        </button>
      </div>
      <div
        className="selectable"
        style={{
          flex: 1,
          padding: "8px 10px",
          color: "#c0caf5",
          fontSize: 12,
          lineHeight: 1.45,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "auto",
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            openInBrowser();
          }}
          style={{
            color: ACCENT,
            textDecoration: "none",
            wordBreak: "break-all",
            fontSize: 11,
          }}
          title={node.url}
        >
          {node.url}
        </a>
        {node.description && (
          <div
            style={{
              color: "#a9b1d6",
              fontSize: 11,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {node.description}
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
        }}
      />
    </div>
  );
}

export default memo(WebNodeImpl);
