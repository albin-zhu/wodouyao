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

pub fn task_boards_list_impl(state: &AppState) -> Vec<TaskBoard> {
    state.task_boards.list()
}

pub fn task_boards_create_impl(state: &AppState, input: TaskBoardCreate) -> TaskBoard {
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = crate::workspace::storage::current_workspace_id();
    }
    let board = state.task_boards.create(input);
    persist_workspace_task_boards(&state.task_boards, board.workspace_id.as_deref());
    board
}

pub fn task_boards_update_impl(
    state: &AppState,
    id: &str,
    patch: TaskBoardPatch,
) -> Option<TaskBoard> {
    let updated = state.task_boards.update(id, patch)?;
    persist_workspace_task_boards(&state.task_boards, updated.workspace_id.as_deref());
    Some(updated)
}

pub fn task_boards_remove_impl(state: &AppState, id: &str) -> bool {
    let ws_id = state.task_boards.get(id).and_then(|b| b.workspace_id);
    let removed = state.task_boards.remove(id);
    if removed {
        persist_workspace_task_boards(&state.task_boards, ws_id.as_deref());
    }
    removed
}

pub fn task_boards_replace_all_impl(state: &AppState, boards: Vec<TaskBoard>) {
    state.task_boards.replace_all(boards);
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn task_boards_list(state: tauri::State<'_, AppState>) -> Vec<TaskBoard> {
    task_boards_list_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn task_boards_create(
    state: tauri::State<'_, AppState>,
    input: TaskBoardCreate,
) -> TaskBoard {
    task_boards_create_impl(&state, input)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn task_boards_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: TaskBoardPatch,
) -> Option<TaskBoard> {
    task_boards_update_impl(&state, &id, patch)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn task_boards_remove(state: tauri::State<'_, AppState>, id: String) -> bool {
    task_boards_remove_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn task_boards_replace_all(
    state: tauri::State<'_, AppState>,
    boards: Vec<TaskBoard>,
) {
    task_boards_replace_all_impl(&state, boards);
}
