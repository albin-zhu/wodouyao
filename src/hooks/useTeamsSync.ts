import { useEffect } from "react";
import { useTeamStore } from "../store/teamStore";
import { useWireStore } from "../store/wireStore";
import { subscribeJson } from "../services/transport";

export function useTeamsSync() {
  useEffect(() => {
    const hydrateTeams = useTeamStore.getState().hydrate;
    const hydrateWires = useWireStore.getState().hydrate;
    hydrateTeams();
    // Team mutations (join/leave/spawn/dissolve) can insert/remove wires on
    // the backend's topology directly; refresh the wire mirror so the canvas
    // reflects the new connections.
    const unlistenPromise = subscribeJson("teams-updated", () => {
      hydrateTeams();
      hydrateWires();
    });
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);
}
