import { useRef, useCallback, useEffect, useState } from "react";
import { Stage, Layer, Line } from "react-konva";
import { useCanvasStore } from "../../store/canvasStore";
import { GRID_SIZE } from "../../utils/constants";

export default function CanvasBackground() {
  const { panX, panY, zoom, gridVisible } = useCanvasStore();
  const stageRef = useRef<ReturnType<typeof Stage> | null>(null);
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setStageSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const gridLines = useCallback(() => {
    if (!gridVisible) return [];
    const lines: React.ReactElement[] = [];
    const scaledGrid = GRID_SIZE * zoom;

    if (scaledGrid < 8) return []; // Too small to render

    const startX = Math.floor((-panX / zoom) / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor((-panY / zoom) / GRID_SIZE) * GRID_SIZE;
    const endX = startX + stageSize.width / zoom + GRID_SIZE * 2;
    const endY = startY + stageSize.height / zoom + GRID_SIZE * 2;

    for (let x = startX; x < endX; x += GRID_SIZE) {
      const screenX = x * zoom + panX;
      lines.push(
        <Line
          key={`v-${x}`}
          points={[screenX, 0, screenX, stageSize.height]}
          stroke="#1a1b26"
          strokeWidth={1}
          opacity={0.5}
        />
      );
    }

    for (let y = startY; y < endY; y += GRID_SIZE) {
      const screenY = y * zoom + panY;
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, screenY, stageSize.width, screenY]}
          stroke="#1a1b26"
          strokeWidth={1}
          opacity={0.5}
        />
      );
    }

    return lines;
  }, [panX, panY, zoom, gridVisible, stageSize]);

  return (
    <Stage
      ref={stageRef as never}
      width={stageSize.width}
      height={stageSize.height}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    >
      <Layer>{gridLines()}</Layer>
    </Stage>
  );
}
