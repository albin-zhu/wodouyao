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
import { useCanvasStore } from "./store/canvasStore";
import { useWorkspace } from "./hooks/useWorkspace";
import { useHubSpawn } from "./hooks/useHubSpawn";
import { useTeamsSync } from "./hooks/useTeamsSync";
import { useTasksSync } from "./hooks/useTasksSync";
import { useTerminalActivity } from "./hooks/useTerminalActivity";
import { useNotesSync } from "./hooks/useNotesSync";
import { useWiresSync } from "./hooks/useWiresSync";
import { loadWorkspace } from "./services/tauriCommands";

export default function App() {
  useKeyboard();
  const { applyWorkspace } = useWorkspace();
  useHubSpawn();
  useTeamsSync();
  useTasksSync();
  useTerminalActivity();
  useNotesSync();
  useWiresSync();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const zenMode = useCanvasStore((s) => s.zenMode);
  const clickThroughOverride = useCanvasStore((s) => s.clickThroughOverride);
  const bgOpacity = useSettingsStore((s) => s.settings?.background?.opacity ?? 1);
  const isHdpi = useSettingsStore((s) => s.settings?.is_hdpi ?? true);

  // Toggle body class so global.css applies the non-HDPI font smoothing
  // and border-snap rules. Cheaper than re-rendering every component.
  useEffect(() => {
    document.body.classList.toggle("wd-no-hdpi", !isHdpi);
  }, [isHdpi]);

  // Click-through: when window is fully transparent, mouse events fall
  // through to the desktop. Manual override (Cmd+Shift+F11) wins over auto.
  useEffect(() => {
    const wantPassthrough =
      clickThroughOverride !== null
        ? clickThroughOverride
        : bgOpacity === 0;
    let cancelled = false;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      if (cancelled) return;
      getCurrentWindow().setIgnoreCursorEvents(wantPassthrough).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [bgOpacity, clickThroughOverride]);

  useEffect(() => {
    loadSettings();
    // Hub or other processes may mutate settings on disk (e.g. wodouyao bg).
    // Listen for the settings-changed event and reload.
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen("settings-changed", () => loadSettings())
    );
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
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
        // Background painted by <BackgroundLayer> with the user-controlled
        // alpha; keep this transparent so a transparent Tauri window can
        // show the desktop through.
        background: "transparent",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {!zenMode && <Toolbar />}
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
