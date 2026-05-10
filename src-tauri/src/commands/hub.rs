use serde::Serialize;

use crate::hub::server::{
    do_workflow_bootstrap, BootstrapRole, WorkflowBootstrapBody, WorkflowBootstrapResponse,
};
use crate::state::AppState;

#[derive(Serialize)]
pub struct HubEndpoint {
    pub url: String,
    pub token: String,
}

pub fn get_hub_endpoint_impl(state: &AppState) -> HubEndpoint {
    HubEndpoint {
        url: state.hub.url.clone(),
        token: state.hub.token.clone(),
    }
}

pub fn bootstrap_workflow_impl(
    state: &AppState,
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

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn get_hub_endpoint(state: tauri::State<'_, AppState>) -> HubEndpoint {
    get_hub_endpoint_impl(&state)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn bootstrap_workflow(
    state: tauri::State<'_, AppState>,
    roles: Vec<BootstrapRole>,
    wire_mesh: Option<bool>,
    cwd: Option<String>,
) -> Result<WorkflowBootstrapResponse, String> {
    bootstrap_workflow_impl(&state, roles, wire_mesh, cwd)
}
