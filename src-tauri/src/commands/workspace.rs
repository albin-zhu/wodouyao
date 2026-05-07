use tauri::State;

use crate::state::AppState;
use crate::workspace::storage;
use storage::{TerminalNodeLayout, Workspace, WorkspaceMeta};

#[tauri::command]
pub fn save_workspace(
    state: State<'_, AppState>,
    mut workspace: Workspace,
) -> Result<(), String> {
    // Backend is source of truth for entities; overwrite whatever the
    // frontend sent with the slice belonging to this workspace.
    let ws_id = workspace.id.clone();
    workspace.wires = state.topology.filter_for_workspace(&ws_id);
    workspace.teams = state.team_registry.list();
    workspace.tasks = state.tasks.filter_for_workspace(&ws_id);
    workspace.notes = state.notes.filter_for_workspace(&ws_id);
    workspace.file_nodes = state.file_nodes.filter_for_workspace(&ws_id);
    workspace.task_boards = state.task_boards.filter_for_workspace(&ws_id);
    // Stamp every terminal layout with the workspace id (legacy migration).
    for t in workspace.terminals.iter_mut() {
        t.workspace_id = Some(ws_id.clone());
    }
    storage::save(&workspace)
}

#[tauri::command]
pub fn load_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<Workspace, String> {
    let mut workspace = storage::load(&id)?;
    // Legacy migration: stamp any entity that lacks workspace_id with this id
    // so subsequent filter_for_workspace calls find them.
    for t in workspace.terminals.iter_mut() {
        if t.workspace_id.is_none() {
            t.workspace_id = Some(id.clone());
        }
    }
    // Per-workspace upserts: leave other workspaces' state untouched, replace
    // only this workspace's slice. This is what makes hot-switching possible.
    state.topology.upsert_for_workspace(&id, workspace.wires.clone());
    state.tasks.upsert_for_workspace(&id, workspace.tasks.clone());
    state.notes.upsert_for_workspace(&id, workspace.notes.clone());
    state
        .file_nodes
        .upsert_for_workspace(&id, workspace.file_nodes.clone());
    state
        .task_boards
        .upsert_for_workspace(&id, workspace.task_boards.clone());
    // Teams remain global (no workspace_id) for now — they cross workspaces.
    state.team_registry.replace_all(workspace.teams.clone());
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

/// Partial save: write just the `terminals` slice for a workspace.
/// The frontend owns terminal layout (positions, sizes, fold/theme/role
/// state); a debounced effect calls this on every layout mutation so a
/// drag/resize/rename survives `kill -9` without waiting on the slower
/// full-workspace save. Stamps every layout's workspace_id so the on-
/// disk slice is internally consistent.
#[tauri::command]
pub fn save_workspace_terminals(
    id: String,
    mut terminals: Vec<TerminalNodeLayout>,
) -> Result<(), String> {
    for t in terminals.iter_mut() {
        t.workspace_id = Some(id.clone());
    }
    storage::persist_terminals_for_workspace(&id, &terminals)
}
