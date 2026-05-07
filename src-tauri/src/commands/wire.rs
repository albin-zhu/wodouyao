use tauri::State;
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

#[tauri::command]
pub fn wire_list(state: State<'_, AppState>) -> Vec<Wire> {
    state.topology.list()
}

#[tauri::command]
pub fn wire_create(
    state: State<'_, AppState>,
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

#[tauri::command]
pub fn wire_remove(state: State<'_, AppState>, id: String) -> bool {
    let ws_id = state
        .topology
        .list()
        .into_iter()
        .find(|w| w.id == id)
        .and_then(|w| w.workspace_id);
    let removed = state.topology.remove(&id);
    if removed {
        persist_workspace_wires(&state.topology, ws_id.as_deref());
    }
    removed
}

#[tauri::command]
pub fn wire_replace_all(state: State<'_, AppState>, wires: Vec<Wire>) {
    state.topology.replace_all(wires);
}

#[tauri::command]
pub fn wire_peers_for(state: State<'_, AppState>, terminal_id: String) -> Vec<String> {
    state.topology.peers_for(&terminal_id)
}
