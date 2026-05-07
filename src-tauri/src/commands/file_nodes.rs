use tauri::State;

use crate::file_nodes::{FileNode, FileNodeCreate, FileNodePatch, FileNodeStore};
use crate::state::AppState;

fn persist_workspace_file_nodes(store: &FileNodeStore, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let nodes = store.filter_for_workspace(ws_id);
    if let Err(e) = crate::workspace::storage::persist_file_nodes_for_workspace(ws_id, &nodes) {
        eprintln!("[ipc] persist file_nodes for workspace {} failed: {}", ws_id, e);
    }
}

#[tauri::command]
pub fn file_nodes_list(state: State<'_, AppState>) -> Vec<FileNode> {
    state.file_nodes.list()
}

#[tauri::command]
pub fn file_nodes_create(state: State<'_, AppState>, input: FileNodeCreate) -> FileNode {
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = crate::workspace::storage::current_workspace_id();
    }
    let node = state.file_nodes.create(input);
    persist_workspace_file_nodes(&state.file_nodes, node.workspace_id.as_deref());
    node
}

#[tauri::command]
pub fn file_nodes_update(
    state: State<'_, AppState>,
    id: String,
    patch: FileNodePatch,
) -> Option<FileNode> {
    let updated = state.file_nodes.update(&id, patch)?;
    persist_workspace_file_nodes(&state.file_nodes, updated.workspace_id.as_deref());
    Some(updated)
}

#[tauri::command]
pub fn file_nodes_remove(state: State<'_, AppState>, id: String) -> bool {
    let ws_id = state.file_nodes.get(&id).and_then(|n| n.workspace_id);
    let removed = state.file_nodes.remove(&id);
    if removed {
        persist_workspace_file_nodes(&state.file_nodes, ws_id.as_deref());
    }
    removed
}

#[tauri::command]
pub fn file_nodes_replace_all(state: State<'_, AppState>, nodes: Vec<FileNode>) {
    state.file_nodes.replace_all(nodes);
}
