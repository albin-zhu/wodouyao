use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::hub::{topology::Wire, Role, Team};
use crate::state::AppState;

#[tauri::command]
pub fn teams_list(state: State<'_, AppState>) -> Vec<Team> {
    state.team_registry.list()
}

#[tauri::command]
pub fn teams_team_for_terminal(state: State<'_, AppState>, term_id: String) -> Option<Team> {
    state.team_registry.team_for_terminal(&term_id)
}

#[tauri::command]
pub fn teams_dissolve(
    app: AppHandle,
    state: State<'_, AppState>,
    team_id: String,
) -> Result<Vec<String>, String> {
    let evicted = state.team_registry.dissolve(&team_id)?;
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
    let _ = app.emit("teams-updated", ());
    Ok(evicted)
}

fn parse_role(s: Option<&str>) -> Role {
    match s.map(|v| v.to_ascii_lowercase()).as_deref() {
        Some("lead") => Role::Lead,
        Some("observer") => Role::Observer,
        _ => Role::Worker,
    }
}

#[tauri::command]
pub fn teams_create(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    palette: Option<String>,
    as_lead: Option<bool>,
    caller_term_id: Option<String>,
) -> Result<Team, String> {
    let palette_key = palette.as_deref().unwrap_or("blue");
    let mut team = state.team_registry.create(&name, palette_key)?;
    if as_lead.unwrap_or(false) {
        if let Some(id) = caller_term_id.filter(|s| !s.is_empty()) {
            team = state.team_registry.join(&team.id, id, Role::Lead)?;
        }
    }
    let _ = app.emit("teams-updated", ());
    Ok(team)
}

#[tauri::command]
pub fn teams_join(
    app: AppHandle,
    state: State<'_, AppState>,
    team_id: String,
    term_id: String,
    role: Option<String>,
) -> Result<Team, String> {
    let r = parse_role(role.as_deref());
    let is_lead = matches!(r, Role::Lead);
    // Snapshot existing members BEFORE join so we know who to wire to.
    let existing = state
        .team_registry
        .get(&team_id)
        .ok_or_else(|| "not_found".to_string())?;
    let team = state.team_registry.join(&team_id, term_id.clone(), r)?;
    // Star topology with lead as source: lead → member, never member → lead.
    let pairs: Vec<(String, String)> = if is_lead {
        // new member IS the lead: lead (new) → each existing member
        existing
            .members
            .iter()
            .map(|m| (term_id.clone(), m.term_id.clone()))
            .collect()
    } else {
        // worker/observer joining: existing lead → new member
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
        });
    }
    let _ = app.emit("teams-updated", ());
    Ok(team)
}

#[tauri::command]
pub fn teams_leave(
    app: AppHandle,
    state: State<'_, AppState>,
    team_id: String,
    term_id: String,
) -> Result<Team, String> {
    let team = state.team_registry.leave(&team_id, &term_id)?;
    let _ = app.emit("teams-updated", ());
    Ok(team)
}
