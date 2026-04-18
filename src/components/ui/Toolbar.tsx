import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTerminalStore } from "../../store/terminalStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useTeamStore } from "../../store/teamStore";
import { useNoteStore } from "../../store/noteStore";
import { useTaskStore } from "../../store/taskStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import { useNewTerminal } from "../../hooks/useNewTerminal";
import { useForkWorkspace } from "../../hooks/useForkWorkspace";
import { useCanvasInteractionStore, type CanvasMode } from "../../store/canvasInteractionStore";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const MODE_BUTTONS: { mode: CanvasMode; label: string; title: string }[] = [
  { mode: "select", label: "\u2190", title: "Select (move/resize terminals)" },
  { mode: "draw", label: "\u25AD", title: "Draw (drag to create terminal)" },
  { mode: "wire", label: "\u2014", title: "Wire (connect terminals)" },
];

const AGENT_STYLES: Record<string, { bg: string; color: string; icon: string }> = {
  claude: { bg: "#ff9e6420", color: "#ff9e64", icon: "\u2726" },  // ✦
  codex: { bg: "#9ece6a20", color: "#9ece6a", icon: "\u25C8" },   // ◈
  opencode: { bg: "#7dcfff20", color: "#7dcfff", icon: "\u25C7" }, // ◇
};

export default function Toolbar() {
  const terminalCount = useTerminalStore((s) => s.terminals.size);
  const settings = useSettingsStore((s) => s.settings);
  const openDrawer = useSettingsStore((s) => s.openDrawer);
  const openTeamsDrawer = useTeamStore((s) => s.openDrawer);
  const launchTerminal = useNewTerminal();
  const addNote = useNoteStore((s) => s.addNote);
  const openTasksDrawer = useTaskStore((s) => s.openDrawer);
  const tasksMap = useTaskStore((s) => s.tasks);
  const tasksActiveCount = Array.from(tasksMap.values()).filter((t) => t.status !== "completed").length;
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const forkWorkspace = useForkWorkspace();
  const currentMode = useCanvasInteractionStore((s) => s.mode);
  const setMode = useCanvasInteractionStore((s) => s.setMode);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isFullscreen().then(setIsFullscreen).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isFullscreen().then(setIsFullscreen).catch(() => {});
    });
    return () => { unlisten.then((fn) => fn()).catch(() => {}); };
  }, []);

  const toggleFullscreen = () => {
    const win = getCurrentWindow();
    win.setFullscreen(!isFullscreen).then(() => setIsFullscreen(!isFullscreen)).catch(() => {});
  };

  const quickCommands = settings?.quick_commands ?? [];

  return (
    <div
      style={{
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "#1f2335",
        borderBottom: "1px solid #292e42",
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color: "#7aa2f7", fontWeight: 600, fontSize: 14 }}>Wodouyao</span>
        <WorkspaceSwitcher />
        <button
          onClick={() => {
            const name = prompt(
              `Fork "${currentWorkspace?.name ?? "Workspace"}" to:`,
              `${currentWorkspace?.name ?? "Workspace"} (fork)`
            );
            if (name !== null) forkWorkspace(name || undefined);
          }}
          title="Fork current workspace"
          style={{
            background: "none",
            border: "1px solid #292e42",
            color: "#565f89",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {"\u29BE"} fork
        </button>
        <span style={{ color: "#565f89", fontSize: 12 }}>
          {terminalCount} terminal{terminalCount !== 1 ? "s" : ""}
        </span>

        {/* Mode toggle buttons */}
        <div
          style={{
            display: "flex",
            border: "1px solid #292e42",
            borderRadius: 6,
            overflow: "hidden",
            marginLeft: 4,
          }}
        >
          {MODE_BUTTONS.map((btn) => (
            <button
              key={btn.mode}
              onClick={() => setMode(btn.mode)}
              title={btn.title}
              style={{
                background: currentMode === btn.mode ? "#7aa2f7" : "#1f2335",
                color: currentMode === btn.mode ? "#1a1b26" : "#565f89",
                border: "none",
                padding: "4px 10px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                borderRight: "1px solid #292e42",
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                background: agentStyle?.bg ?? "#292e42",
                color: agentStyle?.color ?? "#c0caf5",
                border: `1px solid ${agentStyle?.color ?? "#3b4261"}40`,
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
              ? "New terminal (uses last prefs; Shift+click for dialog)"
              : "New terminal (Shift+click for quick spawn)"
          }
          style={{
            background: "#7aa2f7",
            color: "#1a1b26",
            border: "none",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Terminal
        </button>
        <button
          onClick={() => addNote()}
          title="New sticky note"
          style={{
            background: "#e0af6822",
            color: "#e0af68",
            border: "1px solid #e0af6866",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Note
        </button>
        <span style={{ color: "#565f89", fontSize: 11 }}>
          Ctrl+K
        </span>

        {/* Teams button */}
        <button
          onClick={openTeamsDrawer}
          title="Teams"
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
            alt="Teams"
            width={22}
            height={22}
            style={{ display: "block", opacity: 0.85 }}
          />
        </button>

        {/* Tasks button */}
        <button
          onClick={openTasksDrawer}
          title={`Tasks (${tasksActiveCount} active)`}
          style={{
            position: "relative",
            background: "none",
            border: "1px solid #292e42",
            borderRadius: 4,
            color: "#c0caf5",
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
          {"\u2713"} Tasks
          {tasksActiveCount > 0 && (
            <span
              style={{
                background: "#7aa2f7",
                color: "#1a1b26",
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
          title="Settings"
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
            alt="Settings"
            width={22}
            height={22}
            style={{ display: "block", opacity: 0.85 }}
          />
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen (F11)" : "Fullscreen (F11)"}
          style={{
            background: "none",
            border: "1px solid #292e42",
            borderRadius: 4,
            color: "#565f89",
            cursor: "pointer",
            width: 26,
            height: 26,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isFullscreen ? "\u29C4" : "\u26F6"}
        </button>
      </div>
    </div>
  );
}
