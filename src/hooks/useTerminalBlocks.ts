import { useRef, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import { generateId } from "../utils/id";

export interface TerminalBlock {
  id: string;
  /** Buffer row where the prompt line starts (OSC A). */
  row: number;
  /** Buffer row where command input starts (after OSC B). */
  commandRow: number;
  /** Buffer row where command execution starts (OSC C). */
  execRow: number;
  /** Buffer row where the next prompt starts (filled on OSC D of next block). */
  endRow?: number;
  exitCode?: number;
  collapsed: boolean;
}

interface PendingBlock {
  promptStartRow: number;
  commandRow: number;
  execRow: number;
}

export function useTerminalBlocks() {
  const blocksRef = useRef<TerminalBlock[]>([]);
  const versionRef = useRef(0);
  const forceUpdateRef = useRef<(() => void) | null>(null);

  // pending holds state between OSC A/B/C before OSC D completes the block
  const pendingRef = useRef<Partial<PendingBlock>>({});

  const registerHandlers = useCallback(
    (term: Terminal, onUpdate: () => void) => {
      forceUpdateRef.current = onUpdate;

      const getActiveRow = () => {
        const buf = term.buffer.active;
        return buf.baseY + buf.cursorY;
      };

      const disposeA = term.parser.registerOscHandler(133, (data) => {
        const parts = data.split(";");
        const seq = parts[0];

        if (seq === "A") {
          // Prompt start — finalise any open block first
          const row = getActiveRow();
          if (pendingRef.current.promptStartRow !== undefined) {
            // OSC D was never received (e.g. shell just started) — close anyway
            const last = blocksRef.current[blocksRef.current.length - 1];
            if (last && last.endRow === undefined) {
              last.endRow = row;
            }
          }
          pendingRef.current = { promptStartRow: row, commandRow: row, execRow: row };
          return true;
        }

        if (seq === "B") {
          // Prompt end / command input starts
          pendingRef.current.commandRow = getActiveRow();
          return true;
        }

        if (seq === "C") {
          // Command execution starts — commit a new block
          const row = getActiveRow();
          pendingRef.current.execRow = row;
          const p = pendingRef.current;
          if (p.promptStartRow !== undefined) {
            const block: TerminalBlock = {
              id: generateId("blk"),
              row: p.promptStartRow,
              commandRow: p.commandRow ?? p.promptStartRow,
              execRow: row,
              collapsed: false,
            };
            // Close previous block's endRow if not yet set
            const prev = blocksRef.current[blocksRef.current.length - 1];
            if (prev && prev.endRow === undefined) {
              prev.endRow = p.promptStartRow;
            }
            blocksRef.current = [...blocksRef.current, block];
            versionRef.current += 1;
            onUpdate();
          }
          return true;
        }

        if (seq === "D") {
          // Command finished — record exit code on the most recent block
          const exitCode = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
          const last = blocksRef.current[blocksRef.current.length - 1];
          if (last) {
            last.exitCode = exitCode;
            versionRef.current += 1;
            onUpdate();
          }
          pendingRef.current = {};
          return true;
        }

        return false;
      });

      return () => {
        disposeA.dispose();
        forceUpdateRef.current = null;
      };
    },
    []
  );

  const clearBlocks = useCallback(() => {
    blocksRef.current = [];
    pendingRef.current = {};
    versionRef.current += 1;
  }, []);

  const toggleCollapse = useCallback((blockId: string, onUpdate: () => void) => {
    const block = blocksRef.current.find((b) => b.id === blockId);
    if (block) {
      block.collapsed = !block.collapsed;
      versionRef.current += 1;
      onUpdate();
    }
  }, []);

  return { blocksRef, versionRef, registerHandlers, clearBlocks, toggleCollapse };
}
