use crate::integrations::{self, Agent, IntegrationStatus};
use crate::state::AppState;

pub fn integrations_status_impl() -> Vec<IntegrationStatus> {
    vec![integrations::claude::status(), integrations::codex::status()]
}

pub fn integrations_install_impl(
    state: &AppState,
    agent: &str,
) -> Result<IntegrationStatus, String> {
    let dir = state
        .path_resolver
        .resource_dir()
        .map_err(|e| e.to_string())?;
    match agent {
        "claude" => integrations::claude::install(&dir),
        "codex" => integrations::codex::install(&dir),
        other => Err(format!("unknown agent: {}", other)),
    }
}

pub fn integrations_uninstall_impl(agent: &str) -> Result<IntegrationStatus, String> {
    match agent {
        "claude" => integrations::claude::uninstall(),
        "codex" => integrations::codex::uninstall(),
        other => Err(format!("unknown agent: {}", other)),
    }
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn integrations_status() -> Vec<IntegrationStatus> {
    integrations_status_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn integrations_install(
    state: tauri::State<'_, AppState>,
    agent: String,
) -> Result<IntegrationStatus, String> {
    integrations_install_impl(&state, &agent)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn integrations_uninstall(agent: String) -> Result<IntegrationStatus, String> {
    integrations_uninstall_impl(&agent)
}

// Allow dead-code analyzer to see Agent through the public re-export chain.
#[allow(dead_code)]
fn _agents() -> [Agent; 2] {
    [Agent::Claude, Agent::Codex]
}
