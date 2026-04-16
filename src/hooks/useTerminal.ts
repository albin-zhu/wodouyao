import { useCallback } from "react";
import { useTerminalStore } from "../store/terminalStore";
import { useCanvasStore } from "../store/canvasStore";
import { createTerminal, destroyTerminal } from "../services/tauriCommands";
import { generateId } from "../utils/id";
import { DEFAULT_COLS, DEFAULT_ROWS } from "../utils/constants";
import type { TerminalNode } from "../types/terminal";

export function useTerminal() {
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const { panX, panY, zoom } = useCanvasStore();

  const spawn = useCallback(
    async (
      command?: string,
      name?: string,
      position?: { x: number; y: number },
      size?: { width: number; height: number }
    ): Promise<TerminalNode> => {
      const id = generateId();

      // Use provided position or place at viewport center
      const pos = position ?? {
        x: (window.innerWidth / 2 - panX) / zoom - 300,
        y: (window.innerHeight / 2 - panY) / zoom - 200,
      };

      const overrides: Partial<TerminalNode> = {
        id,
        initialCommand: command,
        position: pos,
      };
      if (name) overrides.name = name;
      if (size) overrides.size = size;

      const terminal = addTerminal(overrides);

      try {
        await createTerminal({
          id,
          command,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
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
