import { useEffect, useRef } from "react";
import { useWireStore } from "../store/wireStore";
import { listenTerminalOutput } from "../services/tauriEvents";
import { writeTerminal } from "../services/tauriCommands";

export function useWireForwarding() {
  const wiresMap = useWireStore((s) => s.wires);
  const unlistenMapRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const wires = Array.from(wiresMap.values());
    const activeWireIds = new Set<string>();

    for (const wire of wires) {
      if (!wire.forwardOutput) continue;
      activeWireIds.add(wire.id);

      // Skip if already listening
      if (unlistenMapRef.current.has(wire.id)) continue;

      // Subscribe to source terminal output
      const sourceId = wire.sourceId;
      const targetId = wire.targetId;

      listenTerminalOutput(sourceId, (data) => {
        // Forward the output to the target terminal as input
        const bytes = Array.from(data);
        writeTerminal(targetId, bytes).catch(console.error);
      })
        .then((unlisten) => {
          unlistenMapRef.current.set(wire.id, unlisten);
        })
        .catch(console.error);
    }

    // Clean up listeners for removed wires
    for (const [wireId, unlisten] of unlistenMapRef.current) {
      if (!activeWireIds.has(wireId)) {
        unlisten();
        unlistenMapRef.current.delete(wireId);
      }
    }

    return () => {
      // Cleanup all listeners on unmount
      for (const unlisten of unlistenMapRef.current.values()) {
        unlisten();
      }
      unlistenMapRef.current.clear();
    };
  }, [wiresMap]);
}
