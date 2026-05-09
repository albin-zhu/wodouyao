import { useTranslation } from "react-i18next";
import { useTerminalStore } from "../../store/terminalStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useTeamStore } from "../../store/teamStore";
import { useNoteStore } from "../../store/noteStore";
import { useTaskStore } from "../../store/taskStore";
import { useSkillStore } from "../../store/skillStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useDialogStore } from "../../store/dialogStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useNewTerminal } from "../../hooks/useNewTerminal";
import { useForkWorkspace } from "../../hooks/useForkWorkspace";
import { useCanvasInteractionStore, type CanvasMode } from "../../store/canvasInteractionStore";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const MODE_BUTTONS: { mode: CanvasMode; img: string; titleKey: string }[] = [
  { mode: "select", img: "/icons/mode-select.png", titleKey: "toolbar.selectMode" },
  { mode: "draw",   img: "/icons/mode-draw.png",   titleKey: "toolbar.drawMode"   },
  { mode: "wire",   img: "/icons/mode-wire.png",    titleKey: "toolbar.wireMode"   },
];

const AGENT_STYLES: Record<string, { bg: string; color: string; img?: string }> = {
  claude:    { bg: "color-mix(in srgb, var(--color-warning-alt) 13%, transparent)", color: "var(--color-warning-alt)", img: "/icons/agent-claude.png" },
  codex:     { bg: "color-mix(in srgb, var(--color-success) 13%, transparent)",     color: "var(--color-success)",     img: "/icons/agent-codex.png"  },
  opencode:  { bg: "color-mix(in srgb, var(--color-info) 13%, transparent)",        color: "var(--color-info)",        img: "/icons/agent-opencode.png" },
};

// A simple vertical divider between button groups
function Divider() {
  return (
    <div style={{
      width: 1,
      height: 20,
      background: "var(--color-border)",
      flexShrink: 0,
      margin: "0 2px",
    }} />
  );
}

// A square icon-only toolbar button
function IconBtn({
  src, alt, size = 18, active = false, activeAccent = false,
  badge, onClick, title, children,
}: {
  src?: string; alt?: string; size?: number;
  active?: boolean; activeAccent?: boolean;
  badge?: React.ReactNode;
  onClick?: () => void; title?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        position: "relative",
        background: activeAccent
          ? "color-mix(in srgb, var(--color-accent) 18%, transparent)"
          : active
          ? "var(--color-surface-alt)"
          : "none",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        flexShrink: 0,
        color: active || activeAccent ? "var(--color-accent)" : "var(--color-text-muted)",
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ""}
          width={size}
          height={size}
          style={{
            display: "block",
            opacity: active || activeAccent ? 1 : 0.7,
          }}
        />
      ) : children}
      {badge && (
        <span style={{
          position: "absolute",
          top: 2, right: 2,
          background: "var(--color-accent)",
          color: "var(--color-bg-alt)",
          fontSize: 9,
          fontWeight: 700,
          borderRadius: 6,
          padding: "0 3px",
          lineHeight: "13px",
          minWidth: 12,
          textAlign: "center",
          pointerEvents: "none",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

export default function Toolbar() {
  const { t } = useTranslation();
  const anyMaximized = useTerminalStore((s) =>
    Array.from(s.terminals.values()).some((t) => !!t.prevBounds)
  );
  const settings = useSettingsStore((s) => s.settings);
  const openDrawer = useSettingsStore((s) => s.openDrawer);
  const openTeamsDrawer = useTeamStore((s) => s.openDrawer);
  const launchTerminal = useNewTerminal();
  const addNote = useNoteStore((s) => s.addNote);
  const addBoard = useTaskBoardStore((s) => s.addBoard);
  const openTasksDrawer = useTaskStore((s) => s.openDrawer);
  const openSkillsDrawer = useSkillStore((s) => s.openDrawer);
  const openBootstrap = useDialogStore((s) => s.openBootstrapWorkflow);
  const tasksMap = useTaskStore((s) => s.tasks);
  const tasksActiveCount = Array.from(tasksMap.values()).filter((t) => t.status !== "completed").length;
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const forkWorkspace = useForkWorkspace();
  const currentMode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const zenMode = useCanvasStore((s) => s.zenMode);
  const toggleZenMode = useCanvasStore((s) => s.toggleZenMode);
  const spanAllMonitors = useCanvasStore((s) => s.spanAllMonitors);

  const quickCommands = settings?.quick_commands ?? [];

  if (anyMaximized) return null;

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px 0 80px",
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        zIndex: 20,
        flexShrink: 0,
        gap: 0,
      }}
    >
      {/* ── Left: brand + workspace + fork + modes ─────────────────────────── */}
      <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          data-tauri-drag-region
          style={{ color: "var(--color-accent)", fontWeight: 700, fontSize: 13, letterSpacing: 0.3, marginRight: 2 }}
        >
          Wodouyao
        </span>

        <WorkspaceSwitcher />

        <IconBtn
          src="/icons/fork.png"
          alt={t("toolbar.fork")}
          size={16}
          title={t("toolbar.forkTitle")}
          onClick={() => {
            const name = prompt(
              t("toolbar.forkPrompt", { name: currentWorkspace?.name ?? "Workspace" }),
              t("toolbar.forkDefault", { name: currentWorkspace?.name ?? "Workspace" })
            );
            if (name !== null) forkWorkspace(name || undefined);
          }}
        />

        <Divider />

        {/* Mode toggle group */}
        <div style={{
          display: "flex",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          overflow: "hidden",
        }}>
          {MODE_BUTTONS.map((btn, i) => (
            <button
              key={btn.mode}
              onClick={() => setMode(btn.mode)}
              title={t(btn.titleKey)}
              style={{
                background: currentMode === btn.mode ? "var(--color-accent)" : "var(--color-surface)",
                border: "none",
                borderRight: i < 2 ? "1px solid var(--color-border)" : "none",
                padding: "0 9px",
                height: 28,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={btn.img}
                alt={btn.mode}
                width={14}
                height={14}
                style={{
                  display: "block",
                  opacity: currentMode === btn.mode ? 1 : 0.5,
                  filter: currentMode === btn.mode
                    ? "brightness(0) invert(1)"   // white icon on accent bg
                    : "none",
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* ── Centre: drag strip ──────────────────────────────────────────────── */}
      <div data-tauri-drag-region style={{ flex: 1, height: "100%", cursor: "default" }} />

      {/* ── Right: agents + actions + utilities ────────────────────────────── */}
      <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 4 }}>

        {/* Quick command agent buttons */}
        {quickCommands.map((cmd) => {
          const agentKey = cmd.command?.toLowerCase().trim();
          const agentStyle = agentKey ? AGENT_STYLES[agentKey] : undefined;
          return (
            <button
              key={cmd.id}
              onClick={(e) =>
                launchTerminal({
                  shiftKey: e.shiftKey,
                  overrides: { command: cmd.command, name: cmd.label },
                })
              }
              title={cmd.label}
              style={{
                background: "var(--color-bg)",
                color: agentStyle?.color ?? "var(--color-text)",
                border: `1px solid ${agentStyle?.color ?? "var(--color-border-strong)"}`,
                borderRadius: 6,
                padding: "0 8px",
                height: 28,
                lineHeight: 1,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: 0.3,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {agentStyle?.img && (
                <img src={agentStyle.img} width={16} height={16} style={{ display: "block" }} />
              )}
              {cmd.icon_label}
            </button>
          );
        })}

        <Divider />

        {/* + Terminal */}
        <button
          onClick={(e) => launchTerminal({ shiftKey: e.shiftKey })}
          title={
            settings?.skip_create_dialog
              ? t("toolbar.newTerminalTitleSkip")
              : t("toolbar.newTerminalTitleDialog")
          }
          style={{
            background: "var(--color-accent)",
            color: "var(--color-bg-alt)",
            border: "none",
            borderRadius: 6,
            padding: "0 12px",
            height: 28,
            lineHeight: 1,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <img src="/icons/add-terminal.png" width={14} height={14} style={{ display: "block", filter: "brightness(0) invert(1)" }} />
          {t("toolbar.addTerminal")}
        </button>

        {/* + Note */}
        <button
          onClick={() => addNote()}
          title={t("toolbar.addNote", "New sticky note")}
          style={{
            background: "color-mix(in srgb, var(--color-warning) 13%, transparent)",
            color: "var(--color-warning)",
            border: "1px solid color-mix(in srgb, var(--color-warning) 35%, transparent)",
            borderRadius: 6,
            padding: "0 10px",
            height: 28,
            lineHeight: 1,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("toolbar.addNote")}
        </button>

        {/* Board */}
        <button
          onClick={() => addBoard()}
          title="New task board"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 13%, transparent)",
            color: "var(--color-accent)",
            border: "1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)",
            borderRadius: 6,
            padding: "0 10px",
            height: 28,
            lineHeight: 1,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Board
        </button>

        {/* ✨ Bootstrap workflow */}
        <button
          onClick={openBootstrap}
          title={t("toolbar.bootstrapWorkflow", "Bootstrap multi-agent workflow")}
          style={{
            background: "color-mix(in srgb, var(--color-accent-alt) 13%, transparent)",
            color: "var(--color-accent-alt)",
            border: "1px solid color-mix(in srgb, var(--color-accent-alt) 35%, transparent)",
            borderRadius: 6,
            padding: "0 10px",
            height: 28,
            lineHeight: 1,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ✨ {t("toolbar.workflow", "Workflow")}
        </button>

        <Divider />

        {/* Teams */}
        <IconBtn
          src="/icons/teams.png"
          alt={t("toolbar.teams")}
          size={16}
          title={t("toolbar.teams")}
          onClick={openTeamsDrawer}
        />

        {/* Tasks */}
        <IconBtn
          src="/icons/tasks.png"
          alt={t("toolbar.tasks")}
          size={16}
          title={t("toolbar.tasks")}
          active={tasksActiveCount > 0}
          onClick={openTasksDrawer}
          badge={tasksActiveCount > 0 ? tasksActiveCount : undefined}
        />

        {/* Skills */}
        <IconBtn
          title="Skills"
          onClick={openSkillsDrawer}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>⚡</span>
        </IconBtn>

        {/* Settings */}
        <IconBtn
          src="/icons/settings.png"
          alt={t("toolbar.settings")}
          size={16}
          title={t("toolbar.settings")}
          onClick={openDrawer}
        />

        <Divider />

        {/* Zen mode */}
        <IconBtn
          src="/icons/zen-mode.png"
          alt={t("toolbar.zenMode")}
          size={16}
          title={t("toolbar.zenMode")}
          activeAccent={zenMode}
          onClick={toggleZenMode}
        />

        {/* Span all monitors */}
        <IconBtn
          title={t("toolbar.spanMonitors")}
          activeAccent={spanAllMonitors}
          onClick={() => {
            import("../../utils/spanMonitors").then((m) => m.toggleSpanAllMonitors());
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>{"⫿"}</span>
        </IconBtn>
      </div>
    </div>
  );
}
