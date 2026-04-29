import { useEffect } from "react";
import { useTerminalStore } from "../store/terminalStore";

const STARTING_TIMEOUT_MS = 8000;

/**
 * Handles the edge case where a terminal stays in "starting" indefinitely
 * because it never emits output (e.g. the PTY spawned but the shell is hung).
 * The running↔idle transition for active terminals is now event-driven inside
 * terminalStore.markActivity — no polling needed there.
 */
export function useTerminalActivity() {
  useEffect(() => {
    const tick = setInterval(() => {
      const { terminals, setStatus } = useTerminalStore.getState();
      const now = Date.now();
      terminals.forEach((t) => {
        if (t.status !== "starting") return;
        if (t.lastExitCode !== undefined) return;
        // If still "starting" after STARTING_TIMEOUT_MS with no output, flip to idle.
        const stallTime = t.lastOutputAt ?? t.createdAt;
        if (now - stallTime > STARTING_TIMEOUT_MS) {
          setStatus(t.id, "idle");
        }
      });
    }, 2000);
    return () => clearInterval(tick);
  }, []);
}
