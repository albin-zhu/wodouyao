import { useMemo } from "react";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import TerminalNode from "./TerminalNode";
import DrawPreview from "../canvas/DrawPreview";

export default function TerminalLayer() {
  const terminalsMap = useTerminalStore((s) => s.terminals);
  const terminals = useMemo(() => Array.from(terminalsMap.values()), [terminalsMap]);
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
        <TerminalNode key={t.id} terminal={t} />
      ))}
      <DrawPreview />
    </div>
  );
}
