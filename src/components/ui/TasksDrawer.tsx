import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTaskStore } from "../../store/taskStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import type { Task, TaskStatus } from "../../types/task";
import { TERMINAL_ROLES } from "../../utils/terminalRoles";

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

function timeAgo(ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("tasks.justNow");
  if (m < 60) return t("tasks.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("tasks.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  return t("tasks.daysAgo", { count: d });
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
};

function TaskRow({ task }: { task: Task }) {
  const { t } = useTranslation();
  const updateTask = useTaskStore((s) => s.updateTask);
  const removeTask = useTaskStore((s) => s.removeTask);
  const terminals = useTerminalStore((s) => s.terminals);
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  const owner = task.owner_term_id ? terminals.get(task.owner_term_id) : undefined;
  const ownerColor = owner?.color ?? "var(--color-border-strong)";
  const ownerName = owner?.name ?? (task.owner_term_id ? task.owner_term_id.slice(0, 8) : t("tasks.unowned"));
  const blockers = task.blocked_by ?? [];
  const isPulsing = task.status === "in_progress";
  // Prefer the OWNER's role (what the terminal actually registered as);
  // fall back to the task's role_hint (what we suggested). If the owner
  // has no role, the hint still tells the user who this task was meant for.
  const displayRole = owner?.role ?? task.role_hint ?? undefined;
  const roleMeta = displayRole ? TERMINAL_ROLES[displayRole] : undefined;

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
        position: "relative",
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 6,
        marginBottom: 6,
        padding: "8px 10px 8px 14px",
        cursor: "grab",
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
          title={t("contextMenu.statusClick", { status: task.status })}
          style={{
            width: 18,
            height: 18,
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
            color: task.status === "completed" ? "var(--color-text-muted)" : "var(--color-text)",
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
              if (confirm(t("tasks.deleteConfirm", { subject: task.subject }))) removeTask(task.id);
            }}
            title={t("settings.delete")}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-danger)",
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
          color: "var(--color-text-muted)",
          fontSize: 10,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {displayRole && (
          <span
            title={
              roleMeta?.hint ??
              (owner
                ? t("tasks.ownerRole", "owner role")
                : t("tasks.suggestedRole", "suggested role"))
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              color: roleMeta?.color ?? "var(--color-text-muted)",
              background: `color-mix(in srgb, ${roleMeta?.color ?? "var(--color-text-muted)"} 15%, transparent)`,
              border: `1px solid color-mix(in srgb, ${roleMeta?.color ?? "var(--color-text-muted)"} 35%, transparent)`,
              // A light dashed border signals "only a hint" (no owner yet),
              // solid signals "this is the owner's actual role".
              borderStyle: owner ? "solid" : "dashed",
            }}
          >
            {roleMeta?.glyph && <span style={{ fontSize: 10, lineHeight: 1 }}>{roleMeta.glyph}</span>}
            {roleMeta?.label ?? displayRole}
          </span>
        )}
        <span style={{ color: ownerColor }}>{"\u25CF"} {ownerName}</span>
        <span>{timeAgo(task.created_at, t)}</span>
        {blockers.length > 0 && (
          <span style={{ color: "var(--color-warning)" }}>{t("tasks.blockedBy", { count: blockers.length })}</span>
        )}
        {(task.acceptance?.length ?? 0) > 0 && (
          <span style={{ color: "var(--color-info)" }}>
            {"\u2713"} {task.acceptance.length}
          </span>
        )}
      </div>
      {expanded && task.description && (
        <div
          style={{
            marginTop: 8,
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
        <ul style={{ margin: "8px 0 0 18px", padding: 0, color: "var(--color-text-dim)", fontSize: 11 }}>
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
  const { t } = useTranslation();
  const drawerOpen = useTaskStore((s) => s.drawerOpen);
  const closeDrawer = useTaskStore((s) => s.closeDrawer);
  const tasksMap = useTaskStore((s) => s.tasks);
  const createTask = useTaskStore((s) => s.createTask);
  const wsId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);
  const tasks = useMemo(() => {
    const all = Array.from(tasksMap.values());
    if (wsId === null) return all;
    return all.filter((t) => (t.workspace_id ?? wsId) === wsId);
  }, [tasksMap, wsId]);
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
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
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
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <span style={{ color: "var(--color-text)", fontWeight: 600, fontSize: 14 }}>
            {t("tasks.title")}
            <span style={{ color: "var(--color-text-muted)", fontWeight: 400, marginLeft: 8 }}>
              {t("tasks.activeTotal", { active: activeCount, total: tasks.length })}
            </span>
          </span>
          <button
            onClick={closeDrawer}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              cursor: "pointer",
              fontSize: 18,
              padding: "2px 6px",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
          <input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={handleQuickAdd}
            placeholder={t("tasks.addPlaceholder")}
            style={{
              width: "100%",
              background: "var(--color-bg)",
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "8px 10px",
              color: "var(--color-text)",
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
                  background: filter === f ? "var(--color-accent)" : "transparent",
                  color: filter === f ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                  border: "1px solid " + (filter === f ? "var(--color-accent)" : "var(--color-surface-alt)"),
                  borderRadius: 4,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: filter === f ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {t(`tasks.filter${f.charAt(0).toUpperCase()}${f.slice(1)}` as "tasks.filterAll")}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
          {filtered.length === 0 ? (
            <div style={{ color: "var(--color-text-muted)", fontSize: 12, lineHeight: 1.6 }}>
              {t("tasks.emptyState")}
            </div>
          ) : (
            filtered.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
      </div>
    </>
  );
}
