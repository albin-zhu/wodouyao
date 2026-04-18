export type FileKind = "image" | "text" | "video" | "directory" | "other";

export interface FileNode {
  id: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  path: string;
  name: string;
  kind: FileKind;
  createdAt: number;
}
