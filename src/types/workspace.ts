export interface Workspace {
  id: string;
  name: string;
  cwd?: string;
  canvas: {
    pan_x: number;
    pan_y: number;
    zoom: number;
    grid_visible: boolean;
    grid_size: number;
  };
  terminals: WorkspaceTerminalLayout[];
  wires: WorkspaceWireLayout[];
  tasks?: import("./task").Task[];
  notes?: WorkspaceNoteLayout[];
  created_at: number;
  updated_at: number;
}

export interface WorkspaceTerminalLayout {
  id: string;
  name: string;
  shell_type: string;
  initial_command?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  is_folded: boolean;
  color?: string;
  theme?: string;
  cwd?: string;
  role?: string;
}

export interface WorkspaceWireLayout {
  id: string;
  source_id: string;
  target_id: string;
  forward_output: boolean;
}

export interface WorkspaceNoteLayout {
  id: string;
  text: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  z_index: number;
  created_at: number;
}

export interface WorkspaceMeta {
  id: string;
  name: string;
  terminal_count: number;
  updated_at: number;
}
