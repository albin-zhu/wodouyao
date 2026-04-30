use serde::Serialize;
use tauri::State;

use crate::hub::server::{
    do_workflow_bootstrap, BootstrapRole, WorkflowBootstrapBody, WorkflowBootstrapResponse,
};
use crate::state::AppState;

#[derive(Serialize)]
pub struct HubEndpoint {
    pub url: String,
    pub token: String,
}

/// Expose the in-process hub URL + auth token to the frontend so renderer
/// code can call hub HTTP routes directly when that's actually wanted.
/// (Most UI calls should prefer the dedicated Tauri commands below — they
/// skip CORS preflight and don't expose the token to fetch().)
#[tauri::command]
pub fn get_hub_endpoint(state: State<'_, AppState>) -> HubEndpoint {
    HubEndpoint {
        url: state.hub.url.clone(),
        token: state.hub.token.clone(),
    }
}

/// In-process workflow bootstrap. Same pure logic the HTTP route uses, but
/// invoked directly via Tauri IPC so the renderer skips CORS preflight on
/// the local hub HTTP server (which doesn't speak OPTIONS and would 401 the
/// preflight).
#[tauri::command]
pub fn bootstrap_workflow(
    state: State<'_, AppState>,
    roles: Vec<BootstrapRole>,
    wire_mesh: Option<bool>,
    cwd: Option<String>,
) -> Result<WorkflowBootstrapResponse, String> {
    let body = WorkflowBootstrapBody {
        roles,
        wire_mesh: wire_mesh.unwrap_or(false),
        cwd,
    };
    do_workflow_bootstrap(body, &state.topology, &state.app_handle)
        .map_err(|(_code, msg)| msg)
}
