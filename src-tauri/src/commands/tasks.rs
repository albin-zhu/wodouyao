use tauri::State;

use crate::state::AppState;
use crate::tasks::{Task, TaskCreate, TaskPatch, TaskStore};

fn emit_tasks_updated(state: &AppState) {
    state
        .app_handle
        .emit_json("tasks-updated", serde_json::Value::Null);
}

/// Mirror of the hub's persistence hook for IPC-driven mutations.
/// See hub::server::persist_workspace_tasks for the rationale.
fn persist_workspace_tasks(store: &TaskStore, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let tasks = store.filter_for_workspace(ws_id);
    if let Err(e) = crate::workspace::storage::persist_tasks_for_workspace(ws_id, &tasks) {
        eprintln!("[ipc] persist tasks for workspace {} failed: {}", ws_id, e);
    }
}

#[tauri::command]
pub fn tasks_list(state: State<'_, AppState>) -> Vec<Task> {
    state.tasks.list()
}

#[tauri::command]
pub fn tasks_create(state: State<'_, AppState>, input: TaskCreate) -> Result<Task, String> {
    if input.subject.trim().is_empty() {
        return Err("subject is required".into());
    }
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = crate::workspace::storage::current_workspace_id();
    }
    let task = state.tasks.create(input);
    persist_workspace_tasks(&state.tasks, task.workspace_id.as_deref());
    emit_tasks_updated(&state);
    Ok(task)
}

#[tauri::command]
pub fn tasks_update(
    state: State<'_, AppState>,
    id: String,
    patch: TaskPatch,
) -> Result<Task, String> {
    let updated = state
        .tasks
        .update(&id, patch)
        .ok_or_else(|| format!("task {} not found", id))?;
    persist_workspace_tasks(&state.tasks, updated.workspace_id.as_deref());
    emit_tasks_updated(&state);
    Ok(updated)
}

#[tauri::command]
pub fn tasks_remove(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let ws_id = state.tasks.get(&id).and_then(|t| t.workspace_id);
    let removed = state.tasks.remove(&id);
    if removed {
        persist_workspace_tasks(&state.tasks, ws_id.as_deref());
        emit_tasks_updated(&state);
    }
    Ok(removed)
}
