export interface NoteNode {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  text: string;
  color: string;
  createdAt: number;
}
