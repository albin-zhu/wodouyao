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
  file_nodes?: WorkspaceFileNodeLayout[];
  task_boards?: WorkspaceTaskBoardLayout[];
  created_at: number;
  updated_at: number;
}

export interface WorkspaceFileNodeLayout {
  id: string;
  path: string;
  name: string;
  kind: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  z_index: number;
  created_at: number;
}

export interface WorkspaceTaskBoardLayout {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  z_index: number;
  created_at: number;
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
  /** Recognized agent CLI on the initial command. Drives resume-on-reopen. */
  agent_kind?: "claude" | "codex" | "shell";
  /** Specific agent session to resume. Optional — uses continue-most-recent if absent. */
  session_id?: string;
  /** Stack order against every other node on the canvas. Shared monotonic
   *  counter across terminals/notes/files/boards — see utils/zIndex. */
  z_index?: number;
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
