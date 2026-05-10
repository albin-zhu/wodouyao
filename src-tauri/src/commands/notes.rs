use crate::notes::{Note, NoteCreate, NotePatch, NoteStore};
use crate::state::AppState;

fn emit_notes_updated(state: &AppState) {
    state
        .app_handle
        .emit_json("notes-updated", serde_json::Value::Null);
}

/// Mirror of the hub's persistence hook for IPC-driven note mutations.
/// See workspace::storage::persist_notes_for_workspace for the rationale.
fn persist_workspace_notes(store: &NoteStore, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let notes = store.filter_for_workspace(ws_id);
    if let Err(e) = crate::workspace::storage::persist_notes_for_workspace(ws_id, &notes) {
        eprintln!("[ipc] persist notes for workspace {} failed: {}", ws_id, e);
    }
}

pub fn notes_list_impl(state: &AppState) -> Vec<Note> {
    state.notes.list()
}

pub fn notes_create_impl(state: &AppState, input: NoteCreate) -> Note {
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = crate::workspace::storage::current_workspace_id();
    }
    let note = state.notes.create(input);
    persist_workspace_notes(&state.notes, note.workspace_id.as_deref());
    emit_notes_updated(state);
    note
}

pub fn notes_update_impl(state: &AppState, id: &str, patch: NotePatch) -> Option<Note> {
    let updated = state.notes.update(id, patch)?;
    persist_workspace_notes(&state.notes, updated.workspace_id.as_deref());
    emit_notes_updated(state);
    Some(updated)
}

pub fn notes_remove_impl(state: &AppState, id: &str) -> bool {
    let ws_id = state.notes.get(id).and_then(|n| n.workspace_id);
    let removed = state.notes.remove(id);
    if removed {
        persist_workspace_notes(&state.notes, ws_id.as_deref());
        emit_notes_updated(state);
    }
    removed
}

pub fn notes_replace_all_impl(state: &AppState, notes: Vec<Note>) {
    state.notes.replace_all(notes);
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn notes_list(state: tauri::State<'_, AppState>) -> Vec<Note> {
    notes_list_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn notes_create(state: tauri::State<'_, AppState>, input: NoteCreate) -> Note {
    notes_create_impl(&state, input)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn notes_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: NotePatch,
) -> Option<Note> {
    notes_update_impl(&state, &id, patch)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn notes_remove(state: tauri::State<'_, AppState>, id: String) -> bool {
    notes_remove_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn notes_replace_all(state: tauri::State<'_, AppState>, notes: Vec<Note>) {
    notes_replace_all_impl(&state, notes);
}
