use serde::Serialize;
use tauri::State;

use crate::state::AppState;

#[derive(Serialize)]
pub struct HubEndpoint {
    pub url: String,
    pub token: String,
}

/// Expose the in-process hub URL + auth token to the frontend so renderer
/// code can call hub HTTP routes directly (e.g. workflow bootstrap dialog).
/// The token is the same one written to the on-disk endpoint file that the
/// CLI reads — sharing it with the renderer is safe because the renderer
/// process already has full IPC access.
#[tauri::command]
pub fn get_hub_endpoint(state: State<'_, AppState>) -> HubEndpoint {
    HubEndpoint {
        url: state.hub.url.clone(),
        token: state.hub.token.clone(),
    }
}
