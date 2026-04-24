import { useTranslation } from "react-i18next";
import { useTerminalStore } from "../../store/terminalStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useTeamStore } from "../../store/teamStore";
import { useNoteStore } from "../../store/noteStore";
import { useTaskStore } from "../../store/taskStore";
import { useTaskBoardStore } from "../../store/taskBoardStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useNewTerminal } from "../../hooks/useNewTerminal";
import { useForkWorkspace } from "../../hooks/useForkWorkspace";
import { useCanvasInteractionStore, type CanvasMode } from "../../store/canvasInteractionStore";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const MODE_BUTTONS: { mode: CanvasMode; label: string; titleKey: string }[] = [
  { mode: "select", label: "\u2190", titleKey: "toolbar.selectMode" },
  { mode: "draw", label: "\u25AD", titleKey: "toolbar.drawMode" },
  { mode: "wire", label: "\u2014", titleKey: "toolbar.wireMode" },
];

const AGENT_STYLES: Record<string, { bg: string; color: string; icon: string }> = {
  claude: { bg: "color-mix(in srgb, var(--color-warning-alt) 13%, transparent)", color: "var(--color-warning-alt)", icon: "\u2726" },  // ✦
  codex: { bg: "color-mix(in srgb, var(--color-success) 13%, transparent)", color: "var(--color-success)", icon: "\u25C8" },   // ◈
  opencode: { bg: "color-mix(in srgb, var(--color-info) 13%, transparent)", color: "var(--color-info)", icon: "\u25C7" }, // ◇
};

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
        // Reserve space on the left for the macOS traffic-light buttons
        // (Overlay title bar style; they sit at ~12px from the left edge).
        padding: "0 16px 0 80px",
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span data-tauri-drag-region style={{ color: "var(--color-accent)", fontWeight: 600, fontSize: 14 }}>Wodouyao</span>
        <WorkspaceSwitcher />
        <button
          onClick={() => {
            const name = prompt(
              t("toolbar.forkPrompt", { name: currentWorkspace?.name ?? "Workspace" }),
              t("toolbar.forkDefault", { name: currentWorkspace?.name ?? "Workspace" })
            );
            if (name !== null) forkWorkspace(name || undefined);
          }}
          title={t("toolbar.forkTitle")}
          style={{
            background: "none",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {"\u29BE"} {t("toolbar.fork")}
        </button>

        {/* Mode toggle buttons */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            overflow: "hidden",
            marginLeft: 4,
          }}
        >
          {MODE_BUTTONS.map((btn) => (
            <button
              key={btn.mode}
              onClick={() => setMode(btn.mode)}
              title={t(btn.titleKey)}
              style={{
                background: currentMode === btn.mode ? "var(--color-accent)" : "var(--color-surface)",
                color: currentMode === btn.mode ? "var(--color-bg-alt)" : "var(--color-text-muted)",
                border: "none",
                padding: "4px 10px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                borderRight: "1px solid var(--color-border)",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Invisible drag strip in the centre — fills leftover space between
          the two button groups. This is the main grab target since it has
          no interactive children to eat mousedown. */}
      <div
        data-tauri-drag-region
        style={{ flex: 1, height: "100%", cursor: "default" }}
      />

      <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Quick Command Buttons */}
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
                background: agentStyle?.bg ?? "var(--color-surface-alt)",
                color: agentStyle?.color ?? "var(--color-text)",
                border: `1px solid ${agentStyle?.color ?? "var(--color-border-strong)"}40`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {agentStyle && (
                <span style={{ fontSize: 13 }}>{agentStyle.icon}</span>
              )}
              {cmd.icon_label}
            </button>
          );
        })}

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
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("toolbar.addTerminal")}
        </button>
        <button
          onClick={() => addNote()}
          title={t("toolbar.addNote", "New sticky note")}
          style={{
            background: "color-mix(in srgb, var(--color-warning) 13%, transparent)",
            color: "var(--color-warning)",
            border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {t("toolbar.addNote")}
        </button>
        <button
          onClick={() => addBoard()}
          title="New task board"
          style={{
            background: "color-mix(in srgb, var(--color-accent) 13%, transparent)",
            color: "var(--color-accent)",
            border: "1px solid color-mix(in srgb, var(--color-accent) 40%, transparent)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {"\u2713"} Board
        </button>
        <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
          {t("toolbar.ctrlK")}
        </span>

        {/* Teams button */}
        <button
          onClick={openTeamsDrawer}
          title={t("toolbar.teams")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            lineHeight: 0,
          }}
        >
          <img
            src="/icons/teams.png"
            alt={t("toolbar.teams")}
            width={22}
            height={22}
            style={{ display: "block", opacity: 0.85 }}
          />
        </button>

        {/* Tasks button */}
        <button
          onClick={openTasksDrawer}
          title={t("toolbar.tasksActive", { count: tasksActiveCount })}
          style={{
            position: "relative",
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            color: "var(--color-text)",
            cursor: "pointer",
            padding: "2px 8px",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: "20px",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {"\u2713"} {t("toolbar.tasks")}
          {tasksActiveCount > 0 && (
            <span
              style={{
                background: "var(--color-accent)",
                color: "var(--color-bg-alt)",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 8,
                padding: "0 5px",
                lineHeight: "14px",
                minWidth: 14,
                textAlign: "center",
              }}
            >
              {tasksActiveCount}
            </span>
          )}
        </button>

        {/* Settings gear button */}
        <button
          onClick={openDrawer}
          title={t("toolbar.settings")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            lineHeight: 0,
          }}
        >
          <img
            src="/icons/settings.png"
            alt={t("toolbar.settings")}
            width={22}
            height={22}
            style={{ display: "block", opacity: 0.85 }}
          />
        </button>

        {/* Zen mode toggle: hides toolbar + canvas controls. Cmd+F11 / F11 to toggle back. */}
        <button
          onClick={toggleZenMode}
          title={t("toolbar.zenMode")}
          style={{
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            color: zenMode ? "var(--color-accent)" : "var(--color-text-muted)",
            cursor: "pointer",
            width: 26,
            height: 26,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          
          {"⛶"}
        </button>

        {/* Span all monitors: resize the window to the union bounding box
            of every connected display. Cmd+Shift+Enter / Ctrl+Shift+Enter. */}
        <button
          onClick={() => {
            import("../../utils/spanMonitors").then((m) => m.toggleSpanAllMonitors());
          }}
          title={t("toolbar.spanMonitors")}
          style={{
            background: "none",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            color: spanAllMonitors ? "var(--color-accent)" : "var(--color-text-muted)",
            cursor: "pointer",
            width: 26,
            height: 26,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {"⫿"}
        </button>
      </div>
    </div>
  );
}
