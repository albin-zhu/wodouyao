import { useEffect } from "react";
import { useTerminalStore } from "../store/terminalStore";

const ACTIVE_WINDOW_MS = 1200;

/** Polls every 500 ms to flip terminal status between "running" and "idle"
 *  based on recent PTY output. Avoids re-rendering every node on each byte. */
export function useTerminalActivity() {
  useEffect(() => {
    const tick = setInterval(() => {
      const { terminals, setStatus } = useTerminalStore.getState();
      const now = Date.now();
      terminals.forEach((t) => {
        if (t.status === "error" || t.status === "terminated") return;
        if (t.lastExitCode !== undefined) return;
        const wasRecent = t.lastOutputAt !== undefined && now - t.lastOutputAt < ACTIVE_WINDOW_MS;
        const target = wasRecent ? "running" : t.status === "starting" ? "starting" : "idle";
        if (t.status !== target) {
          setStatus(t.id, target);
        }
      });
    }, 500);
    return () => clearInterval(tick);
  }, []);
}
