use uuid::Uuid;

use crate::hub::{Wire, WireTopology};
use crate::state::AppState;

fn persist_workspace_wires(topology: &WireTopology, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let wires = topology.filter_for_workspace(ws_id);
    if let Err(e) = crate::workspace::storage::persist_wires_for_workspace(ws_id, &wires) {
        eprintln!("[ipc] persist wires for workspace {} failed: {}", ws_id, e);
    }
}

pub fn wire_list_impl(state: &AppState) -> Vec<Wire> {
    state.topology.list()
}

pub fn wire_create_impl(
    state: &AppState,
    source_id: String,
    target_id: String,
    kind: Option<String>,
    workspace_id: Option<String>,
) -> Wire {
    let workspace_id = workspace_id.or_else(crate::workspace::storage::current_workspace_id);
    let wire = Wire {
        id: Uuid::new_v4().to_string(),
        source_id,
        target_id,
        forward_output: true,
        kind,
        workspace_id,
    };
    let inserted = state.topology.insert(wire);
    persist_workspace_wires(&state.topology, inserted.workspace_id.as_deref());
    inserted
}

pub fn wire_remove_impl(state: &AppState, id: &str) -> bool {
    let ws_id = state
        .topology
        .list()
        .into_iter()
        .find(|w| w.id == id)
        .and_then(|w| w.workspace_id);
    let removed = state.topology.remove(id);
    if removed {
        persist_workspace_wires(&state.topology, ws_id.as_deref());
    }
    removed
}

pub fn wire_replace_all_impl(state: &AppState, wires: Vec<Wire>) {
    state.topology.replace_all(wires);
}

pub fn wire_peers_for_impl(state: &AppState, terminal_id: &str) -> Vec<String> {
    state.topology.peers_for(terminal_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn wire_list(state: tauri::State<'_, AppState>) -> Vec<Wire> {
    wire_list_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn wire_create(
    state: tauri::State<'_, AppState>,
    source_id: String,
    target_id: String,
    kind: Option<String>,
    workspace_id: Option<String>,
) -> Wire {
    wire_create_impl(&state, source_id, target_id, kind, workspace_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn wire_remove(state: tauri::State<'_, AppState>, id: String) -> bool {
    wire_remove_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn wire_replace_all(state: tauri::State<'_, AppState>, wires: Vec<Wire>) {
    wire_replace_all_impl(&state, wires);
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn wire_peers_for(state: tauri::State<'_, AppState>, terminal_id: String) -> Vec<String> {
    wire_peers_for_impl(&state, &terminal_id)
}
