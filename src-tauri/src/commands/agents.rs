use serde::Serialize;
use std::process::Command;

#[derive(Serialize, Clone)]
pub struct CliAgent {
    pub name: String,
    pub path: String,
    pub available: bool,
}

#[tauri::command]
pub fn detect_cli_agents() -> Vec<CliAgent> {
    let agent_names = ["claude", "codex", "opencode"];
    let mut agents = Vec::new();

    for name in &agent_names {
        let (available, path) = find_in_path(name);
        agents.push(CliAgent {
            name: name.to_string(),
            path,
            available,
        });
    }

    agents
}

fn find_in_path(name: &str) -> (bool, String) {
    #[cfg(target_os = "windows")]
    let cmd = Command::new("where").arg(name).output();

    #[cfg(not(target_os = "windows"))]
    let cmd = Command::new("which").arg(name).output();

    match cmd {
        Ok(output) if output.status.success() => {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            (true, path)
        }
        _ => (false, String::new()),
    }
}
