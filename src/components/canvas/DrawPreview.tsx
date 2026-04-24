import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";
import { useCanvasStore } from "../../store/canvasStore";

export default function DrawPreview() {
  const drawRect = useCanvasInteractionStore((s) => s.drawRect);
  const { panX, panY, zoom } = useCanvasStore();

  if (!drawRect) return null;

  // drawRect is stored in world coordinates; convert to screen for rendering
  // since TerminalLayer no longer applies a CSS transform.
  const wx = Math.min(drawRect.startX, drawRect.endX);
  const wy = Math.min(drawRect.startY, drawRect.endY);
  const ww = Math.abs(drawRect.endX - drawRect.startX);
  const wh = Math.abs(drawRect.endY - drawRect.startY);

  const x = wx * zoom + panX;
  const y = wy * zoom + panY;
  const w = ww * zoom;
  const h = wh * zoom;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        border: "2px dashed var(--color-accent)",
        background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
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
          color: "var(--color-accent)",
          fontSize: 11,
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        {Math.round(ww)} × {Math.round(wh)}
      </span>
    </div>
  );
}
