import { memo, useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useNodeDrag } from "../../hooks/useNodeDrag";
import {
  filePreviewText,
  filePreviewDir,
  type DirListing,
} from "../../services/tauriCommands";
import type { FileNode as FileNodeType } from "../../types/fileNode";

interface FileNodeProps {
  file: FileNodeType;
}

const HEADER_H = 26;

const KIND_ACCENT: Record<FileNodeType["kind"], string> = {
  image: "#bb9af7",
  text: "#7aa2f7",
  video: "#f7768e",
  directory: "#e0af68",
  other: "#9ece6a",
};

const KIND_GLYPH: Record<FileNodeType["kind"], string> = {
  image: "\u{1F5BC}",
  text: "\u{1F4C4}",
  video: "\u{1F3AC}",
  directory: "\u{1F4C1}",
  other: "\u{1F4E6}",
};

function FileNodeImpl({ file }: FileNodeProps) {
  const updateFileNode = useFileNodeStore((s) => s.updateFileNode);
  const removeFileNode = useFileNodeStore((s) => s.removeFileNode);
  const bringToFront = useFileNodeStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const [hovered, setHovered] = useState(false);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [dirListing, setDirListing] = useState<DirListing | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const accent = KIND_ACCENT[file.kind];

  const { handleDragStart, handleResizeStart } = useNodeDrag({
    position: file.position,
    size: file.size,
    minWidth: 200,
    minHeight: 140,
    onDrag: (p) => updateFileNode(file.id, { position: p }),
    onResize: (s) => updateFileNode(file.id, { size: s }),
    onBringToFront: () => bringToFront(file.id),
  });

  useEffect(() => {
    let cancelled = false;
    if (file.kind === "text") {
      filePreviewText(file.path, 4096)
        .then((t) => {
          if (!cancelled) setTextPreview(t);
        })
        .catch((e) => {
          if (!cancelled) setPreviewError(String(e));
        });
    } else if (file.kind === "directory") {
      filePreviewDir(file.path)
        .then((d) => {
          if (!cancelled) setDirListing(d);
        })
        .catch((e) => {
          if (!cancelled) setPreviewError(String(e));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [file.kind, file.path]);

  const handleWireAnchorDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== "wire") setMode("wire");
      setWireStart(file.id);
    },
    [file.id, mode, setMode, setWireStart]
  );

  return (
    <div
      className="file-node"
      data-node-id={file.id}
      onMouseDown={() => bringToFront(file.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: file.position.x,
        top: file.position.y,
        width: file.size.width,
        height: file.size.height,
        zIndex: file.zIndex,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        background: "#1f2335",
        border: `1px solid ${accent}66`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      <div
        onMouseDown={handleDragStart}
        style={{
          height: HEADER_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          background: `${accent}22`,
          color: accent,
          fontSize: 11,
          fontWeight: 600,
          cursor: "move",
          userSelect: "none",
          flexShrink: 0,
          gap: 6,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          <span style={{ fontSize: 13 }}>{KIND_GLYPH[file.kind]}</span>
          <span
            title={file.path}
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {file.name}
          </span>
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeFileNode(file.id);
          }}
          title="Remove"
          style={{
            background: "none",
            border: "none",
            color: accent,
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
        style={{
          flex: 1,
          overflow: "auto",
          padding: 6,
          fontSize: 11,
          color: "#a9b1d6",
          fontFamily:
            file.kind === "text"
              ? "'JetBrains Mono', Menlo, monospace"
              : "'Inter', system-ui, sans-serif",
        }}
      >
        {file.kind === "image" && (
          <img
            src={convertFileSrc(file.path)}
            alt={file.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
              margin: "0 auto",
            }}
          />
        )}
        {file.kind === "video" && (
          <video
            src={convertFileSrc(file.path)}
            controls
            style={{ width: "100%", maxHeight: "100%" }}
          />
        )}
        {file.kind === "text" && (
          previewError ? (
            <span style={{ color: "#f7768e" }}>{previewError}</span>
          ) : textPreview === null ? (
            <span style={{ color: "#565f89" }}>Loading...</span>
          ) : (
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {textPreview}
            </pre>
          )
        )}
        {file.kind === "directory" && (
          previewError ? (
            <span style={{ color: "#f7768e" }}>{previewError}</span>
          ) : dirListing === null ? (
            <span style={{ color: "#565f89" }}>Loading...</span>
          ) : (
            <div>
              {dirListing.entries.map((e) => (
                <div key={e.name} style={{ display: "flex", gap: 6 }}>
                  <span style={{ color: e.is_dir ? "#e0af68" : "#565f89" }}>
                    {e.is_dir ? "\u{1F4C1}" : "\u{1F4C4}"}
                  </span>
                  <span style={{ color: e.is_dir ? "#c0caf5" : "#a9b1d6" }}>{e.name}</span>
                </div>
              ))}
              {dirListing.truncated && (
                <div style={{ color: "#565f89", marginTop: 4 }}>... (more)</div>
              )}
            </div>
          )
        )}
        {file.kind === "other" && (
          <div style={{ color: "#565f89", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all" }}>
            {file.path}
          </div>
        )}
      </div>

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
          background: `linear-gradient(135deg, transparent 0 60%, ${accent}99 60% 70%, transparent 70% 80%, ${accent}cc 80%)`,
          borderBottomRightRadius: 8,
        }}
      />

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
            background: accent,
            border: "2px solid #1f2335",
            cursor: "crosshair",
            zIndex: 10,
            opacity: mode === "wire" ? 1 : 0.6,
          }}
        />
      )}
    </div>
  );
}

export default memo(FileNodeImpl);
