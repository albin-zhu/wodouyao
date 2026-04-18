export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  icon_label: string;
}

export type BackgroundKind = "none" | "image" | "video" | "url" | "particles";
export type ParticlePreset = "matrix" | "starfield" | "wave" | "dust";

export interface BackgroundSettings {
  kind: BackgroundKind;
  source?: string | null;
  particle?: ParticlePreset | null;
  opacity: number;
}

export interface AppSettings {
  default_shell_path: string | null;
  font_size: number;
  last_workspace_id: string | null;
  quick_commands: QuickCommand[];
  background: BackgroundSettings;
  /** When true, "+ Terminal" skips the dialog and uses last prefs. Shift+click inverts. */
  skip_create_dialog: boolean;
  /** When true, dragging a wire to empty canvas auto-spawns a terminal. */
  wire_empty_spawn_enabled: boolean;
  /** Command to run in the auto-spawned terminal (defaults to "claude"). */
  wire_empty_spawn_command: string;
}
