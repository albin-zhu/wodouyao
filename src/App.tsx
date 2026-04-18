import { useEffect } from "react";
import InfiniteCanvas from "./components/canvas/InfiniteCanvas";
import Toolbar from "./components/ui/Toolbar";
import CommandPalette from "./components/command-palette/CommandPalette";
import SettingsDrawer from "./components/ui/SettingsDrawer";
import TeamsDrawer from "./components/ui/TeamsDrawer";
import TasksDrawer from "./components/ui/TasksDrawer";
import TerminalPanel from "./components/ui/TerminalPanel";
import TerminalCreateDialog from "./components/ui/TerminalCreateDialog";
import TerminalContextMenu from "./components/terminal/TerminalContextMenu";
import { useKeyboard } from "./hooks/useKeyboard";
import { useSettingsStore } from "./store/settingsStore";
import { useWorkspace } from "./hooks/useWorkspace";
import { useHubSpawn } from "./hooks/useHubSpawn";
import { useTeamsSync } from "./hooks/useTeamsSync";
import { useTasksSync } from "./hooks/useTasksSync";
import { useTerminalActivity } from "./hooks/useTerminalActivity";
import { loadWorkspace } from "./services/tauriCommands";

export default function App() {
  useKeyboard();
  const { applyWorkspace } = useWorkspace();
  useHubSpawn();
  useTeamsSync();
  useTasksSync();
  useTerminalActivity();
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Handle fork-workspace events dispatched by useForkWorkspace
  useEffect(() => {
    const handler = async (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      try {
        const ws = await loadWorkspace(id);
        await applyWorkspace(ws);
      } catch (err) {
        console.error("[fork] failed to load forked workspace:", err);
      }
    };
    window.addEventListener("wodouyao:fork-workspace", handler);
    return () => window.removeEventListener("wodouyao:fork-workspace", handler);
  }, [applyWorkspace]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#13141b",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <Toolbar />
      <div style={{ flex: 1, position: "relative" }}>
        <InfiniteCanvas />
      </div>
      <CommandPalette />
      <SettingsDrawer />
      <TeamsDrawer />
      <TasksDrawer />
      <TerminalPanel />
      <TerminalCreateDialog />
      <TerminalContextMenu />
    </div>
  );
}
