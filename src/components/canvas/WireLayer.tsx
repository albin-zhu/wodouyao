import { useMemo, useCallback, useRef, useState } from "react";
import { useWireStore } from "../../store/wireStore";
import { useTerminalStore } from "../../store/terminalStore";
import { useNoteStore } from "../../store/noteStore";
import { useFileNodeStore } from "../../store/fileNodeStore";
import { useCanvasStore } from "../../store/canvasStore";
import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useTeamStore } from "../../store/teamStore";
import type { Team, Role } from "../../types/team";

const DEFAULT_WIRE_STROKE = "#7aa2f7";

interface WireStyle {
  stroke: string;
  width: number;
  opacity: number;
}

function wireStyle(
  sourceId: string,
  targetId: string,
  termToTeam: Map<string, Team>
): WireStyle {
  const teamA = termToTeam.get(sourceId);
  const teamB = termToTeam.get(targetId);
  const sameTeam = teamA && teamB && teamA.id === teamB.id ? teamA : null;
  if (!sameTeam) {
    return { stroke: DEFAULT_WIRE_STROKE, width: 2, opacity: 1 };
  }
  const roleOf = (id: string): Role | undefined =>
    sameTeam.members.find((m) => m.term_id === id)?.role;
  const rs = roleOf(sourceId);
  const rt = roleOf(targetId);
  const roles = new Set<Role>();
  if (rs) roles.add(rs);
  if (rt) roles.add(rt);
  const base = sameTeam.palette.base;
  if (roles.has("observer")) {
    return { stroke: base, width: 1.5, opacity: 0.5 };
  }
  if (roles.has("lead") && roles.has("worker")) {
    return { stroke: base, width: 3, opacity: 0.9 };
  }
  if (rs === "worker" && rt === "worker") {
    return { stroke: base, width: 2, opacity: 0.7 };
  }
  return { stroke: base, width: 2, opacity: 0.7 };
}

export default function WireLayer() {
  const wiresMap = useWireStore((s) => s.wires);
  const wires = useMemo(() => Array.from(wiresMap.values()), [wiresMap]);
  const removeWire = useWireStore((s) => s.removeWire);
  const terminals = useTerminalStore((s) => s.terminals);
  const notes = useNoteStore((s) => s.notes);
  const fileNodes = useFileNodeStore((s) => s.fileNodes);
  const { panX, panY, zoom } = useCanvasStore();
  const wireStartId = useCanvasInteractionStore((s) => s.wireStartId);
  const wireEndPos = useCanvasInteractionStore((s) => s.wireEndPos);
  const teamsMap = useTeamStore((s) => s.teams);

  // Precompute term_id -> team lookup so wireStyle is O(1) per endpoint.
  const termToTeam = useMemo(() => {
    const map = new Map<string, Team>();
    for (const team of teamsMap.values()) {
      for (const m of team.members) map.set(m.term_id, team);
    }
    return map;
  }, [teamsMap]);

  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  // Tooltip position tracked via ref + imperative DOM update so mousemove
  // doesn't trigger a full WireLayer re-render on every pixel.
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const moveTooltip = useCallback((clientX: number, clientY: number) => {
    const el = tooltipRef.current;
    if (!el) return;
    el.style.left = `${clientX + 12}px`;
    el.style.top = `${clientY + 14}px`;
  }, []);

  const getAnchor = useCallback(
    (nodeId: string, side: "right" | "left") => {
      const t = terminals.get(nodeId);
      if (t) {
        const cy = t.position.y + (t.isFolded ? 18 : t.size.height / 2);
        return side === "right"
          ? { x: t.position.x + t.size.width, y: cy }
          : { x: t.position.x, y: cy };
      }
      const n = notes.get(nodeId);
      if (n) {
        const cy = n.position.y + n.size.height / 2;
        return side === "right"
          ? { x: n.position.x + n.size.width, y: cy }
          : { x: n.position.x, y: cy };
      }
      const f = fileNodes.get(nodeId);
      if (f) {
        const cy = f.position.y + f.size.height / 2;
        return side === "right"
          ? { x: f.position.x + f.size.width, y: cy }
          : { x: f.position.x, y: cy };
      }
      return null;
    },
    [terminals, notes, fileNodes]
  );

  const nodeName = useCallback(
    (nodeId: string): string => {
      return (
        terminals.get(nodeId)?.name ??
        (notes.get(nodeId) ? "Note" : null) ??
        fileNodes.get(nodeId)?.name ??
        nodeId
      );
    },
    [terminals, notes, fileNodes]
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

  const hoveredWire = hoveredWireId
    ? wiresMap.get(hoveredWireId) ?? null
    : null;
  const sourceName = hoveredWire ? nodeName(hoveredWire.sourceId) : "";
  const targetName = hoveredWire ? nodeName(hoveredWire.targetId) : "";

  return (
    <>
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

            const style = wireStyle(wire.sourceId, wire.targetId, termToTeam);
            const wireColor = style.stroke;
            const wireOpacity = style.opacity;
            const wireWidth = style.width;

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
                  onMouseEnter={(e) => {
                    setHoveredWireId(wire.id);
                    moveTooltip(e.clientX, e.clientY);
                  }}
                  onMouseLeave={() => {
                    setHoveredWireId((prev) =>
                      prev === wire.id ? null : prev
                    );
                  }}
                  onMouseMove={(e) => moveTooltip(e.clientX, e.clientY)}
                />
                {/* Visible wire */}
                <path
                  d={path}
                  fill="none"
                  stroke={wireColor}
                  strokeOpacity={wireOpacity}
                  strokeWidth={wireWidth / zoom}
                  strokeDasharray="none"
                  style={{ pointerEvents: "none" }}
                />
                {/* Direction arrow at midpoint */}
                <circle
                  cx={midX}
                  cy={midY}
                  r={4 / zoom}
                  fill={wireColor}
                  fillOpacity={wireOpacity}
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

      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          display: hoveredWire ? "block" : "none",
          background: "#1f2335",
          color: "#c0caf5",
          border: "1px solid #292e42",
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 11,
          lineHeight: 1.4,
          pointerEvents: "none",
          zIndex: 1000,
          whiteSpace: "nowrap",
        }}
      >
        <div>
          {sourceName}  →  {targetName}
        </div>
        <div style={{ color: "#565f89" }}>click to delete</div>
      </div>
    </>
  );
}
