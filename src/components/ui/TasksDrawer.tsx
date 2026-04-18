import { useMemo, useState, useEffect } from "react";
import { useTaskStore } from "../../store/taskStore";
import { useTerminalStore } from "../../store/terminalStore";
import type { Task, TaskStatus } from "../../types/task";

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

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
};

function TaskRow({ task }: { task: Task }) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const terminals = useTerminalStore((s) => s.terminals);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const owner = task.owner_term_id ? terminals.get(task.owner_term_id) : undefined;
  const ownerColor = owner?.color ?? "#3b4261";
  const ownerName = owner?.name ?? (task.owner_term_id ? task.owner_term_id.slice(0, 8) : "unowned");
  const blockers = task.blocked_by ?? [];
  const isPulsing = task.status === "in_progress";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: "#13141b",
        border: "1px solid #292e42",
        borderRadius: 6,
        marginBottom: 6,
        padding: "8px 10px 8px 14px",
        cursor: "pointer",
        animation: isPulsing ? "wd-pulse 1.4s ease-in-out infinite" : undefined,
      }}
      onClick={() => setExpanded((v) => !v)}
    >
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
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            updateTask(task.id, { status: NEXT_STATUS[task.status] });
          }}
          title={`status: ${task.status} (click to advance)`}
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            border: "none",
            background: "transparent",
            color:
              task.status === "completed"
                ? "#9ece6a"
                : task.status === "in_progress"
                ? "#7aa2f7"
                : "#565f89",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          {STATUS_GLYPH[task.status]}
        </button>
        <span
          style={{
            color: task.status === "completed" ? "#565f89" : "#c0caf5",
            fontSize: 12,
            flex: 1,
            textDecoration: task.status === "completed" ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: expanded ? "normal" : "nowrap",
          }}
        >
          {task.subject}
        </span>
        {hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${task.subject}"?`)) removeTask(task.id);
            }}
            title="Delete"
            style={{
              background: "none",
              border: "none",
              color: "#f7768e",
              cursor: "pointer",
              fontSize: 11,
              padding: "0 4px",
            }}
          >
            {"\u2715"}
          </button>
        )}
      </div>
      <div
        style={{
          marginTop: 4,
          color: "#565f89",
          fontSize: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: ownerColor }}>{"\u25CF"} {ownerName}</span>
        <span>{timeAgo(task.created_at)}</span>
        {blockers.length > 0 && (
          <span style={{ color: "#e0af68" }}>blocked by {blockers.length}</span>
        )}
        {(task.acceptance?.length ?? 0) > 0 && (
          <span style={{ color: "#7dcfff" }}>
            {"\u2713"} {task.acceptance.length}
          </span>
        )}
      </div>
      {expanded && task.description && (
        <div
          style={{
            marginTop: 8,
            color: "#a9b1d6",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {task.description}
        </div>
      )}
      {expanded && task.acceptance && task.acceptance.length > 0 && (
        <ul style={{ margin: "8px 0 0 18px", padding: 0, color: "#a9b1d6", fontSize: 11 }}>
          {task.acceptance.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Filter = "all" | "active" | "mine" | "done";

export default function TasksDrawer() {
  const drawerOpen = useTaskStore((s) => s.drawerOpen);
  const closeDrawer = useTaskStore((s) => s.closeDrawer);
  const tasksMap = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const tasks = useMemo(() => Array.from(tasksMap.values()), [tasksMap]);
  const [filter, setFilter] = useState<Filter>("all");
  const [quickAdd, setQuickAdd] = useState("");

  // Inject pulse keyframes once
  useEffect(() => {
    if (document.getElementById("wd-task-keyframes")) return;
    const style = document.createElement("style");
    style.id = "wd-task-keyframes";
    style.textContent =
      "@keyframes wd-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(122,162,247,0.3); } 50% { box-shadow: 0 0 0 4px rgba(122,162,247,0.08); } }";
    document.head.appendChild(style);
  }, []);

  if (!drawerOpen) return null;

  const filtered = tasks
    .filter((t) => {
      if (filter === "active") return t.status !== "completed";
      if (filter === "done") return t.status === "completed";
      return true;
    })
    .sort((a, b) => {
      const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (so !== 0) return so;
      return a.created_at - b.created_at;
    });

  const activeCount = tasks.filter((t) => t.status !== "completed").length;

  const handleQuickAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && quickAdd.trim()) {
      e.preventDefault();
      createTask({ subject: quickAdd.trim() });
      setQuickAdd("");
    }
  };

  return (
    <>
      <div
        onClick={closeDrawer}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8999,
          background: "rgba(0,0,0,0.3)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 360,
          height: "100vh",
          zIndex: 9000,
          background: "#1f2335",
          borderLeft: "1px solid #292e42",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: "1px solid #292e42",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#c0caf5", fontWeight: 600, fontSize: 14 }}>
            Tasks
            <span style={{ color: "#565f89", fontWeight: 400, marginLeft: 8 }}>
              {activeCount} active · {tasks.length} total
            </span>
          </span>
          <button
            onClick={closeDrawer}
            style={{
              background: "none",
              border: "none",
              color: "#565f89",
              cursor: "pointer",
              fontSize: 18,
              padding: "2px 6px",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid #292e42", flexShrink: 0 }}>
          <input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={handleQuickAdd}
            placeholder="+ Add a task (Enter)"
            style={{
              width: "100%",
              background: "#13141b",
              border: "1px solid #292e42",
              borderRadius: 6,
              padding: "8px 10px",
              color: "#c0caf5",
              fontSize: 12,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {(["all", "active", "done"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? "#7aa2f7" : "transparent",
                  color: filter === f ? "#1a1b26" : "#565f89",
                  border: "1px solid " + (filter === f ? "#7aa2f7" : "#292e42"),
                  borderRadius: 4,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: filter === f ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
          {filtered.length === 0 ? (
            <div style={{ color: "#565f89", fontSize: 12, lineHeight: 1.6 }}>
              No tasks yet. Add one above, or from a terminal call the tasks API.
            </div>
          ) : (
            filtered.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      </div>
    </>
  );
}
