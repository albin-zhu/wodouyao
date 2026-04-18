use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::hub::{Team, Wire};
use crate::tasks::Task;

#[derive(Serialize, Deserialize, Clone)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Dimensions {
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CanvasState {
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    pub grid_visible: bool,
    pub grid_size: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TerminalNodeLayout {
    pub id: String,
    pub name: String,
    pub shell_type: String,
    pub initial_command: Option<String>,
    pub position: Position,
    pub size: Dimensions,
    pub is_folded: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cwd: Option<String>,
    pub canvas: CanvasState,
    pub terminals: Vec<TerminalNodeLayout>,
    #[serde(default)]
    pub wires: Vec<Wire>,
    #[serde(default)]
    pub teams: Vec<Team>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    pub terminal_count: usize,
    pub updated_at: u64,
}

fn workspaces_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Cannot find data directory")?;
    let dir = base.join("com.wodouyao.app").join("workspaces");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create workspaces dir: {}", e))?;
    Ok(dir)
}

pub fn save(workspace: &Workspace) -> Result<(), String> {
    let dir = workspaces_dir()?;
    let path = dir.join(format!("{}.json", workspace.id));
    let json = serde_json::to_string_pretty(workspace).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Failed to save workspace: {}", e))
}

pub fn load(id: &str) -> Result<Workspace, String> {
    let dir = workspaces_dir()?;
    let path = dir.join(format!("{}.json", id));
    let json = fs::read_to_string(path).map_err(|e| format!("Failed to read workspace: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse workspace: {}", e))
}

pub fn list() -> Result<Vec<WorkspaceMeta>, String> {
    let dir = workspaces_dir()?;
    let mut metas = Vec::new();

    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if entry.path().extension().is_some_and(|ext| ext == "json") {
            if let Ok(json) = fs::read_to_string(entry.path()) {
                if let Ok(ws) = serde_json::from_str::<Workspace>(&json) {
                    metas.push(WorkspaceMeta {
                        id: ws.id,
                        name: ws.name,
                        terminal_count: ws.terminals.len(),
                        updated_at: ws.updated_at,
                    });
                }
            }
        }
    }

    Ok(metas)
}

pub fn delete(id: &str) -> Result<(), String> {
    let dir = workspaces_dir()?;
    let path = dir.join(format!("{}.json", id));
    fs::remove_file(path).map_err(|e| format!("Failed to delete workspace: {}", e))
}
