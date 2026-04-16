export type TerminalStatus = "starting" | "running" | "idle" | "error" | "terminated";
export type ShellType = "Bash" | "Zsh" | "PowerShell" | "Pwsh" | "Cmd" | "Fish" | "Custom";
export type TerminalTheme = "tokyonight" | "dracula" | "nord" | "monokai" | "solarized";

export interface TerminalNode {
  id: string;
  name: string;
  shellType: ShellType;
  initialCommand?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  isFolded: boolean;
  zIndex: number;
  status: TerminalStatus;
  cols: number;
  rows: number;
  createdAt: number;
  color: string;
  theme: TerminalTheme;
  cwd?: string;
}

export interface ShellInfo {
  path: string;
  name: string;
  shell_type: ShellType;
}

export interface CreateTerminalRequest {
  id: string;
  shell_path?: string;
  command?: string;
  cols: number;
  rows: number;
  cwd?: string;
}
