use uuid::Uuid;

use crate::hub::{topology::Wire, Role, Team};
use crate::state::AppState;

fn parse_role(s: Option<&str>) -> Role {
    match s.map(|v| v.to_ascii_lowercase()).as_deref() {
        Some("lead") => Role::Lead,
        Some("observer") => Role::Observer,
        _ => Role::Worker,
    }
}

fn emit_teams_updated(state: &AppState) {
    state
        .app_handle
        .emit_json("teams-updated", serde_json::Value::Null);
}

pub fn teams_list_impl(state: &AppState) -> Vec<Team> {
    state.team_registry.list()
}

pub fn teams_team_for_terminal_impl(state: &AppState, term_id: &str) -> Option<Team> {
    state.team_registry.team_for_terminal(term_id)
}

pub fn teams_dissolve_impl(state: &AppState, team_id: &str) -> Result<Vec<String>, String> {
    let evicted = state.team_registry.dissolve(team_id)?;
    {
        let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
        for id in &evicted {
            let _ = mgr.destroy_session(id);
        }
    }
    for id in &evicted {
        state.topology.remove_for_terminal(id);
        state.identities.remove(id);
    }
    emit_teams_updated(state);
    Ok(evicted)
}

pub fn teams_create_impl(
    state: &AppState,
    name: &str,
    palette: Option<&str>,
    as_lead: Option<bool>,
    caller_term_id: Option<String>,
) -> Result<Team, String> {
    let palette_key = palette.unwrap_or("blue");
    let mut team = state.team_registry.create(name, palette_key, None)?;
    if as_lead.unwrap_or(false) {
        if let Some(id) = caller_term_id.filter(|s| !s.is_empty()) {
            team = state.team_registry.join(&team.id, id, Role::Lead)?;
        }
    }
    emit_teams_updated(state);
    Ok(team)
}

pub fn teams_join_impl(
    state: &AppState,
    team_id: &str,
    term_id: String,
    role: Option<&str>,
) -> Result<Team, String> {
    let r = parse_role(role);
    let is_lead = matches!(r, Role::Lead);
    let existing = state
        .team_registry
        .get(team_id)
        .ok_or_else(|| "not_found".to_string())?;
    let team = state.team_registry.join(team_id, term_id.clone(), r)?;
    let pairs: Vec<(String, String)> = if is_lead {
        existing
            .members
            .iter()
            .map(|m| (term_id.clone(), m.term_id.clone()))
            .collect()
    } else {
        existing
            .members
            .iter()
            .find(|m| matches!(m.role, Role::Lead))
            .map(|m| vec![(m.term_id.clone(), term_id.clone())])
            .unwrap_or_default()
    };
    for (source_id, target_id) in pairs {
        state.topology.insert(Wire {
            id: format!("w_{}", Uuid::new_v4().simple()),
            source_id,
            target_id,
            forward_output: true,
            kind: Some("team".to_string()),
            workspace_id: None,
        });
    }
    emit_teams_updated(state);
    Ok(team)
}

pub fn teams_leave_impl(
    state: &AppState,
    team_id: &str,
    term_id: &str,
) -> Result<Team, String> {
    let team = state.team_registry.leave(team_id, term_id)?;
    emit_teams_updated(state);
    Ok(team)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn teams_list(state: tauri::State<'_, AppState>) -> Vec<Team> {
    teams_list_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn teams_team_for_terminal(
    state: tauri::State<'_, AppState>,
    term_id: String,
) -> Option<Team> {
    teams_team_for_terminal_impl(&state, &term_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn teams_dissolve(
    state: tauri::State<'_, AppState>,
    team_id: String,
) -> Result<Vec<String>, String> {
    teams_dissolve_impl(&state, &team_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn teams_create(
    state: tauri::State<'_, AppState>,
    name: String,
    palette: Option<String>,
    as_lead: Option<bool>,
    caller_term_id: Option<String>,
) -> Result<Team, String> {
    teams_create_impl(&state, &name, palette.as_deref(), as_lead, caller_term_id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn teams_join(
    state: tauri::State<'_, AppState>,
    team_id: String,
    term_id: String,
    role: Option<String>,
) -> Result<Team, String> {
    teams_join_impl(&state, &team_id, term_id, role.as_deref())
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn teams_leave(
    state: tauri::State<'_, AppState>,
    team_id: String,
    term_id: String,
) -> Result<Team, String> {
    teams_leave_impl(&state, &team_id, &term_id)
}
