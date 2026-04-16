export function screenToCanvas(
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: (screenX - panX) / zoom,
    y: (screenY - panY) / zoom,
  };
}

export function canvasToScreen(
  canvasX: number,
  canvasY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } {
  return {
    x: canvasX * zoom + panX,
    y: canvasY * zoom + panY,
  };
}

export function intersects(
  rect: { x: number; y: number; width: number; height: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return (
    rect.x < bounds.maxX &&
    rect.x + rect.width > bounds.minX &&
    rect.y < bounds.maxY &&
    rect.y + rect.height > bounds.minY
  );
}
