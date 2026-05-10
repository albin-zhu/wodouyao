import { useEffect } from "react";
import { subscribeJson } from "../services/transport";
import { useTerminal } from "./useTerminal";
import { useWireStore } from "../store/wireStore";
import { useTeamStore } from "../store/teamStore";
import { useTerminalStore } from "../store/terminalStore";
import { nextWorkerSlot } from "../utils/teamLayout";
import type { TerminalRole } from "../types/terminal";

interface SpawnRequestPayload {
  id: string;
  name?: string | null;
  kind?: string | null;
  command?: string | null;
  cwd?: string | null;
  auto_wire_from?: string | null;
  team_id?: string | null;
  team_role?: string | null;
  role?: string | null;
}

export function useHubSpawn() {
  const { spawn } = useTerminal();
  const addWire = useWireStore((s) => s.addWire);
  const updateTerminal = useTerminalStore((s) => s.updateTerminal);

  // Mirror session_id updates from the hub into the terminal store so
  // the next workspace save writes it into the layout and reopening can
  // resume with `claude -r <id>`. Driven by `wodouyao terminal set-session`,
  // typically called from a Claude Code SessionStart hook.
  useEffect(() => {
    const unlistenPromise = subscribeJson<{ id: string; session_id: string }>(
      "terminal-session-updated",
      (payload) => {
        const { id, session_id } = payload;
        if (id && session_id) {
          updateTerminal(id, { sessionId: session_id });
        }
      },
    );
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, [updateTerminal]);

  useEffect(() => {
    const unlistenPromise = subscribeJson<SpawnRequestPayload>(
      "hub-spawn-request",
      async (payload) => {
        const p = payload;
        try {
          // If the new terminal joined a team as worker/observer, auto-place
          // it in the next slot of the star layout relative to the lead.
          let position: { x: number; y: number } | undefined;
          if (p.team_id && p.team_role && p.team_role !== "lead") {
            const team = useTeamStore.getState().teams.get(p.team_id);
            const lead = team?.members.find((m) => m.role === "lead");
            const leadNode = lead
              ? useTerminalStore.getState().terminals.get(lead.term_id)
              : undefined;
            if (leadNode) {
              const existingWorkers =
                team?.members.filter(
                  (m) => m.role === "worker" && m.term_id !== p.id
                ).length ?? 0;
              position = nextWorkerSlot(leadNode, existingWorkers);
            }
          }
          await spawn({
            id: p.id,
            name: p.name ?? undefined,
            command: p.command ?? undefined,
            cwd: p.cwd ?? undefined,
            position,
            role: (p.role ?? undefined) as TerminalRole | undefined,
          });
          if (p.auto_wire_from) {
            await addWire(p.auto_wire_from, p.id);
          }
        } catch (e) {
          console.error("[useHubSpawn] spawn failed:", e);
        }
      }
    );
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, [spawn, addWire]);
}
