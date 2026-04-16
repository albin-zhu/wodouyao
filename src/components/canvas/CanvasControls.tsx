import { useCanvasStore } from "../../store/canvasStore";

export default function CanvasControls() {
  const { zoom, setZoom, resetView } = useCanvasStore();

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        zIndex: 10,
        display: "flex",
        gap: 4,
        background: "#1f2335",
        borderRadius: 8,
        padding: "4px 8px",
        border: "1px solid #292e42",
      }}
    >
      <button
        onClick={() => setZoom(zoom - 0.1, window.innerWidth / 2, window.innerHeight / 2)}
        style={btnStyle}
        title="Zoom out"
      >
        -
      </button>
      <span style={{ color: "#c0caf5", fontSize: 12, minWidth: 40, textAlign: "center", lineHeight: "28px" }}>
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => setZoom(zoom + 0.1, window.innerWidth / 2, window.innerHeight / 2)}
        style={btnStyle}
        title="Zoom in"
      >
        +
      </button>
      <button onClick={resetView} style={btnStyle} title="Reset view">
        R
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #292e42",
  color: "#c0caf5",
  cursor: "pointer",
  borderRadius: 4,
  width: 28,
  height: 28,
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
