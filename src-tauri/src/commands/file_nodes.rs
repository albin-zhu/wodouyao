use crate::file_nodes::{FileNode, FileNodeCreate, FileNodePatch, FileNodeStore};
use crate::state::AppState;

fn persist_workspace_file_nodes(store: &FileNodeStore, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let nodes = store.filter_for_workspace(ws_id);
    if let Err(e) = crate::workspace::storage::persist_file_nodes_for_workspace(ws_id, &nodes) {
        eprintln!("[ipc] persist file_nodes for workspace {} failed: {}", ws_id, e);
    }
}

pub fn file_nodes_list_impl(state: &AppState) -> Vec<FileNode> {
    state.file_nodes.list()
}

pub fn file_nodes_create_impl(state: &AppState, input: FileNodeCreate) -> FileNode {
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = crate::workspace::storage::current_workspace_id();
    }
    let node = state.file_nodes.create(input);
    persist_workspace_file_nodes(&state.file_nodes, node.workspace_id.as_deref());
    node
}

pub fn file_nodes_update_impl(
    state: &AppState,
    id: &str,
    patch: FileNodePatch,
) -> Option<FileNode> {
    let updated = state.file_nodes.update(id, patch)?;
    persist_workspace_file_nodes(&state.file_nodes, updated.workspace_id.as_deref());
    Some(updated)
}

pub fn file_nodes_remove_impl(state: &AppState, id: &str) -> bool {
    let ws_id = state.file_nodes.get(id).and_then(|n| n.workspace_id);
    let removed = state.file_nodes.remove(id);
    if removed {
        persist_workspace_file_nodes(&state.file_nodes, ws_id.as_deref());
    }
    removed
}

pub fn file_nodes_replace_all_impl(state: &AppState, nodes: Vec<FileNode>) {
    state.file_nodes.replace_all(nodes);
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_nodes_list(state: tauri::State<'_, AppState>) -> Vec<FileNode> {
    file_nodes_list_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_nodes_create(
    state: tauri::State<'_, AppState>,
    input: FileNodeCreate,
) -> FileNode {
    file_nodes_create_impl(&state, input)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_nodes_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: FileNodePatch,
) -> Option<FileNode> {
    file_nodes_update_impl(&state, &id, patch)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_nodes_remove(state: tauri::State<'_, AppState>, id: String) -> bool {
    file_nodes_remove_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_nodes_replace_all(state: tauri::State<'_, AppState>, nodes: Vec<FileNode>) {
    file_nodes_replace_all_impl(&state, nodes);
}
