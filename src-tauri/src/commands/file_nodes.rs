use tauri::State;

use crate::file_nodes::{FileNode, FileNodeCreate, FileNodePatch};
use crate::state::AppState;

#[tauri::command]
pub fn file_nodes_list(state: State<'_, AppState>) -> Vec<FileNode> {
    state.file_nodes.list()
}

#[tauri::command]
pub fn file_nodes_create(state: State<'_, AppState>, input: FileNodeCreate) -> FileNode {
    state.file_nodes.create(input)
}

#[tauri::command]
pub fn file_nodes_update(
    state: State<'_, AppState>,
    id: String,
    patch: FileNodePatch,
) -> Option<FileNode> {
    state.file_nodes.update(&id, patch)
}

#[tauri::command]
pub fn file_nodes_remove(state: State<'_, AppState>, id: String) -> bool {
    state.file_nodes.remove(&id)
}

#[tauri::command]
pub fn file_nodes_replace_all(state: State<'_, AppState>, nodes: Vec<FileNode>) {
    state.file_nodes.replace_all(nodes);
}
