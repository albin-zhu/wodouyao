//! IPC commands for hook runtime telemetry. Hook *config* is read/written
//! via the existing `get_settings` / `update_settings` commands; this module
//! exposes only the in-memory bits (last-fire status, recent runs, test
//! invocation) that don't belong in settings.json.

use std::collections::HashMap;

use crate::hooks::{self, HookRun, HookStats};
use crate::state::AppState;

pub fn hooks_status_impl() -> HashMap<String, HookStats> {
    hooks::stats_snapshot()
}

pub fn hooks_runs_impl(hook_id: &str) -> Vec<HookRun> {
    hooks::runs_for(hook_id)
}

pub fn hooks_test_impl(state: &AppState, hook_id: &str) -> Result<HookRun, String> {
    hooks::fire_test(&state.pty_manager, hook_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn hooks_status() -> HashMap<String, HookStats> {
    hooks_status_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn hooks_runs(hook_id: String) -> Vec<HookRun> {
    hooks_runs_impl(&hook_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn hooks_test(
    state: tauri::State<'_, AppState>,
    hook_id: String,
) -> Result<HookRun, String> {
    hooks_test_impl(&state, &hook_id)
}
