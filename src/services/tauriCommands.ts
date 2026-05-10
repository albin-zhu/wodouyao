import { call } from "./transport";
import type { CreateTerminalRequest, ShellInfo } from "../types/terminal";
import type { Workspace, WorkspaceMeta } from "../types/workspace";
import type { AppSettings } from "../types/settings";
import type { Team } from "../types/team";
import type { Task, TaskCreateInput, TaskPatchInput } from "../types/task";

export async function createTerminal(request: CreateTerminalRequest): Promise<string> {
  return call<string>("create_terminal", { request });
}

export async function destroyTerminal(id: string): Promise<void> {
  return call<void>("destroy_terminal", { id });
}

export async function writeTerminal(id: string, data: number[]): Promise<void> {
  return call<void>("write_terminal", { id, data });
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return call<void>("resize_terminal", { id, cols, rows });
}

export async function saveClipboardImage(data: number[], ext: string): Promise<string> {
  return call<string>("save_clipboard_image", { data, ext });
}

export async function getDefaultShell(): Promise<ShellInfo> {
  return call<ShellInfo>("get_default_shell");
}

export async function listAvailableShells(): Promise<ShellInfo[]> {
  return call<ShellInfo[]>("list_available_shells");
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  return call<void>("save_workspace", { workspace });
}

export async function loadWorkspace(id: string): Promise<Workspace> {
  return call<Workspace>("load_workspace", { id });
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  return call<WorkspaceMeta[]>("list_workspaces");
}

export async function deleteWorkspace(id: string): Promise<void> {
  return call<void>("delete_workspace", { id });
}

/** Partial save for terminal layouts only — fast, debounced path so
 *  drag/resize/rename of a terminal node survives `kill -9` without
 *  waiting on the slower full-workspace autosave. */
export async function saveWorkspaceTerminals(
  id: string,
  terminals: Workspace["terminals"],
): Promise<void> {
  return call<void>("save_workspace_terminals", { id, terminals });
}

export async function getSettings(): Promise<AppSettings> {
  return call<AppSettings>("get_settings");
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return call<void>("update_settings", { settings });
}

export interface CliAgent {
  name: string;
  path: string;
  available: boolean;
}

export async function detectCliAgents(): Promise<CliAgent[]> {
  return call<CliAgent[]>("detect_cli_agents");
}

export interface WireIpc {
  id: string;
  source_id: string;
  target_id: string;
  forward_output: boolean;
  kind?: string | null;
  workspace_id?: string | null;
}

export async function wireList(): Promise<WireIpc[]> {
  return call<WireIpc[]>("wire_list");
}

export async function wireCreate(
  sourceId: string,
  targetId: string,
  kind?: string,
  workspaceId?: string | null
): Promise<WireIpc> {
  return call<WireIpc>("wire_create", {
    sourceId,
    targetId,
    kind: kind ?? null,
    workspaceId: workspaceId ?? null,
  });
}

export async function wireRemove(id: string): Promise<boolean> {
  return call<boolean>("wire_remove", { id });
}

export async function wireReplaceAll(wires: WireIpc[]): Promise<void> {
  return call<void>("wire_replace_all", { wires });
}

export async function wirePeersFor(terminalId: string): Promise<string[]> {
  return call<string[]>("wire_peers_for", { terminalId });
}

export type IntegrationAgent = "claude" | "codex";

export interface IntegrationStatus {
  agent: IntegrationAgent;
  skill_installed: boolean;
  doc_installed: boolean;
}

export async function integrationsStatus(): Promise<IntegrationStatus[]> {
  return call<IntegrationStatus[]>("integrations_status");
}

export async function integrationsInstall(
  agent: IntegrationAgent
): Promise<IntegrationStatus> {
  return call<IntegrationStatus>("integrations_install", { agent });
}

export async function integrationsUninstall(
  agent: IntegrationAgent
): Promise<IntegrationStatus> {
  return call<IntegrationStatus>("integrations_uninstall", { agent });
}

export async function teamsList(): Promise<Team[]> {
  return call<Team[]>("teams_list");
}

export async function teamsTeamForTerminal(
  termId: string
): Promise<Team | null> {
  return call<Team | null>("teams_team_for_terminal", { termId });
}

export async function teamsDissolve(teamId: string): Promise<string[]> {
  return call<string[]>("teams_dissolve", { teamId });
}

export interface TeamsCreateParams {
  name: string;
  palette: string;
  asLead: boolean;
  callerTermId: string | null;
}

export async function teamsCreate(params: TeamsCreateParams): Promise<Team> {
  return call<Team>("teams_create", { ...params });
}

export interface TeamsJoinParams {
  teamId: string;
  termId: string;
  role: "lead" | "worker" | "observer";
}

export async function teamsJoin(params: TeamsJoinParams): Promise<Team> {
  return call<Team>("teams_join", { ...params });
}

export interface TeamsLeaveParams {
  teamId: string;
  termId: string;
}

export async function teamsLeave(params: TeamsLeaveParams): Promise<void> {
  return call<void>("teams_leave", { ...params });
}

// File preview / inspection
export interface DirEntryInfo {
  name: string;
  is_dir: boolean;
}

export interface DirListing {
  entries: DirEntryInfo[];
  truncated: boolean;
}

export interface FileInspect {
  is_dir: boolean;
  size: number;
  exists: boolean;
}

export async function filePreviewText(path: string, maxBytes?: number): Promise<string> {
  return call<string>("file_preview_text", { path, maxBytes: maxBytes ?? null });
}

export async function filePreviewDir(path: string): Promise<DirListing> {
  return call<DirListing>("file_preview_dir", { path });
}

export async function fileInspect(path: string): Promise<FileInspect> {
  return call<FileInspect>("file_inspect", { path });
}

// Tasks
export async function tasksList(): Promise<Task[]> {
  return call<Task[]>("tasks_list");
}

export async function tasksCreate(input: TaskCreateInput): Promise<Task> {
  return call<Task>("tasks_create", { input });
}

export async function tasksUpdate(id: string, patch: TaskPatchInput): Promise<Task> {
  return call<Task>("tasks_update", { id, patch });
}

export async function tasksRemove(id: string): Promise<boolean> {
  return call<boolean>("tasks_remove", { id });
}

// Notes
export interface NoteIpc {
  id: string;
  text: string;
  color: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  z_index: number;
  created_at: number;
  workspace_id?: string | null;
}

export interface NoteCreateInput {
  text?: string;
  color?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  workspace_id?: string | null;
}

export interface NotePatchInput {
  text?: string;
  color?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export async function notesList(): Promise<NoteIpc[]> {
  return call<NoteIpc[]>("notes_list");
}

export async function notesCreate(input: NoteCreateInput): Promise<NoteIpc> {
  return call<NoteIpc>("notes_create", { input });
}

export async function notesUpdate(id: string, patch: NotePatchInput): Promise<NoteIpc | null> {
  return call<NoteIpc | null>("notes_update", { id, patch });
}

export async function notesRemove(id: string): Promise<boolean> {
  return call<boolean>("notes_remove", { id });
}

export async function notesReplaceAll(notes: NoteIpc[]): Promise<void> {
  return call<void>("notes_replace_all", { notes });
}

// File nodes (images, text files, directories dropped on the canvas)
export interface FileNodeIpc {
  id: string;
  path: string;
  name: string;
  kind: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  z_index: number;
  created_at: number;
  workspace_id?: string | null;
}

export interface FileNodeCreateInput {
  id?: string;
  path: string;
  name: string;
  kind: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  workspace_id?: string | null;
}

export interface FileNodePatchInput {
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export async function fileNodesList(): Promise<FileNodeIpc[]> {
  return call<FileNodeIpc[]>("file_nodes_list");
}

export async function fileNodesCreate(input: FileNodeCreateInput): Promise<FileNodeIpc> {
  return call<FileNodeIpc>("file_nodes_create", { input });
}

export async function fileNodesUpdate(
  id: string,
  patch: FileNodePatchInput
): Promise<FileNodeIpc | null> {
  return call<FileNodeIpc | null>("file_nodes_update", { id, patch });
}

export async function fileNodesRemove(id: string): Promise<boolean> {
  return call<boolean>("file_nodes_remove", { id });
}

export async function fileNodesReplaceAll(nodes: FileNodeIpc[]): Promise<void> {
  return call<void>("file_nodes_replace_all", { nodes });
}

// Task boards
export interface TaskBoardIpc {
  id: string;
  label: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  z_index: number;
  created_at: number;
  workspace_id?: string | null;
}

export interface TaskBoardCreateInput {
  id?: string;
  label?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  workspace_id?: string | null;
}

export interface TaskBoardPatchInput {
  label?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

export async function taskBoardsList(): Promise<TaskBoardIpc[]> {
  return call<TaskBoardIpc[]>("task_boards_list");
}

export async function taskBoardsCreate(input: TaskBoardCreateInput): Promise<TaskBoardIpc> {
  return call<TaskBoardIpc>("task_boards_create", { input });
}

export async function taskBoardsUpdate(
  id: string,
  patch: TaskBoardPatchInput
): Promise<TaskBoardIpc | null> {
  return call<TaskBoardIpc | null>("task_boards_update", { id, patch });
}

export async function taskBoardsRemove(id: string): Promise<boolean> {
  return call<boolean>("task_boards_remove", { id });
}

export async function taskBoardsReplaceAll(boards: TaskBoardIpc[]): Promise<void> {
  return call<void>("task_boards_replace_all", { boards });
}

export async function getHubEndpoint(): Promise<{ url: string; token: string }> {
  return call<{ url: string; token: string }>("get_hub_endpoint");
}

/**
 * Send a message to a terminal via the hub /v1/send endpoint.
 * Silently ignores 403 (no wire) so callers don't need to handle missing wires.
 */
export async function hubSend(from: string, to: string, text: string): Promise<void> {
  let endpoint: { url: string; token: string };
  try {
    endpoint = await getHubEndpoint();
  } catch {
    return;
  }
  try {
    await fetch(`${endpoint.url}/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.token}` },
      body: JSON.stringify({ from, to, text, mode: "keys" }),
    });
  } catch {
    // no wire or network error — assign already happened, notification is best-effort
  }
}
