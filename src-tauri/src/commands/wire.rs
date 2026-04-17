use tauri::State;
use uuid::Uuid;

use crate::hub::Wire;
use crate::state::AppState;

#[tauri::command]
pub fn wire_list(state: State<'_, AppState>) -> Vec<Wire> {
    state.topology.list()
}

#[tauri::command]
pub fn wire_create(
    state: State<'_, AppState>,
    source_id: String,
    target_id: String,
) -> Wire {
    let wire = Wire {
        id: Uuid::new_v4().to_string(),
        source_id,
        target_id,
        forward_output: true,
    };
    state.topology.insert(wire)
}

#[tauri::command]
pub fn wire_remove(state: State<'_, AppState>, id: String) -> bool {
    state.topology.remove(&id)
}

#[tauri::command]
pub fn wire_replace_all(state: State<'_, AppState>, wires: Vec<Wire>) {
    state.topology.replace_all(wires);
}

#[tauri::command]
pub fn wire_peers_for(state: State<'_, AppState>, terminal_id: String) -> Vec<String> {
    state.topology.peers_for(&terminal_id)
}
