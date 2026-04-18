import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useTaskBoardStore, type TaskBoard } from "../../store/taskBoardStore";
import { useTaskStore } from "../../store/taskStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useNodeDrag } from "../../hooks/useNodeDrag";
import type { Task, TaskStatus } from "../../types/task";

interface Props {
  board: TaskBoard;
}

const STATUS_GLYPH: Record<TaskStatus, string> = {
  pending: "\u25B7",
  in_progress: "\u25D0",
  completed: "\u2713",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  pending: "#565f89",
  in_progress: "#7aa2f7",
  completed: "#9ece6a",
};

const STATUS_ORDER: Record<TaskStatus, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

const NEXT: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
};

function TaskRow({ task }: { task: Task }) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const terminals = useTerminalStore((s) => s.terminals);
  const [hovered, setHovered] = useState(false);
  const owner = task.owner_term_id ? terminals.get(task.owner_term_id) : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-wd-task", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 4,
        cursor: "grab",
        background: hovered ? "#292e42" : "transparent",
        transition: "background 0.1s",
        position: "relative",
      }}
    >
      {owner && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 2,
            bottom: 2,
            width: 2,
            borderRadius: 1,
            background: owner.color,
          }}
        />
      )}
      <button
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          updateTask(task.id, { status: NEXT[task.status] });
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          border: "none",
          background: "transparent",
          color: STATUS_COLOR[task.status],
          cursor: "pointer",
          fontSize: 11,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        {STATUS_GLYPH[task.status]}
      </button>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: task.status === "completed" ? "#565f89" : "#c0caf5",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: task.status === "completed" ? "line-through" : "none",
        }}
      >
        {task.subject}
      </span>
      {owner && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: owner.color,
            flexShrink: 0,
          }}
          title={owner.name}
        />
      )}
      {hovered && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            removeTask(task.id);
          }}
          style={{
            background: "none",
            border: "none",
            color: "#f7768e",
            cursor: "pointer",
            fontSize: 10,
            padding: "0 2px",
            lineHeight: 1,
          }}
        >
          {"\u2715"}
        </button>
      )}
    </div>
  );
}

function TaskBoardNodeImpl({ board }: Props) {
  const updateBoard = useTaskBoardStore((s) => s.updateBoard);
  const removeBoard = useTaskBoardStore((s) => s.removeBoard);
  const bringToFront = useTaskBoardStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const tasksMap = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const [hovered, setHovered] = useState(false);
  const [quickAdd, setQuickAdd] = useState("");
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(board.label);
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");
  const inputRef = useRef<HTMLInputElement>(null);

  const tasks = useMemo(() => {
    const all = Array.from(tasksMap.values());
    const filtered = filter === "active"
      ? all.filter((t) => t.status !== "completed")
      : filter === "done"
        ? all.filter((t) => t.status === "completed")
        : all;
    return filtered.sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return so !== 0 ? so : a.created_at - b.created_at;
    });
  }, [tasksMap, filter]);

  const activeCount = useMemo(
    () => Array.from(tasksMap.values()).filter((t) => t.status !== "completed").length,
    [tasksMap]
  );
  const totalCount = tasksMap.size;

  const { handleDragStart, handleResizeStart } = useNodeDrag({
    position: board.position,
    size: board.size,
    minWidth: 240,
    minHeight: 200,
    onDrag: (p) => updateBoard(board.id, { position: p }),
    onResize: (s) => updateBoard(board.id, { size: s }),
    onBringToFront: () => bringToFront(board.id),
  });

  const handleWireAnchorDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (mode !== "wire") setMode("wire");
      setWireStart(board.id);
    },
    [board.id, mode, setMode, setWireStart]
  );

  const handleQuickAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && quickAdd.trim()) {
      e.preventDefault();
      createTask({ subject: quickAdd.trim() });
      setQuickAdd("");
    }
    e.stopPropagation();
  };

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <div
      className="task-board-node"
      data-node-id={board.id}
      onMouseDown={() => bringToFront(board.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        left: board.position.x,
        top: board.position.y,
        width: board.size.width,
        height: board.size.height,
        zIndex: board.zIndex,
        display: "flex",
        flexDirection: "column",
        borderRadius: 10,
        background: "#1a1b26",
        border: "1px solid #7aa2f744",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 36,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          background: "#1f2335",
          borderBottom: "1px solid #292e42",
          cursor: "grab",
          flexShrink: 0,
          gap: 6,
          userSelect: "none",
        }}
      >
        <span style={{ color: "#7aa2f7", fontSize: 13 }}>{"\u2713"}</span>
        {editing ? (
          <input
            ref={inputRef}
            value={labelDraft}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={() => {
              updateBoard(board.id, { label: labelDraft || "Tasks" });
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                updateBoard(board.id, { label: labelDraft || "Tasks" });
                setEditing(false);
              }
              e.stopPropagation();
            }}
            style={{
              flex: 1,
              background: "#13141b",
              border: "1px solid #7aa2f7",
              borderRadius: 4,
              color: "#c0caf5",
              fontSize: 12,
              fontWeight: 600,
              padding: "2px 6px",
              outline: "none",
            }}
          />
        ) : (
          <span
            onDoubleClick={() => {
              setLabelDraft(board.label);
              setEditing(true);
            }}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "#c0caf5",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {board.label}
          </span>
        )}
        <span style={{ color: "#565f89", fontSize: 11, flexShrink: 0 }}>
          {activeCount}/{totalCount}
        </span>
        {/* Wire anchor */}
        {(hovered || mode === "wire") && (
          <span
            onMouseDown={handleWireAnchorDown}
            title="Connect wire"
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "#7aa2f7",
              border: "2px solid #1f2335",
              cursor: "crosshair",
              flexShrink: 0,
            }}
          />
        )}
        {hovered && !editing && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => removeBoard(board.id)}
            title="Remove board"
            style={{
              background: "none",
              border: "none",
              color: "#565f89",
              cursor: "pointer",
              fontSize: 12,
              padding: "0 2px",
            }}
          >
            {"\u2715"}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "4px 8px",
          borderBottom: "1px solid #292e42",
          flexShrink: 0,
        }}
      >
        {(["all", "active", "done"] as const).map((f) => (
          <button
            key={f}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#7aa2f7" : "transparent",
              color: filter === f ? "#1a1b26" : "#565f89",
              border: `1px solid ${filter === f ? "#7aa2f7" : "#292e42"}`,
              borderRadius: 3,
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: filter === f ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div
        className="task-board-list"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 4px",
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {tasks.length === 0 ? (
          <div style={{ color: "#565f89", fontSize: 11, padding: "8px", textAlign: "center" }}>
            No tasks
          </div>
        ) : (
          tasks.map((t) => <TaskRow key={t.id} task={t} />)
        )}
      </div>

      {/* Quick add input */}
      <div
        style={{
          padding: "6px 8px",
          borderTop: "1px solid #292e42",
          flexShrink: 0,
        }}
      >
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={handleQuickAdd}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="+ Add task (Enter)"
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#13141b",
            border: "1px solid #292e42",
            borderRadius: 5,
            padding: "5px 8px",
            color: "#c0caf5",
            fontSize: 11,
            outline: "none",
          }}
        />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 14,
          height: 14,
          cursor: "se-resize",
          opacity: hovered ? 0.6 : 0,
        }}
      />
    </div>
  );
}

export default memo(TaskBoardNodeImpl);
