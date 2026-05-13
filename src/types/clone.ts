/** A saved agent snapshot. The `session_id` lets us re-spawn the agent
 *  with `claude -r <id>` so the new terminal inherits the original
 *  context. Mirrors the Rust `clones::Clone` / workspace.clones[] schema. */
export interface Clone {
  id: string;
  name: string;
  description: string;
  agent_kind: string;            // "claude" for now
  session_id: string;
  role_hint?: string | null;
  parent_clone_id?: string | null;
  workspace_id?: string | null;
  created_at: number;            // unix seconds
  last_used_at: number;
  fork_count: number;
  tags: string[];
}

export interface CloneCreateInput {
  name: string;
  description?: string;
  agent_kind?: string;
  session_id: string;
  role_hint?: string | null;
  parent_clone_id?: string | null;
  tags?: string[];
  workspace_id?: string | null;
}

export interface ClonePatchInput {
  name?: string;
  description?: string;
  /** Pass `null` to clear, omit to leave unchanged. */
  role_hint?: string | null;
  tags?: string[];
  /** Set true on each spawn from this clone to bump fork_count and
   *  last_used_at. */
  mark_used?: boolean;
}

export interface CloneValidation {
  valid: boolean;
  reason?: string | null;
}
