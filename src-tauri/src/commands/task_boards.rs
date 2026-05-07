use tauri::State;

use crate::state::AppState;
use crate::task_boards::{TaskBoard, TaskBoardCreate, TaskBoardPatch, TaskBoardStore};

fn persist_workspace_task_boards(store: &TaskBoardStore, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let boards = store.filter_for_workspace(ws_id);
    if let Err(e) = crate::workspace::storage::persist_task_boards_for_workspace(ws_id, &boards)
    {
        eprintln!(
            "[ipc] persist task_boards for workspace {} failed: {}",
            ws_id, e
        );
    }
}

#[tauri::command]
pub fn task_boards_list(state: State<'_, AppState>) -> Vec<TaskBoard> {
    state.task_boards.list()
}

#[tauri::command]
pub fn task_boards_create(state: State<'_, AppState>, input: TaskBoardCreate) -> TaskBoard {
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = crate::workspace::storage::current_workspace_id();
    }
    let board = state.task_boards.create(input);
    persist_workspace_task_boards(&state.task_boards, board.workspace_id.as_deref());
    board
}

#[tauri::command]
pub fn task_boards_update(
    state: State<'_, AppState>,
    id: String,
    patch: TaskBoardPatch,
) -> Option<TaskBoard> {
    let updated = state.task_boards.update(&id, patch)?;
    persist_workspace_task_boards(&state.task_boards, updated.workspace_id.as_deref());
    Some(updated)
}

#[tauri::command]
pub fn task_boards_remove(state: State<'_, AppState>, id: String) -> bool {
    let ws_id = state.task_boards.get(&id).and_then(|b| b.workspace_id);
    let removed = state.task_boards.remove(&id);
    if removed {
        persist_workspace_task_boards(&state.task_boards, ws_id.as_deref());
    }
    removed
}

#[tauri::command]
pub fn task_boards_replace_all(state: State<'_, AppState>, boards: Vec<TaskBoard>) {
    state.task_boards.replace_all(boards);
}
