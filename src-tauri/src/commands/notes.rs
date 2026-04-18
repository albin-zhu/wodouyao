use tauri::State;

use crate::notes::{Note, NoteCreate, NotePatch};
use crate::state::AppState;

#[tauri::command]
pub fn notes_list(state: State<'_, AppState>) -> Vec<Note> {
    state.notes.list()
}

#[tauri::command]
pub fn notes_create(state: State<'_, AppState>, input: NoteCreate) -> Note {
    state.notes.create(input)
}

#[tauri::command]
pub fn notes_update(state: State<'_, AppState>, id: String, patch: NotePatch) -> Option<Note> {
    state.notes.update(&id, patch)
}

#[tauri::command]
pub fn notes_remove(state: State<'_, AppState>, id: String) -> bool {
    state.notes.remove(&id)
}

#[tauri::command]
pub fn notes_replace_all(state: State<'_, AppState>, notes: Vec<Note>) {
    state.notes.replace_all(notes);
}
