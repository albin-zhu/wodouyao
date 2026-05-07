import { memo, useCallback, useMemo, useState, useRef, useEffect } from "react";
import { useTaskBoardStore, type TaskBoard } from "../../store/taskBoardStore";
import { useTaskStore } from "../../store/taskStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useNodeDrag } from "../../hooks/useNodeDrag";
import { TERMINAL_ROLES } from "../../utils/terminalRoles";
import type { Task, TaskStatus } from "../../types/task";

interface Props {
  board: TaskBoard;
}

const STATUS_GLYPH: Record<TaskStatus, string> = {
  pending: "\u25B6",
  in_progress: "\u25D0",
  completed: "\u2713",
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

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TaskRow({ task, sourceId }: { task: Task; sourceId?: string }) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const terminals = useTerminalStore((s) => s.terminals);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const owner = task.owner_term_id ? terminals.get(task.owner_term_id) : undefined;
  const ownerColor = owner?.color ?? "var(--color-border-strong)";
  const ownerName = owner?.name ?? (task.owner_term_id ? task.owner_term_id.slice(0, 8) : "unowned");
  const blockers = task.blocked_by ?? [];
  const isPulsing = task.status === "in_progress";
  const displayRole = owner?.role ?? task.role_hint ?? undefined;
  const roleMeta = displayRole ? TERMINAL_ROLES[displayRole] : undefined;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-wd-task", task.id);
        if (sourceId) e.dataTransfer.setData("application/x-wd-task-source", sourceId);
        e.dataTransfer.effectAllowed = "move";
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => setExpanded((v) => !v)}
      style={{
        position: "relative",
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        marginBottom: 5,
        padding: "7px 8px 7px 13px",
        cursor: "grab",
        animation: isPulsing ? "wd-pulse 1.4s ease-in-out infinite" : undefined,
      }}
    >
      {/* Left owner color bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: ownerColor,
          borderTopLeftRadius: 6,
          borderBottomLeftRadius: 6,
        }}
      />
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            updateTask(task.id, { status: NEXT[task.status] });
          }}
          style={{
            width: 17,
            height: 17,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            color:
              task.status === "completed"
                ? "var(--color-success)"
                : task.status === "in_progress"
                ? "var(--color-accent)"
                : "var(--color-text-muted)",
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
            color: task.status === "completed" ? "var(--color-text-muted)" : "var(--color-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: expanded ? "normal" : "nowrap",
            textDecoration: task.status === "completed" ? "line-through" : "none",
          }}
        >
          {task.subject}
        </span>
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
              color: "var(--color-danger)",
              cursor: "pointer",
              fontSize: 11,
              padding: "0 3px",
            }}
          >
            {"\u2715"}
          </button>
        )}
      </div>
      {/* Meta row */}
      <div
        style={{
          marginTop: 4,
          color: "var(--color-text-muted)",
          fontSize: 10,
          display: "flex",
          gap: 7,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {displayRole ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              color: roleMeta?.color ?? "var(--color-text-muted)",
              background: `color-mix(in srgb, ${roleMeta?.color ?? "var(--color-text-muted)"} 15%, transparent)`,
              border: `1px ${owner ? "solid" : "dashed"} color-mix(in srgb, ${roleMeta?.color ?? "var(--color-text-muted)"} 35%, transparent)`,
            }}
          >
            {roleMeta?.glyph && <span style={{ fontSize: 10, lineHeight: 1 }}>{roleMeta.glyph}</span>}
            {roleMeta?.label ?? displayRole}
          </span>
        ) : owner?.agentKind ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "1px 5px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              background: "color-mix(in srgb, var(--color-text-muted) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-text-muted) 35%, transparent)",
            }}
          >
            <span style={{ fontSize: 10, lineHeight: 1 }}>{">"}</span>
            {owner.agentKind}
          </span>
        ) : null}
        <span style={{ color: ownerColor }}>{"\u25CF"} {ownerName}</span>
        <span>{timeAgo(task.created_at)}</span>
        {blockers.length > 0 && (
          <span style={{ color: "var(--color-warning)" }}>blocked by {blockers.length}</span>
        )}
        {(task.acceptance?.length ?? 0) > 0 && (
          <span style={{ color: "var(--color-info)" }}>{"\u2713"} {task.acceptance.length}</span>
        )}
      </div>
      {/* Expanded description */}
      {expanded && task.description && (
        <div
          style={{
            marginTop: 7,
            color: "var(--color-text-dim)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {task.description}
        </div>
      )}
      {expanded && task.acceptance && task.acceptance.length > 0 && (
        <ul style={{ margin: "6px 0 0 16px", padding: 0, color: "var(--color-text-dim)", fontSize: 11 }}>
          {task.acceptance.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}

function TaskBoardNodeImpl({ board }: Props) {
  // Inject pulse keyframes once (same as TasksDrawer)
  useEffect(() => {
    if (document.getElementById("wd-task-keyframes")) return;
    const style = document.createElement("style");
    style.id = "wd-task-keyframes";
    style.textContent =
      "@keyframes wd-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(122,162,247,0.3); } 50% { box-shadow: 0 0 0 4px rgba(122,162,247,0.08); } }";
    document.head.appendChild(style);
  }, []);

  const updateBoard = useTaskBoardStore((s) => s.updateBoard);
  const removeBoard = useTaskBoardStore((s) => s.removeBoard);
  const bringToFront = useTaskBoardStore((s) => s.bringToFront);
  const mode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const setWireStart = useCanvasInteractionStore((s) => s.setWireStart);
  const tasksMap = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const updateTask = useTaskStore((s) => s.updateTask);
  const [hovered, setHovered] = useState(false);
  const [dropOver, setDropOver] = useState(false);
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
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-wd-task")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropOver(true);
        }
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the board node itself, not a child
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOver(false);
      }}
      onDrop={(e) => {
        const taskId = e.dataTransfer.getData("application/x-wd-task");
        if (taskId) {
          e.preventDefault();
          updateTask(taskId, { owner_term_id: null, status: "pending" });
        }
        setDropOver(false);
      }}
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
        background: "var(--color-bg-alt)",
        border: dropOver
          ? "1px dashed var(--color-warning)"
          : "1px solid color-mix(in srgb, var(--color-accent) 27%, transparent)",
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
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          cursor: "grab",
          flexShrink: 0,
          gap: 6,
          userSelect: "none",
        }}
      >
        <span style={{ color: "var(--color-accent)", fontSize: 13 }}>{"\u2713"}</span>
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
              background: "var(--color-bg)",
              border: "1px solid var(--color-accent)",
              borderRadius: 4,
              color: "var(--color-text)",
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
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {board.label}
          </span>
        )}
        <span style={{ color: "var(--color-text-muted)", fontSize: 11, flexShrink: 0 }}>
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
              background: "var(--color-accent)",
              border: "2px solid var(--color-surface)",
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
              color: "var(--color-text-muted)",
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
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        {(["all", "active", "done"] as const).map((f) => (
          <button
            key={f}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "var(--color-accent)" : "transparent",
              color: filter === f ? "var(--color-bg-alt)" : "var(--color-text-muted)",
              border: `1px solid ${filter === f ? "var(--color-accent)" : "var(--color-surface-alt)"}`,
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
          padding: "6px 8px",
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {tasks.length === 0 ? (
          <div style={{ color: "var(--color-text-muted)", fontSize: 11, padding: "8px", textAlign: "center" }}>
            No tasks
          </div>
        ) : (
          tasks.map((t) => <TaskRow key={t.id} task={t} sourceId={board.id} />)
        )}
      </div>

      {/* Quick add input */}
      <div
        style={{
          padding: "6px 8px",
          borderTop: "1px solid var(--color-border)",
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
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: 5,
            padding: "5px 8px",
            color: "var(--color-text)",
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
