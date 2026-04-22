export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner_term_id?: string | null;
  created_by: string;
  created_at: number;
  blocked_by: string[];
  acceptance: string[];
  note_id?: string | null;
  workspace_id?: string | null;
}

export interface TaskCreateInput {
  subject: string;
  description?: string;
  owner_term_id?: string | null;
  created_by?: string;
  blocked_by?: string[];
  acceptance?: string[];
  note_id?: string | null;
  workspace_id?: string | null;
}

export interface TaskPatchInput {
  subject?: string;
  description?: string;
  status?: TaskStatus;
  owner_term_id?: string | null;
  blocked_by?: string[];
  acceptance?: string[];
  note_id?: string | null;
}
