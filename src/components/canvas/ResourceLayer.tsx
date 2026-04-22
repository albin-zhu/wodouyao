import { useMemo } from "react";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import NoteNode from "./NoteNode";
import FileNode from "./FileNode";
import TaskBoardNode from "./TaskBoardNode";

export default function ResourceLayer() {
  const notesMap = useNoteStore((s) => s.notes);
  const filesMap = useFileNodeStore((s) => s.fileNodes);
  const boardsMap = useTaskBoardStore((s) => s.boards);
  const wsId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);
  const inWs = <T extends { workspaceId?: string | null }>(item: T) =>
    wsId === null || (item.workspaceId ?? wsId) === wsId;
  const notes = useMemo(
    () => Array.from(notesMap.values()).filter(inWs),
    [notesMap, wsId]
  );
  const files = useMemo(
    () => Array.from(filesMap.values()).filter(inWs),
    [filesMap, wsId]
  );
  const boards = useMemo(
    () => Array.from(boardsMap.values()).filter(inWs),
    [boardsMap, wsId]
  );
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
      {boards.map((b) => (
        <TaskBoardNode key={b.id} board={b} />
      ))}
    </div>
  );
}
