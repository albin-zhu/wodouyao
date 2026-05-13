import { useEffect } from "react";
import { useCloneStore } from "../store/cloneStore";
import { useWorkspaceStore } from "../store/workspaceStore";
import { subscribeJson } from "../services/transport";

/** Hydrate the clone store on mount, on workspace switch (the IPC list is
 *  workspace-scoped so a switch invalidates the cached list), and whenever
 *  the backend emits `clones-updated` (CLI mutations or external edits). */
export function useClonesSync() {
  const hydrate = useCloneStore((s) => s.hydrate);
  const currentWsId = useWorkspaceStore((s) => s.currentWorkspace?.id);

  useEffect(() => {
    hydrate();
  }, [hydrate, currentWsId]);

  useEffect(() => {
    let active = true;
    const unlistenP = subscribeJson("clones-updated", () => {
      if (active) hydrate();
    });
    return () => {
      active = false;
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  }, [hydrate]);
}
