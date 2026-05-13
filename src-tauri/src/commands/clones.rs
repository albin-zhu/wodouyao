//! IPC for the workspace clone library. The frontend reads a workspace's
//! clone list to populate pickers and trees, creates clones from a live
//! agent terminal's session, and bumps usage stats after spawning from one.

use crate::clones::{Clone, CloneCreate, ClonePatch};
use crate::state::AppState;
use crate::workspace::storage as workspace;

fn emit_clones_updated(state: &AppState) {
    state
        .app_handle
        .emit_json("clones-updated", serde_json::Value::Null);
}

fn persist_workspace_clones(state: &AppState, ws_id: Option<&str>) {
    let Some(ws_id) = ws_id else { return };
    let clones = state.clones.filter_for_workspace(ws_id);
    if let Err(e) = workspace::persist_clones_for_workspace(ws_id, &clones) {
        eprintln!("[ipc] persist clones for workspace {} failed: {}", ws_id, e);
    }
}

pub fn clones_list_impl(state: &AppState) -> Vec<Clone> {
    state.clones.list()
}

pub fn clones_create_impl(state: &AppState, input: CloneCreate) -> Result<Clone, String> {
    if input.name.trim().is_empty() {
        return Err("name is required".into());
    }
    if input.session_id.trim().is_empty() {
        return Err("session_id is required".into());
    }
    let mut input = input;
    if input.workspace_id.is_none() {
        input.workspace_id = workspace::current_workspace_id();
    }
    // A clone without workspace_id won't survive restart — the persistence
    // layer is workspace-scoped. Fail loudly instead of silently dropping
    // the metadata to disk-less in-memory only.
    if input.workspace_id.is_none() {
        return Err(
            "no active workspace — load or create one before saving clones".into(),
        );
    }
    let ws_id = input.workspace_id.clone();
    let clone = state.clones.create(input);
    persist_workspace_clones(state, ws_id.as_deref());
    emit_clones_updated(state);
    Ok(clone)
}

pub fn clones_update_impl(
    state: &AppState,
    id: &str,
    patch: ClonePatch,
) -> Result<Clone, String> {
    let updated = state
        .clones
        .update(id, patch)
        .ok_or_else(|| format!("clone {} not found", id))?;
    let ws_id = state.clones.workspace_of(id);
    persist_workspace_clones(state, ws_id.as_deref());
    emit_clones_updated(state);
    Ok(updated)
}

pub fn clones_remove_impl(state: &AppState, id: &str) -> Result<bool, String> {
    let ws_id = state.clones.workspace_of(id);
    let removed = state.clones.remove(id);
    if removed {
        persist_workspace_clones(state, ws_id.as_deref());
        emit_clones_updated(state);
    }
    Ok(removed)
}

#[derive(serde::Serialize)]
pub struct CloneValidation {
    pub valid: bool,
    pub reason: Option<String>,
}

/// Fork a clone's session — copy the parent JSONL to a fresh UUID and
/// return that new id. Used by the spawn-from-clone path so each instance
/// runs against an independent session file (true OO semantics: spawning
/// from a Class doesn't mutate the Class).
pub fn clones_fork_session_impl(state: &AppState, id: &str) -> Result<String, String> {
    let clone = state
        .clones
        .get(id)
        .ok_or_else(|| format!("clone {} not found", id))?;
    if clone.agent_kind != "claude" {
        return Err(format!(
            "fork unsupported for agent_kind {}",
            clone.agent_kind
        ));
    }
    let cwd = state
        .clones
        .workspace_of(id)
        .and_then(|ws| workspace_cwd(&ws))
        .ok_or_else(|| "workspace cwd not found".to_string())?;
    let new_session_id = crate::clones::fork_claude_session(&cwd, &clone.session_id)?;
    // Bump usage stats on the parent so the drawer surfaces hot clones.
    state.clones.update(
        id,
        crate::clones::ClonePatch {
            mark_used: true,
            ..Default::default()
        },
    );
    let ws_id = state.clones.workspace_of(id);
    persist_workspace_clones(state, ws_id.as_deref());
    emit_clones_updated(state);
    Ok(new_session_id)
}

pub fn clones_validate_impl(state: &AppState, id: &str) -> CloneValidation {
    let Some(clone) = state.clones.get(id) else {
        return CloneValidation {
            valid: false,
            reason: Some("clone not found".into()),
        };
    };
    if clone.agent_kind != "claude" {
        return CloneValidation {
            valid: false,
            reason: Some(format!("unsupported agent_kind {}", clone.agent_kind)),
        };
    }
    // The session JSONL lives under the workspace's cwd. Look it up.
    let cwd = state
        .clones
        .workspace_of(id)
        .and_then(|ws| workspace_cwd(&ws));
    let Some(cwd) = cwd else {
        return CloneValidation {
            valid: false,
            reason: Some("workspace cwd not found".into()),
        };
    };
    let valid = crate::clones::validate_claude_session(&cwd, &clone.session_id);
    CloneValidation {
        valid,
        reason: if valid {
            None
        } else {
            Some(format!(
                "claude session file missing for {}",
                &clone.session_id
            ))
        },
    }
}

fn workspace_cwd(ws_id: &str) -> Option<String> {
    let path = dirs::data_dir()?
        .join("com.wodouyao.app")
        .join("workspaces.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    v.get("entries")?
        .as_array()?
        .iter()
        .find(|e| e.get("id").and_then(|x| x.as_str()) == Some(ws_id))
        .and_then(|e| e.get("cwd").and_then(|x| x.as_str()))
        .map(str::to_string)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn clones_list(state: tauri::State<'_, AppState>) -> Vec<Clone> {
    clones_list_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn clones_create(
    state: tauri::State<'_, AppState>,
    input: CloneCreate,
) -> Result<Clone, String> {
    clones_create_impl(&state, input)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn clones_update(
    state: tauri::State<'_, AppState>,
    id: String,
    patch: ClonePatch,
) -> Result<Clone, String> {
    clones_update_impl(&state, &id, patch)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn clones_remove(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    clones_remove_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn clones_validate(
    state: tauri::State<'_, AppState>,
    id: String,
) -> CloneValidation {
    clones_validate_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn clones_fork_session(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, String> {
    clones_fork_session_impl(&state, &id)
}
