export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  icon_label: string;
}

export interface TerminalOptions {
  // Font
  font_size: number;
  font_family: string;
  font_weight: string;
  font_weight_bold: string;
  line_height: number;
  letter_spacing: number;
  // Cursor
  cursor_blink: boolean;
  cursor_style: "block" | "underline" | "bar";
  cursor_width: number;
  cursor_inactive_style: "outline" | "block" | "bar" | "underline" | "none";
  // Scrollback
  scrollback: number;
  scroll_sensitivity: number;
  fast_scroll_sensitivity: number;
  fast_scroll_modifier: "none" | "alt" | "ctrl" | "shift";
  smooth_scroll_duration: number;
  // Rendering
  custom_glyphs: boolean;
  draw_bold_text_in_bright_colors: boolean;
  minimum_contrast_ratio: number;
  // Behavior
  mac_option_is_meta: boolean;
  right_click_selects_word: boolean;
  word_separator: string;
}

export const DEFAULT_TERMINAL_OPTIONS: TerminalOptions = {
  font_size: 13,
  // ASCII fonts (guaranteed via bundled JetBrains Mono) come first, then a
  // fall-through chain of high-quality CJK monospace fonts that ship with
  // common OSes or are easy to install. xterm.js looks up each glyph against
  // this chain individually, so Latin chars use JetBrains Mono and CJK chars
  // pick the first installed option.
  font_family:
    "'JetBrains Mono', 'JetBrainsMono Nerd Font Mono', 'SF Mono', 'Cascadia Code', 'Sarasa Term SC', 'Maple Mono CN', 'LXGW WenKai Mono', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Source Han Sans CN', 'Noto Sans Mono CJK SC', monospace",
  font_weight: "normal",
  font_weight_bold: "bold",
  line_height: 1.2,
  letter_spacing: 0,
  cursor_blink: true,
  cursor_style: "block",
  cursor_width: 1,
  cursor_inactive_style: "outline",
  scrollback: 5000,
  scroll_sensitivity: 1,
  fast_scroll_sensitivity: 5,
  fast_scroll_modifier: "alt",
  smooth_scroll_duration: 0,
  custom_glyphs: true,
  draw_bold_text_in_bright_colors: true,
  minimum_contrast_ratio: 1,
  mac_option_is_meta: true,
  right_click_selects_word: false,
  word_separator: " ()[]{}',\"`",
};

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

export type ThemeMode = "system" | "dark" | "light";

export interface AppSettings {
  default_shell_path: string | null;
  font_size: number;
  last_workspace_id: string | null;
  quick_commands: QuickCommand[];
  background: BackgroundSettings;
  skip_create_dialog: boolean;
  wire_empty_spawn_enabled: boolean;
  wire_empty_spawn_command: string;
  language: string;
  env_overrides: EnvOverride[];
  terminal_opacity: number;
  /** @deprecated Use terminal_options.font_size / line_height etc. */
  is_hdpi: boolean;
  theme: ThemeMode;
  terminal_options: TerminalOptions;
  /** Show FPS / frame-time HUD in the bottom-right corner. */
  show_perf_hud: boolean;
  /** Use xterm's WebGL renderer. Faster but its glyph atlas can corrupt
   *  under canvas zoom or DPR changes (especially on WKWebView). Default
   *  is Canvas for reliability; opt in for CPU relief when zooming is rare. */
  terminal_gpu_renderer: boolean;
  /** System-prompt content appended to terminals spawned with role=pm.
   *  Loaded from settings on bootstrap; mirrored to ~/.wodouyao/pm-prompt.md
   *  so users can edit either place. Empty string = use built-in default. */
  pm_prompt: string;
  /** User-defined roles, merged on top of BUILTIN_ROLES at runtime. Each
   *  entry's `key` becomes the lookup id (lowercased identifier). */
  custom_roles: CustomRole[];
}

export interface CustomRole {
  key: string;
  label: string;
  color: string;
  glyph: string;
  hint: string;
  /** Optional system-prompt fragment appended when this role spawns. */
  prompt?: string;
}
