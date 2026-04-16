use crate::workspace::storage;
use storage::{Workspace, WorkspaceMeta};

#[tauri::command]
pub fn save_workspace(workspace: Workspace) -> Result<(), String> {
    storage::save(&workspace)
}

#[tauri::command]
pub fn load_workspace(id: String) -> Result<Workspace, String> {
    storage::load(&id)
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<WorkspaceMeta>, String> {
    storage::list()
}

#[tauri::command]
pub fn delete_workspace(id: String) -> Result<(), String> {
    storage::delete(&id)
}
