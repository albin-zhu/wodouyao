use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;
use crate::tasks::{Task, TaskCreate, TaskPatch};

fn emit_tasks_updated(app: &AppHandle) {
    let _ = app.emit("tasks-updated", ());
}

#[tauri::command]
pub fn tasks_list(state: State<'_, AppState>) -> Vec<Task> {
    state.tasks.list()
}

#[tauri::command]
pub fn tasks_create(
    state: State<'_, AppState>,
    app: AppHandle,
    input: TaskCreate,
) -> Result<Task, String> {
    if input.subject.trim().is_empty() {
        return Err("subject is required".into());
    }
    let task = state.tasks.create(input);
    emit_tasks_updated(&app);
    Ok(task)
}

#[tauri::command]
pub fn tasks_update(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
    patch: TaskPatch,
) -> Result<Task, String> {
    let updated = state
        .tasks
        .update(&id, patch)
        .ok_or_else(|| format!("task {} not found", id))?;
    emit_tasks_updated(&app);
    Ok(updated)
}

#[tauri::command]
pub fn tasks_remove(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<bool, String> {
    let removed = state.tasks.remove(&id);
    if removed {
        emit_tasks_updated(&app);
    }
    Ok(removed)
}
