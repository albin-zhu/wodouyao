import { useEffect } from "react";
import { useTaskStore } from "../store/taskStore";
import { subscribeJson } from "../services/transport";

export function useTasksSync() {
  useEffect(() => {
    const hydrate = useTaskStore.getState().hydrate;
    hydrate();
    const unlistenPromise = subscribeJson("tasks-updated", () => {
      hydrate();
    });
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);
}
