import { useCallback } from "react";
import { useSettingsStore } from "../store/settingsStore";
import { useDialogStore } from "../store/dialogStore";
import { useTerminal } from "./useTerminal";
import type { TerminalTheme } from "../types/terminal";

const PREFS_KEY = "wodouyao.terminalCreatePrefs";

interface DialogPrefs {
  color?: string;
  theme?: TerminalTheme;
  shell?: string;
  fastStart?: boolean;
}

function loadPrefs(): DialogPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export interface LaunchOptions {
  /** Holding Shift inverts the configured skip_create_dialog default. */
  shiftKey?: boolean;
  /** Fields to pass through: command/name/cwd for quick-commands & presets. */
  overrides?: {
    command?: string;
    name?: string;
    cwd?: string;
  };
  /** Drawn rectangle (canvas world coords). If provided, wins over auto-placement. */
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

/**
 * Unified "new terminal" entry point. Respects the global
 * `skip_create_dialog` setting; Shift inverts it. Quick-mode spawns with
 * whatever prefs the dialog last persisted. Dialog-mode opens the modal
 * with whatever overrides/position/size the caller supplied.
 */
export function useNewTerminal() {
  const settings = useSettingsStore((s) => s.settings);
  const openTerminalCreate = useDialogStore((s) => s.openTerminalCreate);
  const { spawn } = useTerminal();

  return useCallback(
    (opts: LaunchOptions = {}) => {
      const { shiftKey = false, overrides = {}, position, size } = opts;
      const skipDialog = settings?.skip_create_dialog ?? false;
      const useQuick = shiftKey ? !skipDialog : skipDialog;
      if (!useQuick) {
        openTerminalCreate({ ...overrides, position, size });
        return;
      }
      const prefs = loadPrefs();
      spawn({
        color: prefs.color,
        theme: prefs.theme,
        shell: prefs.shell,
        fastStart: prefs.fastStart ?? true,
        ...overrides,
        position,
        size,
      });
    },
    [settings?.skip_create_dialog, openTerminalCreate, spawn]
  );
}
