import { useMemo } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import TerminalNode from "./TerminalNode";
import DrawPreview from "../canvas/DrawPreview";

export default function TerminalLayer() {
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);
  const terminals = useMemo(() => Array.from(terminalsMap.values()), [terminalsMap]);
  const maximizedId = useMemo(
    () => terminals.find((t) => !!t.prevBounds)?.id ?? null,
    [terminals]
  );
  const { panX, panY, zoom } = useCanvasStore();

  return (
    // No CSS transform on this layer — transforms are applied per-node so
    // each xterm WebGL context has its own isolated compositing layer.
    // isolation:isolate ensures a new stacking context for z-index ordering.
    <div
      id="terminal-layer"
      style={
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: "visible",
          pointerEvents: "none",
          isolation: "isolate",
          // Keep --zoom for drag/resize handlers and StatusBadge that read it.
          "--zoom": zoom,
        } as React.CSSProperties
      }
    >
      {terminals.map((t) => {
        const inCurrentWs =
          currentWorkspaceId === null ||
          (t.workspaceId ?? currentWorkspaceId) === currentWorkspaceId;
        const hidden = !inCurrentWs;
        const maximizedHide = maximizedId !== null && t.id !== maximizedId && inCurrentWs;
        return (
          <div
            key={t.id}
            style={
              hidden
                ? { display: "none" }
                : maximizedHide
                ? { visibility: "hidden", pointerEvents: "none" }
                : undefined
            }
          >
            <TerminalNode terminal={t} panX={panX} panY={panY} zoom={zoom} />
          </div>
        );
      })}
      <DrawPreview />
    </div>
  );
}
