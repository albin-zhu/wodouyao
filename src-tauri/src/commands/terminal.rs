use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::pty::shell;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateTerminalRequest {
    pub id: String,
    pub shell_path: Option<String>,
    pub command: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub cwd: Option<String>,
}

#[tauri::command]
pub fn create_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    request: CreateTerminalRequest,
) -> Result<String, String> {
    let shell_path = request
        .shell_path
        .unwrap_or_else(|| shell::detect_default_shell().path);

    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.set_app_handle(app);
    manager.create_session(
        request.id,
        &shell_path,
        request.command.as_deref(),
        request.cols,
        request.rows,
        request.cwd.as_deref(),
    )
}

#[tauri::command]
pub fn destroy_terminal(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.destroy_session(&id)
}

#[tauri::command]
pub fn write_terminal(state: State<'_, AppState>, id: String, data: Vec<u8>) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write_to_session(&id, &data)
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.resize_session(&id, cols, rows)
}

#[tauri::command]
pub fn get_default_shell() -> shell::ShellInfo {
    shell::detect_default_shell()
}

#[tauri::command]
pub fn list_available_shells() -> Vec<shell::ShellInfo> {
    shell::list_available_shells()
}
