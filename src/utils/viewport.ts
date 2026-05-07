import { useCanvasStore } from "../store/canvasStore";
import { TITLE_BAR_HEIGHT } from "./constants";

export function getViewportCenterWorld(): { x: number; y: number } {
  const { panX, panY, zoom } = useCanvasStore.getState();
  const vw = window.innerWidth;
  const vh = window.innerHeight - TITLE_BAR_HEIGHT;
  const x = (vw / 2 - panX) / zoom;
  const y = (TITLE_BAR_HEIGHT + vh / 2 - panY) / zoom;
  return { x, y };
}

export function getViewportCenteredPosition(
  size: { width: number; height: number },
  staggerIndex = 0,
): { x: number; y: number } {
  const center = getViewportCenterWorld();
  const offset = staggerIndex * 20;
  return {
    x: center.x - size.width / 2 + offset,
    y: center.y - size.height / 2 + offset,
  };
}
