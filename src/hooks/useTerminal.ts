import { useCallback } from "react";
import { useTerminalStore } from "../store/terminalStore";
import { useCanvasStore } from "../store/canvasStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { createTerminal, destroyTerminal } from "../services/tauriCommands";
import { generateId } from "../utils/id";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../utils/constants";
import { toast } from "../store/toastStore";
import i18n from "../i18n";
import type { TerminalNode, TerminalTheme, TerminalRole } from "../types/terminal";

/** Detect which agent CLI a spawn command invokes, so on workspace reload
 *  we can rebuild the command with a resume flag. Recognizes the first
 *  token after any `bash -c '...'` wrapping. Returns "shell" for anything
 *  not a known agent (wodouyao scripts, raw shells, etc.). */
function detectAgentKind(command: string | undefined): TerminalNode["agentKind"] {
  if (!command) return "shell";
  const head = command.trim().split(/\s+/)[0] ?? "";
  const basename = head.split("/").pop() ?? head;
  if (basename === "claude") return "claude";
  if (basename === "codex") return "codex";
  return "shell";
}

export interface SpawnOptions {
  id?: string;
  command?: string;
  name?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
  theme?: TerminalTheme;
  role?: TerminalRole;
  shell?: string;
  cwd?: string;
  fastStart?: boolean;
}

export function useTerminal() {
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const { panX, panY, zoom } = useCanvasStore();

  const spawn = useCallback(
    async (options?: SpawnOptions): Promise<TerminalNode> => {
      const id = options?.id ?? generateId();

      // Use provided position or place at viewport center
      const pos = options?.position ?? {
        x: (window.innerWidth / 2 - panX) / zoom - 300,
        y: (window.innerHeight / 2 - panY) / zoom - 200,
      };

      // Resolve cwd: explicit > workspace default
      const workspaceCwd = useWorkspaceStore.getState().currentWorkspaceCwd;
      const cwd = options?.cwd ?? workspaceCwd ?? undefined;

      const overrides: Partial<TerminalNode> = {
        id,
        initialCommand: options?.command,
        position: pos,
        cwd,
        agentKind: detectAgentKind(options?.command),
      };
      if (options?.name) overrides.name = options.name;
      if (options?.size) overrides.size = options.size;
      if (options?.color) overrides.color = options.color;
      if (options?.theme) overrides.theme = options.theme;
      if (options?.role) overrides.role = options.role;

      const terminal = addTerminal(overrides);

      const wsId = useWorkspaceStore.getState().currentWorkspace?.id;
      try {
        await createTerminal({
          id,
          command: options?.command,
          shell_path: options?.shell,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cwd,
          fast_start: options?.fastStart ?? false,
          workspace_id: wsId,
        });
        toast(i18n.t("toast.terminalCreated"), "success", 2000);
      } catch (err) {
        // Roll back the optimistic addTerminal — without this the canvas
        // keeps an orphan node whose xterm onData fires write_terminal IPCs
        // for an id that has no PTY, spamming "Session not found" 500s.
        console.error("[spawn] createTerminal failed:", err);
        removeTerminal(id);
        toast(i18n.t("toast.terminalError"), "error");
      }

      return terminal;
    },
    [addTerminal, panX, panY, zoom]
  );

  const kill = useCallback(
    async (id: string) => {
      await destroyTerminal(id).catch(console.error);
      removeTerminal(id);
    },
    [removeTerminal]
  );

  return { spawn, kill };
}
