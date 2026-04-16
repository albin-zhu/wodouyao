export interface CanvasState {
  panX: number;
  panY: number;
  zoom: number;
  gridVisible: boolean;
  gridSize: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ViewportBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
