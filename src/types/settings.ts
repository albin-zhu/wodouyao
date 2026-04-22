export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  icon_label: string;
}

export type BackgroundKind = "none" | "image" | "video" | "url" | "shader";

export interface BackgroundSettings {
  kind: BackgroundKind;
  source?: string | null;
  /** Shader name (filename stem) under ~/.wodouyao/shaders/<name>.frag. */
  shader?: string | null;
  opacity: number;
}

export interface EnvOverride {
  key: string;
  value: string;
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
  language: string;
  /** Key/value env vars injected into every spawned terminal. User keys
   *  can override HOME/TERM/LANG/etc. but not WODOUYAO_*. */
  env_overrides: EnvOverride[];
  /** Terminal window opacity 0–1. Applies to xterm canvas + title bar
   *  so the canvas background can show through. Default 1.0. */
  terminal_opacity: number;
  /** When true (default), assume an HDPI/Retina display and use thin
   *  hairline borders, antialiased fonts, etc. When false, switch to
   *  thicker borders and subpixel-rendered text optimised for 1x screens. */
  is_hdpi: boolean;
}
