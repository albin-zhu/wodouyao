export interface TeamPalette {
  key: string;
  base: string;
  members: string[];
}

export type Role = "lead" | "worker" | "observer";

export interface TeamMember {
  term_id: string;
  role: Role;
  joined_at: number;
}

export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner: string | null;
  created_by: string;
  created_at: number;
  blocked_by: string[];
}

export interface Team {
  id: string;
  name: string;
  palette: TeamPalette;
  members: TeamMember[];
  tasks: Task[];
  created_at: number;
}
