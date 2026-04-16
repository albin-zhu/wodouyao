import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";

export default function DrawPreview() {
  const drawRect = useCanvasInteractionStore((s) => s.drawRect);

  if (!drawRect) return null;

  const x = Math.min(drawRect.startX, drawRect.endX);
  const y = Math.min(drawRect.startY, drawRect.endY);
  const w = Math.abs(drawRect.endX - drawRect.startX);
  const h = Math.abs(drawRect.endY - drawRect.startY);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        border: "2px dashed #7aa2f7",
        background: "rgba(122, 162, 247, 0.08)",
        borderRadius: 8,
        pointerEvents: "none",
        zIndex: 999999,
      }}
    >
      <span
        style={{
          position: "absolute",
          bottom: -20,
          right: 0,
          color: "#7aa2f7",
          fontSize: 11,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        {Math.round(w)} × {Math.round(h)}
      </span>
    </div>
  );
}
