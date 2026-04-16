import { invoke } from "@tauri-apps/api/core";
import type { CreateTerminalRequest, ShellInfo } from "../types/terminal";
import type { Workspace, WorkspaceMeta } from "../types/workspace";
import type { AppSettings } from "../types/settings";

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
