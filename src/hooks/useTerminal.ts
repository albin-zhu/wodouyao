import { useCallback } from "react";
import { useTerminalStore } from "../store/terminalStore";
import { useCanvasStore } from "../store/canvasStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { createTerminal, destroyTerminal } from "../services/tauriCommands";
import { generateId } from "../utils/id";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../utils/constants";
import type { TerminalNode, TerminalTheme } from "../types/terminal";

export interface SpawnOptions {
  id?: string;
  command?: string;
  name?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  color?: string;
  theme?: TerminalTheme;
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
      };
      if (options?.name) overrides.name = options.name;
      if (options?.size) overrides.size = options.size;
      if (options?.color) overrides.color = options.color;
      if (options?.theme) overrides.theme = options.theme;

      const terminal = addTerminal(overrides);

      try {
        await createTerminal({
          id,
          command: options?.command,
          shell_path: options?.shell,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          cwd,
          fast_start: options?.fastStart ?? false,
        });
      } catch (err) {
        console.error("[spawn] createTerminal failed:", err);
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
