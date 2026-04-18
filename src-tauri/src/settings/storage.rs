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
            opacity: 1.0,
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
