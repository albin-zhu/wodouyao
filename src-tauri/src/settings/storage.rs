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
pub struct AppSettings {
    pub default_shell_path: Option<String>,
    pub font_size: u16,
    pub last_workspace_id: Option<String>,
    pub quick_commands: Vec<QuickCommand>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            default_shell_path: None,
            font_size: 14,
            last_workspace_id: None,
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
    let dir = base.join("com.themaestri.app");
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
