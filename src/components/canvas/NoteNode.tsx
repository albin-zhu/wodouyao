import { memo, useCallback, useRef, useState, useEffect } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useNodeDrag } from "../../hooks/useNodeDrag";
import type { NoteNode as NoteNodeType } from "../../types/note";

interface NoteNodeProps {
  note: NoteNodeType;
}

const HEADER_H = 24;

function NoteNodeImpl({ note }: NoteNodeProps) {
  const updateNote = useNoteStore((s) => s.updateNote);
  const removeNote = useNoteStore((s) => s.removeNote);
  const bringToFront = useNoteStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const [hovered, setHovered] = useState(false);
  const [text, setText] = useState(note.text);
  const flushRef = useRef<number | null>(null);

  // Sync local text down to store with debounce
  useEffect(() => {
    if (text === note.text) return;
    if (flushRef.current) window.clearTimeout(flushRef.current);
    flushRef.current = window.setTimeout(() => {
      updateNote(note.id, { text });
    }, 200);
    return () => {
      if (flushRef.current) window.clearTimeout(flushRef.current);
    };
  }, [text, note.id, note.text, updateNote]);

  const { handleDragStart, handleResizeStart } = useNodeDrag({
    position: note.position,
    size: note.size,
    minWidth: 180,
    minHeight: 100,
    onDrag: (p) => updateNote(note.id, { position: p }),
    onResize: (s) => updateNote(note.id, { size: s }),
    onBringToFront: () => bringToFront(note.id),
  });

  const handleWireAnchorDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== "wire") setMode("wire");
      setWireStart(note.id);
    },
    [note.id, mode, setMode, setWireStart]
  );

  return (
    <div
      className="note-node"
      data-node-id={note.id}
      onMouseDown={() => bringToFront(note.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: note.position.x,
        top: note.position.y,
        width: note.size.width,
        height: note.size.height,
        zIndex: note.zIndex,
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        background: `${note.color}1a`,
        border: `1px solid ${note.color}66`,
        boxShadow: "var(--shadow-panel)",
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
          background: `${note.color}33`,
          color: note.color,
          fontSize: 11,
          fontWeight: 600,
          cursor: "move",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <span>{"\u270E"} Note</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeNote(note.id);
          }}
          title="Delete"
          style={{
            background: "none",
            border: "none",
            color: note.color,
            cursor: "pointer",
            fontSize: 12,
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          {"\u2715"}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a note..."
        spellCheck={false}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--color-text)",
          padding: 8,
          fontSize: 12,
          fontFamily: "'Inter', system-ui, sans-serif",
          resize: "none",
          lineHeight: 1.5,
        }}
      />
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
          background: `linear-gradient(135deg, transparent 0 60%, ${note.color}99 60% 70%, transparent 70% 80%, ${note.color}cc 80%)`,
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
            background: note.color,
            border: "2px solid var(--color-surface)",
            cursor: "crosshair",
            zIndex: 10,
            opacity: mode === "wire" ? 1 : 0.6,
          }}
        />
      )}
    </div>
  );
}

export default memo(NoteNodeImpl);
