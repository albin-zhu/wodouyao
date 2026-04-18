import { invoke } from "@tauri-apps/api/core";
import type { CreateTerminalRequest, ShellInfo } from "../types/terminal";
import type { Workspace, WorkspaceMeta } from "../types/workspace";
import type { AppSettings } from "../types/settings";
import type { Team } from "../types/team";

export async function createTerminal(request: CreateTerminalRequest): Promise<string> {
  return invoke<string>("create_terminal", { request });
}

export async function destroyTerminal(id: string): Promise<void> {
  return invoke<void>("destroy_terminal", { id });
}

export async function writeTerminal(id: string, data: number[]): Promise<void> {
  return invoke<void>("write_terminal", { id, data });
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return invoke<void>("resize_terminal", { id, cols, rows });
}

export async function getDefaultShell(): Promise<ShellInfo> {
  return invoke<ShellInfo>("get_default_shell");
}

export async function listAvailableShells(): Promise<ShellInfo[]> {
  return invoke<ShellInfo[]>("list_available_shells");
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  return invoke<void>("save_workspace", { workspace });
}

export async function loadWorkspace(id: string): Promise<Workspace> {
  return invoke<Workspace>("load_workspace", { id });
}

export async function listWorkspaces(): Promise<WorkspaceMeta[]> {
  return invoke<WorkspaceMeta[]>("list_workspaces");
}

export async function deleteWorkspace(id: string): Promise<void> {
  return invoke<void>("delete_workspace", { id });
}

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function updateSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("update_settings", { settings });
}

export interface CliAgent {
  name: string;
  path: string;
  available: boolean;
}

export async function detectCliAgents(): Promise<CliAgent[]> {
  return invoke<CliAgent[]>("detect_cli_agents");
}

export interface WireIpc {
  id: string;
  source_id: string;
  target_id: string;
  forward_output: boolean;
  kind?: string | null;
}

export async function wireList(): Promise<WireIpc[]> {
  return invoke<WireIpc[]>("wire_list");
}

export async function wireCreate(
  sourceId: string,
  targetId: string,
  kind?: string
): Promise<WireIpc> {
  return invoke<WireIpc>("wire_create", {
    sourceId,
    targetId,
    kind: kind ?? null,
  });
}

export async function wireRemove(id: string): Promise<boolean> {
  return invoke<boolean>("wire_remove", { id });
}

export async function wireReplaceAll(wires: WireIpc[]): Promise<void> {
  return invoke<void>("wire_replace_all", { wires });
}

export async function wirePeersFor(terminalId: string): Promise<string[]> {
  return invoke<string[]>("wire_peers_for", { terminalId });
}

export type IntegrationAgent = "claude" | "codex";

export interface IntegrationStatus {
  agent: IntegrationAgent;
  skill_installed: boolean;
  doc_installed: boolean;
}

export async function integrationsStatus(): Promise<IntegrationStatus[]> {
  return invoke<IntegrationStatus[]>("integrations_status");
}

export async function integrationsInstall(
  agent: IntegrationAgent
): Promise<IntegrationStatus> {
  return invoke<IntegrationStatus>("integrations_install", { agent });
}

export async function integrationsUninstall(
  agent: IntegrationAgent
): Promise<IntegrationStatus> {
  return invoke<IntegrationStatus>("integrations_uninstall", { agent });
}

export async function teamsList(): Promise<Team[]> {
  return invoke<Team[]>("teams_list");
}

export async function teamsTeamForTerminal(
  termId: string
): Promise<Team | null> {
  return invoke<Team | null>("teams_team_for_terminal", { termId });
}

export async function teamsDissolve(teamId: string): Promise<string[]> {
  return invoke<string[]>("teams_dissolve", { teamId });
}

export interface TeamsCreateParams {
  name: string;
  palette: string;
  asLead: boolean;
  callerTermId: string | null;
}

export async function teamsCreate(params: TeamsCreateParams): Promise<Team> {
  return invoke<Team>("teams_create", { ...params });
}

export interface TeamsJoinParams {
  teamId: string;
  termId: string;
  role: "lead" | "worker" | "observer";
}

export async function teamsJoin(params: TeamsJoinParams): Promise<Team> {
  return invoke<Team>("teams_join", { ...params });
}

export interface TeamsLeaveParams {
  teamId: string;
  termId: string;
}

export async function teamsLeave(params: TeamsLeaveParams): Promise<void> {
  return invoke<void>("teams_leave", { ...params });
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
  return invoke<string>("file_preview_text", { path, maxBytes: maxBytes ?? null });
}

export async function filePreviewDir(path: string): Promise<DirListing> {
  return invoke<DirListing>("file_preview_dir", { path });
}

export async function fileInspect(path: string): Promise<FileInspect> {
  return invoke<FileInspect>("file_inspect", { path });
}
