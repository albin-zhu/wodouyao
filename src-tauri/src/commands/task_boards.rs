use tauri::State;

use crate::state::AppState;
use crate::task_boards::{TaskBoard, TaskBoardCreate, TaskBoardPatch};

#[tauri::command]
pub fn task_boards_list(state: State<'_, AppState>) -> Vec<TaskBoard> {
    state.task_boards.list()
}

#[tauri::command]
pub fn task_boards_create(state: State<'_, AppState>, input: TaskBoardCreate) -> TaskBoard {
    state.task_boards.create(input)
}

#[tauri::command]
pub fn task_boards_update(
    state: State<'_, AppState>,
    id: String,
    patch: TaskBoardPatch,
) -> Option<TaskBoard> {
    state.task_boards.update(&id, patch)
}

#[tauri::command]
pub fn task_boards_remove(state: State<'_, AppState>, id: String) -> bool {
    state.task_boards.remove(&id)
}

#[tauri::command]
pub fn task_boards_replace_all(state: State<'_, AppState>, boards: Vec<TaskBoard>) {
    state.task_boards.replace_all(boards);
}
