import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useWireStore } from "../store/wireStore";
import { wireList } from "../services/tauriCommands";
import type { Wire } from "../types/wire";

export function useWiresSync() {
  useEffect(() => {
    const sync = () => {
      wireList()
        .then((wires) => {
          const newMap = new Map<string, Wire>();
          for (const w of wires) {
            newMap.set(w.id, {
              id: w.id,
              sourceId: w.source_id,
              targetId: w.target_id,
              kind: w.kind ?? undefined,
            });
          }
          useWireStore.setState({ wires: newMap });
        })
        .catch(() => {});
    };
    const unlistenPromise = listen("wires-updated", sync);
    return () => {
      unlistenPromise.then((fn) => fn()).catch(() => {});
    };
  }, []);
}
