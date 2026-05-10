use tauri::State;

use crate::integrations::{self, Agent, IntegrationStatus};
use crate::state::AppState;

#[tauri::command]
pub fn integrations_status() -> Vec<IntegrationStatus> {
    vec![integrations::claude::status(), integrations::codex::status()]
}

#[tauri::command]
pub fn integrations_install(
    state: State<'_, AppState>,
    agent: String,
) -> Result<IntegrationStatus, String> {
    let dir = state
        .path_resolver
        .resource_dir()
        .map_err(|e| e.to_string())?;
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
