import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTerminal } from "./useTerminal";
import { useWireStore } from "../store/wireStore";
import { useTeamStore } from "../store/teamStore";
import { useTerminalStore } from "../store/terminalStore";
import { nextWorkerSlot } from "../utils/teamLayout";

interface SpawnRequestPayload {
  id: string;
  name?: string | null;
  kind?: string | null;
  command?: string | null;
  cwd?: string | null;
  auto_wire_from?: string | null;
  team_id?: string | null;
  team_role?: string | null;
}

export function useHubSpawn() {
  const { spawn } = useTerminal();
  const addWire = useWireStore((s) => s.addWire);

  useEffect(() => {
    const unlistenPromise = listen<SpawnRequestPayload>(
      "hub-spawn-request",
      async (event) => {
        const p = event.payload;
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
