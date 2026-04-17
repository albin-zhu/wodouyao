use tauri::{AppHandle, Manager};

use crate::integrations::{self, Agent, IntegrationStatus};

fn resource_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().resource_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn integrations_status() -> Vec<IntegrationStatus> {
    vec![integrations::claude::status(), integrations::codex::status()]
}

#[tauri::command]
pub fn integrations_install(app: AppHandle, agent: String) -> Result<IntegrationStatus, String> {
    let dir = resource_dir(&app)?;
    match agent.as_str() {
        "claude" => integrations::claude::install(&dir),
        "codex" => integrations::codex::install(&dir),
        other => Err(format!("unknown agent: {}", other)),
    }
}

#[tauri::command]
pub fn integrations_uninstall(agent: String) -> Result<IntegrationStatus, String> {
    match agent.as_str() {
        "claude" => integrations::claude::uninstall(),
        "codex" => integrations::codex::uninstall(),
        other => Err(format!("unknown agent: {}", other)),
    }
}

// Allow dead-code analyzer to see Agent through the public re-export chain.
#[allow(dead_code)]
fn _agents() -> [Agent; 2] {
    [Agent::Claude, Agent::Codex]
}
