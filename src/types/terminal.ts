export type TerminalStatus = "starting" | "running" | "idle" | "error" | "terminated";
export type ShellType = "Bash" | "Zsh" | "PowerShell" | "Pwsh" | "Cmd" | "Fish" | "Custom";
export type TerminalTheme = "tokyonight" | "dracula" | "nord" | "monokai" | "solarized";
/** Terminal role is a free-form string. Built-in roles ship in
 *  TERMINAL_ROLES; users can extend via settings.custom_roles. The role
 *  doubles as the key for `wodouyao task next --role X` filtering, so it
 *  should be lowercase identifier-like (e.g. "backend", "pm", "qa"). */
export type TerminalRole = string;

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
  role?: TerminalRole;
  /** Last time the PTY emitted output (ms). In-memory only. */
  lastOutputAt?: number;
  /** Last process exit code, if the shell has terminated. In-memory only. */
  lastExitCode?: number;
  /** Saved position/size to restore from a maximize. Present = currently maximized. */
  prevBounds?: { position: { x: number; y: number }; size: { width: number; height: number } };
  /** Workspace this terminal belongs to. null = legacy / not yet stamped. */
  workspaceId?: string | null;
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
  fast_start?: boolean;
}
