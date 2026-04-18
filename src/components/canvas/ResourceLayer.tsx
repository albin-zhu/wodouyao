import { useMemo } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useCanvasStore } from "../../store/canvasStore";
import NoteNode from "./NoteNode";
import FileNode from "./FileNode";

export default function ResourceLayer() {
  const notesMap = useNoteStore((s) => s.notes);
  const filesMap = useFileNodeStore((s) => s.fileNodes);
  const notes = useMemo(() => Array.from(notesMap.values()), [notesMap]);
  const files = useMemo(() => Array.from(filesMap.values()), [filesMap]);
  const { panX, panY, zoom } = useCanvasStore();

  return (
    <div
      id="resource-layer"
      style={
        {
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          pointerEvents: "none",
          "--zoom": zoom,
        } as React.CSSProperties
      }
    >
      {notes.map((n) => (
        <NoteNode key={n.id} note={n} />
      ))}
      {files.map((f) => (
        <FileNode key={f.id} file={f} />
      ))}
    </div>
  );
}
