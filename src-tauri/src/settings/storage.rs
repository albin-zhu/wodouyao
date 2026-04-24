use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct QuickCommand {
    pub id: String,
    pub label: String,
    pub command: String,
    pub icon_label: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BackgroundSettings {
    pub kind: String,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub particle: Option<String>,
    #[serde(default)]
    pub shader: Option<String>,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
}

fn default_opacity() -> f64 {
    1.0
}

fn default_language() -> String {
    "en".into()
}

fn default_wire_empty_spawn() -> bool {
    true
}

fn default_wire_empty_spawn_command() -> String {
    "claude".into()
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        BackgroundSettings {
            kind: "none".into(),
            source: None,
            particle: Some("matrix".into()),
            shader: None,
            opacity: 1.0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvOverride {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TerminalOptions {
    // Font
    #[serde(default = "default_to_font_size")]
    pub font_size: u16,
    #[serde(default = "default_to_font_family")]
    pub font_family: String,
    #[serde(default = "default_to_font_weight")]
    pub font_weight: String,
    #[serde(default = "default_to_font_weight_bold")]
    pub font_weight_bold: String,
    #[serde(default = "default_to_line_height")]
    pub line_height: f64,
    #[serde(default)]
    pub letter_spacing: f64,
    // Cursor
    #[serde(default = "default_true")]
    pub cursor_blink: bool,
    #[serde(default = "default_to_cursor_style")]
    pub cursor_style: String,
    #[serde(default = "default_to_cursor_width")]
    pub cursor_width: u16,
    #[serde(default = "default_to_cursor_inactive_style")]
    pub cursor_inactive_style: String,
    // Scrollback
    #[serde(default = "default_to_scrollback")]
    pub scrollback: u32,
    #[serde(default = "default_to_scroll_sensitivity")]
    pub scroll_sensitivity: f64,
    #[serde(default = "default_to_fast_scroll_sensitivity")]
    pub fast_scroll_sensitivity: f64,
    #[serde(default = "default_to_fast_scroll_modifier")]
    pub fast_scroll_modifier: String,
    #[serde(default)]
    pub smooth_scroll_duration: u32,
    // Rendering
    #[serde(default = "default_true")]
    pub custom_glyphs: bool,
    #[serde(default = "default_true")]
    pub draw_bold_text_in_bright_colors: bool,
    #[serde(default = "default_to_minimum_contrast_ratio")]
    pub minimum_contrast_ratio: f64,
    // Behavior
    #[serde(default = "default_true")]
    pub mac_option_is_meta: bool,
    #[serde(default)]
    pub right_click_selects_word: bool,
    #[serde(default = "default_to_word_separator")]
    pub word_separator: String,
}

fn default_true() -> bool { true }
fn default_to_font_size() -> u16 { 13 }
fn default_to_font_family() -> String {
    "'JetBrainsMono Nerd Font Mono', 'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', 'Fira Code', 'Consolas', monospace".into()
}
fn default_to_font_weight() -> String { "normal".into() }
fn default_to_font_weight_bold() -> String { "bold".into() }
fn default_to_line_height() -> f64 { 1.2 }
fn default_to_cursor_style() -> String { "block".into() }
fn default_to_cursor_width() -> u16 { 1 }
fn default_to_cursor_inactive_style() -> String { "outline".into() }
fn default_to_scrollback() -> u32 { 5000 }
fn default_to_scroll_sensitivity() -> f64 { 1.0 }
fn default_to_fast_scroll_sensitivity() -> f64 { 5.0 }
fn default_to_fast_scroll_modifier() -> String { "alt".into() }
fn default_to_minimum_contrast_ratio() -> f64 { 1.0 }
fn default_to_word_separator() -> String { " ()[]{}',\"`".into() }

impl Default for TerminalOptions {
    fn default() -> Self {
        TerminalOptions {
            font_size: 13,
            font_family: default_to_font_family(),
            font_weight: "normal".into(),
            font_weight_bold: "bold".into(),
            line_height: 1.2,
            letter_spacing: 0.0,
            cursor_blink: true,
            cursor_style: "block".into(),
            cursor_width: 1,
            cursor_inactive_style: "outline".into(),
            scrollback: 5000,
            scroll_sensitivity: 1.0,
            fast_scroll_sensitivity: 5.0,
            fast_scroll_modifier: "alt".into(),
            smooth_scroll_duration: 0,
            custom_glyphs: true,
            draw_bold_text_in_bright_colors: true,
            minimum_contrast_ratio: 1.0,
            mac_option_is_meta: true,
            right_click_selects_word: false,
            word_separator: " ()[]{}',\"`".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub default_shell_path: Option<String>,
    pub font_size: u16,
    pub last_workspace_id: Option<String>,
    pub quick_commands: Vec<QuickCommand>,
    #[serde(default)]
    pub background: BackgroundSettings,
    /// When true, the "+ Terminal" button skips the create dialog and spawns
    /// directly using the last-used color/theme/shell/fast-start preferences.
    /// Shift+click inverts this behavior per invocation.
    #[serde(default)]
    pub skip_create_dialog: bool,
    /// When true, dragging a wire onto empty canvas auto-spawns a terminal.
    #[serde(default = "default_wire_empty_spawn")]
    pub wire_empty_spawn_enabled: bool,
    /// Command to run in the auto-spawned terminal (e.g. "claude", "codex").
    #[serde(default = "default_wire_empty_spawn_command")]
    pub wire_empty_spawn_command: String,
    #[serde(default = "default_language")]
    pub language: String,
    /// Key/value env vars injected into every spawned terminal. Applied
    /// BEFORE wodouyao's own vars (WODOUYAO_*, PATH), so users can override
    /// HOME/TERM/LANG/etc. but can't clobber wodouyao's protocol plumbing.
    #[serde(default)]
    pub env_overrides: Vec<EnvOverride>,
    #[serde(default = "default_terminal_opacity")]
    pub terminal_opacity: f64,
    #[serde(default = "default_is_hdpi")]
    pub is_hdpi: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub terminal_options: TerminalOptions,
}

fn default_terminal_opacity() -> f64 {
    1.0
}

fn default_is_hdpi() -> bool {
    true
}

fn default_theme() -> String {
    "system".into()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            default_shell_path: None,
            font_size: 14,
            last_workspace_id: None,
            background: BackgroundSettings::default(),
            skip_create_dialog: false,
            wire_empty_spawn_enabled: true,
            wire_empty_spawn_command: "claude".into(),
            language: "en".into(),
            env_overrides: Vec::new(),
            terminal_opacity: 1.0,
            is_hdpi: true,
            theme: "system".into(),
            terminal_options: TerminalOptions::default(),
            quick_commands: vec![
                QuickCommand {
                    id: "claude".into(),
                    label: "Claude".into(),
                    command: "claude".into(),
                    icon_label: "C".into(),
                },
                QuickCommand {
                    id: "codex".into(),
                    label: "Codex".into(),
                    command: "codex".into(),
                    icon_label: "Cx".into(),
                },
                QuickCommand {
                    id: "opencode".into(),
                    label: "OpenCode".into(),
                    command: "opencode".into(),
                    icon_label: "OC".into(),
                },
            ],
        }
    }
}

fn settings_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Cannot find data directory")?;
    let dir = base.join("com.wodouyao.app");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create settings dir: {}", e))?;
    Ok(dir.join("settings.json"))
}

pub fn load() -> Result<AppSettings, String> {
    let path = settings_path()?;
    if !path.exists() {
        let defaults = AppSettings::default();
        save(&defaults)?;
        return Ok(defaults);
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse settings: {}", e))
}

pub fn save(settings: &AppSettings) -> Result<(), String> {
    let path = settings_path()?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Failed to save settings: {}", e))
}
