import { useCanvasInteractionStore } from "../../store/canvasInteractionStore";

export default function DrawPreview() {
  const drawRect = useCanvasInteractionStore((s) => s.drawRect);

  if (!drawRect) return null;

  // World coords — NodeLayer applies the pan/zoom transform once for
  // every child, so we use the rectangle's world-space dimensions
  // directly. Border width is divided by --zoom so it stays visually
  // ~2px regardless of zoom level.
  const wx = Math.min(drawRect.startX, drawRect.endX);
  const wy = Math.min(drawRect.startY, drawRect.endY);
  const ww = Math.abs(drawRect.endX - drawRect.startX);
  const wh = Math.abs(drawRect.endY - drawRect.startY);

  return (
    <div
      style={{
        position: "absolute",
        left: wx,
        top: wy,
        width: ww,
        height: wh,
        border: "calc(2px / var(--zoom, 1)) dashed var(--color-accent)",
        background: "color-mix(in srgb, var(--color-accent) 8%, transparent)",
        borderRadius: 8,
        pointerEvents: "none",
        zIndex: 999999,
      }}
    >
      <span
        style={{
          position: "absolute",
          bottom: "calc(-20px / var(--zoom, 1))",
          right: 0,
          color: "var(--color-accent)",
          fontSize: "calc(11px / var(--zoom, 1))",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        {Math.round(ww)} × {Math.round(wh)}
      </span>
    </div>
  );
}
