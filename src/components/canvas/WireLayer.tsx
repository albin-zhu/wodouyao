import { useMemo, useCallback } from "react";
import { useWireStore } from "../../store/wireStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";

export default function WireLayer() {
  const wiresMap = useWireStore((s) => s.wires);
  const wires = useMemo(() => Array.from(wiresMap.values()), [wiresMap]);
  const removeWire = useWireStore((s) => s.removeWire);
  const terminals = useTerminalStore((s) => s.terminals);
  const { panX, panY, zoom } = useCanvasStore();
  const wireStartId = useCanvasInteractionStore((s) => s.wireStartId);
  const wireEndPos = useCanvasInteractionStore((s) => s.wireEndPos);

  const getAnchor = useCallback(
    (terminalId: string, side: "right" | "left") => {
      const t = terminals.get(terminalId);
      if (!t) return null;
      if (side === "right") {
        return {
          x: t.position.x + t.size.width,
          y: t.position.y + (t.isFolded ? 18 : t.size.height / 2),
        };
      }
      return {
        x: t.position.x,
        y: t.position.y + (t.isFolded ? 18 : t.size.height / 2),
      };
    },
    [terminals]
  );

  const makeBezier = (
    sx: number,
    sy: number,
    tx: number,
    ty: number
  ) => {
    const dx = Math.abs(tx - sx) * 0.4;
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`;
  };

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 5,
        overflow: "visible",
      }}
    >
      <g
        transform={`translate(${panX}, ${panY}) scale(${zoom})`}
        style={{ pointerEvents: "auto" }}
      >
        {/* Existing wires */}
        {wires.map((wire) => {
          const source = getAnchor(wire.sourceId, "right");
          const target = getAnchor(wire.targetId, "left");
          if (!source || !target) return null;

          const path = makeBezier(source.x, source.y, target.x, target.y);
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;

          return (
            <g key={wire.id}>
              {/* Invisible wider path for hover */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12 / zoom}
                style={{ cursor: "pointer" }}
                onClick={() => removeWire(wire.id)}
              />
              {/* Visible wire */}
              <path
                d={path}
                fill="none"
                stroke={wire.forwardOutput ? "#7aa2f7" : "#565f89"}
                strokeWidth={2 / zoom}
                strokeDasharray={wire.forwardOutput ? "none" : `${6 / zoom} ${4 / zoom}`}
                style={{ pointerEvents: "none" }}
              />
              {/* Direction arrow at midpoint */}
              <circle
                cx={midX}
                cy={midY}
                r={4 / zoom}
                fill={wire.forwardOutput ? "#7aa2f7" : "#565f89"}
                style={{ pointerEvents: "none" }}
              />
              {/* Delete button on hover - using a circle with X */}
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  removeWire(wire.id);
                }}
                style={{ cursor: "pointer" }}
                opacity={0}
              >
                <circle cx={midX} cy={midY - 12 / zoom} r={8 / zoom} fill="#f7768e" />
                <text
                  x={midX}
                  y={midY - 12 / zoom + 4 / zoom}
                  textAnchor="middle"
                  fontSize={10 / zoom}
                  fill="white"
                >
                  ×
                </text>
              </g>
            </g>
          );
        })}

        {/* Wire being dragged */}
        {wireStartId && wireEndPos && (() => {
          const source = getAnchor(wireStartId, "right");
          if (!source) return null;
          const path = makeBezier(
            source.x,
            source.y,
            wireEndPos.x,
            wireEndPos.y
          );
          return (
            <path
              d={path}
              fill="none"
              stroke="#7aa2f7"
              strokeWidth={2 / zoom}
              strokeDasharray={`${6 / zoom} ${4 / zoom}`}
              opacity={0.6}
              style={{ pointerEvents: "none" }}
            />
          );
        })()}
      </g>
    </svg>
  );
}
