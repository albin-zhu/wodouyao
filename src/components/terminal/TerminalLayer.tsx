import { useMemo } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import TerminalNode from "./TerminalNode";
import DrawPreview from "../canvas/DrawPreview";

export default function TerminalLayer() {
  const terminalsMap = useTerminalStore((s) => s.terminals);
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
      {terminals.map((t) => (
        <div
          key={t.id}
          style={
            maximizedId !== null && t.id !== maximizedId
              ? { visibility: "hidden", pointerEvents: "none" }
              : undefined
          }
        >
          <TerminalNode terminal={t} />
        </div>
      ))}
      <DrawPreview />
    </div>
  );
}
