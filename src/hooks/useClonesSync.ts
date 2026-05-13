import { useEffect } from "react";
import { useCloneStore } from "../store/cloneStore";
import { subscribeJson } from "../services/transport";

/** Hydrate the clone store on mount and reload whenever the backend
 *  emits `clones-updated` (e.g. after CLI mutations or external edits). */
export function useClonesSync() {
  const hydrate = useCloneStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
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
