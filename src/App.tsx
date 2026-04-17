import { useEffect } from "react";
import InfiniteCanvas from "./components/canvas/InfiniteCanvas";
import Toolbar from "./components/ui/Toolbar";
import CommandPalette from "./components/command-palette/CommandPalette";
import SettingsDrawer from "./components/ui/SettingsDrawer";
import TeamsDrawer from "./components/ui/TeamsDrawer";
import TerminalPanel from "./components/ui/TerminalPanel";
import TerminalCreateDialog from "./components/ui/TerminalCreateDialog";
import TerminalContextMenu from "./components/terminal/TerminalContextMenu";
import { useKeyboard } from "./hooks/useKeyboard";
import { useSettingsStore } from "./store/settingsStore";
import { useWorkspace } from "./hooks/useWorkspace";
import { useHubSpawn } from "./hooks/useHubSpawn";
import { useTeamsSync } from "./hooks/useTeamsSync";

export default function App() {
  useKeyboard();
  useWorkspace();
  useHubSpawn();
  useTeamsSync();
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
      <TerminalPanel />
      <TerminalCreateDialog />
      <TerminalContextMenu />
    </div>
  );
}
