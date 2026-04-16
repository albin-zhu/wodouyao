export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  icon_label: string;
}

export interface AppSettings {
  default_shell_path: string | null;
  font_size: number;
  last_workspace_id: string | null;
  quick_commands: QuickCommand[];
}
