import { useMemo } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useWorkspaceStore } from "../../store/workspaceStore";
import TerminalNode from "./TerminalNode";
import DrawPreview from "../canvas/DrawPreview";

export default function TerminalLayer() {
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspace?.id ?? null);
  // Render ALL terminals regardless of workspace — we just hide the ones
  // that belong to other workspaces using display:none. This keeps xterm
  // instances alive (PTY output keeps flowing, scrollback is preserved)
  // so switching back shows the terminal exactly as it was left.
  const terminals = useMemo(() => Array.from(terminalsMap.values()), [terminalsMap]);
  const maximizedId = useMemo(
    () => terminals.find((t) => !!t.prevBounds)?.id ?? null,
    [terminals]
  );
  const { panX, panY, zoom } = useCanvasStore();

  return (
    <div
      id="terminal-layer"
      style={
        {
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
          pointerEvents: "none",
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
            <TerminalNode terminal={t} />
          </div>
        );
      })}
      <DrawPreview />
    </div>
  );
}
