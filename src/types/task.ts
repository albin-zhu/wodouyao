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
  /** Suggested terminal role (e.g. "backend", "pm"). Used by
   *  `wodouyao task next --role X` and shown as a hint in the TasksDrawer
   *  when no one has claimed the task yet. */
  role_hint?: string | null;
  source?: string | null;
  parent_id?: string | null;
  complexity?: number | null;
  prd_note_id?: string | null;
  /** Filenames under $cwd/.wodouyao/tasks/<id>/docs/. Source of truth is
   *  the on-disk file; this array mirrors it for listing. */
  docs?: string[];
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
  role_hint?: string | null;
  source?: string | null;
  parent_id?: string | null;
  complexity?: number | null;
  prd_note_id?: string | null;
}

export interface TaskPatchInput {
  subject?: string;
  description?: string;
  status?: TaskStatus;
  owner_term_id?: string | null;
  blocked_by?: string[];
  acceptance?: string[];
  note_id?: string | null;
  role_hint?: string | null;
  complexity?: number | null;
  workspace_id?: string;
}
