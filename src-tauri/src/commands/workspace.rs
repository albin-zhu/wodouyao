use tauri::State;

use crate::state::AppState;
use crate::workspace::storage;
use storage::{Workspace, WorkspaceMeta};

#[tauri::command]
pub fn save_workspace(
    state: State<'_, AppState>,
    mut workspace: Workspace,
) -> Result<(), String> {
    // Backend is source of truth for wire topology; overwrite whatever the
    // frontend sent with the live state before persisting.
    workspace.wires = state.topology.list();
    workspace.teams = state.team_registry.list();
    workspace.tasks = state.tasks.list();
    workspace.notes = state.notes.list();
    workspace.file_nodes = state.file_nodes.list();
    workspace.task_boards = state.task_boards.list();
    workspace.web_nodes = state.web_nodes.list();
    storage::save(&workspace)
}

#[tauri::command]
pub fn load_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<Workspace, String> {
    let workspace = storage::load(&id)?;
    state.topology.replace_all(workspace.wires.clone());
    state.team_registry.replace_all(workspace.teams.clone());
    state.tasks.replace_all(workspace.tasks.clone());
    state.notes.replace_all(workspace.notes.clone());
    state.file_nodes.replace_all(workspace.file_nodes.clone());
    state.task_boards.replace_all(workspace.task_boards.clone());
    state.web_nodes.replace_all(workspace.web_nodes.clone());
    Ok(workspace)
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<WorkspaceMeta>, String> {
    storage::list()
}

#[tauri::command]
pub fn delete_workspace(id: String) -> Result<(), String> {
    storage::delete(&id)
}
