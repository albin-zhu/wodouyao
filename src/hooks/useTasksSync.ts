import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTaskStore } from "../store/taskStore";

export function useTasksSync() {
  useEffect(() => {
    const hydrate = useTaskStore.getState().hydrate;
    hydrate();
    const unlistenPromise = listen("tasks-updated", () => {
      hydrate();
    });
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);
}
