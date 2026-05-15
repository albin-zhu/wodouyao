import { useEffect } from "react";
import InfiniteCanvas from "./components/canvas/InfiniteCanvas";
import Toolbar from "./components/ui/Toolbar";
import CommandPalette from "./components/command-palette/CommandPalette";
import SettingsDrawer from "./components/ui/SettingsDrawer";
import TeamsDrawer from "./components/ui/TeamsDrawer";
import TasksDrawer from "./components/ui/TasksDrawer";
import ClonesDrawer from "./components/ui/ClonesDrawer";
import TerminalPanel from "./components/ui/TerminalPanel";
import TerminalCreateDialog from "./components/ui/TerminalCreateDialog";
import TerminalContextMenu from "./components/terminal/TerminalContextMenu";
import ToastContainer from "./components/ui/ToastContainer";
import PerfHUD from "./components/ui/PerfHUD";
import BootstrapWorkflowDialog from "./components/ui/BootstrapWorkflowDialog";
import { useKeyboard } from "./hooks/useKeyboard";
import { useSettingsStore } from "./store/settingsStore";
import { useCanvasStore } from "./store/canvasStore";
import { useRoleStore } from "./store/roleStore";
import { useWorkspace } from "./hooks/useWorkspace";
import { useHubSpawn } from "./hooks/useHubSpawn";
import { useTeamsSync } from "./hooks/useTeamsSync";
import { useTasksSync } from "./hooks/useTasksSync";
import { useClonesSync } from "./hooks/useClonesSync";
import { useTerminalActivity } from "./hooks/useTerminalActivity";
import { useNotesSync } from "./hooks/useNotesSync";
import { useWiresSync } from "./hooks/useWiresSync";
import { loadWorkspace } from "./services/tauriCommands";
import { subscribeJson } from "./services/transport";

export default function App() {
  useKeyboard();
  const { applyWorkspace } = useWorkspace();
  useHubSpawn();
  useTeamsSync();
  useTasksSync();
  useClonesSync();
  useTerminalActivity();
  useNotesSync();
  useWiresSync();
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const hydrateRoles = useRoleStore((s) => s.hydrate);
  const zenMode = useCanvasStore((s) => s.zenMode);
  const isHdpi = useSettingsStore((s) => s.settings?.is_hdpi ?? true);
  const theme = useSettingsStore((s) => s.settings?.theme ?? "system");
  const globalFontFamily = useSettingsStore(
    (s) => s.settings?.terminal_options?.font_family ?? null
  );

  // Toggle body class so global.css applies the non-HDPI font smoothing
  // and border-snap rules. Cheaper than re-rendering every component.
  useEffect(() => {
    document.body.classList.toggle("wd-no-hdpi", !isHdpi);
  }, [isHdpi]);

  // Mirror the terminal font choice to a CSS variable so UI elements
  // (notes, task boards, panels) automatically match the user's font
  // preference without requiring separate per-component settings.
  useEffect(() => {
    if (globalFontFamily) {
      document.documentElement.style.setProperty("--font-global-family", globalFontFamily);
    } else {
      document.documentElement.style.removeProperty("--font-global-family");
    }
  }, [globalFontFamily]);

  // Theme: flip html[data-theme] and mirror to localStorage so the FOUC
  // bootstrap script in index.html has an up-to-date value on next launch.
  // "system" subscribes to prefers-color-scheme so the app flips live when
  // the user changes macOS Appearance in System Settings.
  useEffect(() => {
    try { localStorage.setItem("wd-theme", theme); } catch (_) { /* ignore */ }

    const apply = (resolved: "dark" | "light") => {
      document.documentElement.dataset.theme = resolved;
      // Broadcast so anything that reads computed CSS vars (BackgroundLayer,
      // WireLayer, xterm themes) can re-read without React plumbing.
      window.dispatchEvent(new CustomEvent("wd-theme-changed", { detail: resolved }));
    };

    if (theme === "dark" || theme === "light") {
      apply(theme);
      return;
    }
    // system
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    apply(mq.matches ? "light" : "dark");
    const listener = (e: MediaQueryListEvent) => apply(e.matches ? "light" : "dark");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [theme]);

  useEffect(() => {
    loadSettings();
    hydrateRoles();
    // Hub or other processes may mutate settings on disk (e.g. wodouyao bg).
    // Listen for the settings-changed event and reload.
    const unlisten = subscribeJson("settings-changed", () => loadSettings());
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [loadSettings, hydrateRoles]);

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
      <ClonesDrawer />
      <TerminalPanel />
      <TerminalCreateDialog />
      <TerminalContextMenu />
      <ToastContainer />
      <PerfHUD />
      <BootstrapWorkflowDialog />
    </div>
  );
}
