use serde::Deserialize;

use crate::pty::shell;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct CreateTerminalRequest {
    pub id: String,
    pub shell_path: Option<String>,
    pub command: Option<String>,
    pub cols: u16,
    pub rows: u16,
    pub cwd: Option<String>,
    #[serde(default)]
    pub fast_start: bool,
    /// Workspace this terminal belongs to. Plumbed through into
    /// `WODOUYAO_WORKSPACE_ID` in the PTY env so hub-bound operations
    /// (task add, note add, etc.) know which workspace scope to stamp.
    #[serde(default)]
    pub workspace_id: Option<String>,
}

pub fn create_terminal_impl(
    state: &AppState,
    request: CreateTerminalRequest,
) -> Result<String, String> {
    // Idempotency: if a PTY with this id is already alive, treat the
    // call as a re-attach and bail before doing anything destructive.
    // Crucial for browser-refresh / workspace-switch in web mode where
    // the frontend rebuilds its terminal-node Map from the persisted
    // layout and would otherwise nuke the running session each time.
    {
        let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
        if manager.has_session(&request.id) {
            return Ok(request.id);
        }
    }

    let shell_path = request
        .shell_path
        .unwrap_or_else(|| shell::detect_default_shell().path);

    let mut env: Vec<(String, String)> = Vec::new();

    // User-supplied env overrides first so they sit at the bottom of the
    // precedence stack — wodouyao's own vars (pushed below) win, meaning
    // the user can override HOME / TERM / LANG / etc. but can't clobber
    // WODOUYAO_* which the hub protocol relies on. PATH is special-cased:
    // we still PREPEND the wodouyao bin dir to whatever the user supplied
    // (if anything), instead of letting their value silently win and break
    // `wodouyao` discovery.
    let mut user_path: Option<String> = None;
    if let Ok(app_settings) = crate::settings::storage::load() {
        for eo in &app_settings.env_overrides {
            let key = eo.key.trim();
            if key.is_empty() {
                continue;
            }
            if key == "PATH" {
                user_path = Some(eo.value.clone());
                continue;
            }
            env.push((key.to_string(), eo.value.clone()));
        }
    }

    env.push((
        "WODOUYAO_ENDPOINT".to_string(),
        state.hub.endpoint_path.to_string_lossy().into_owned(),
    ));
    env.push(("WODOUYAO_ID".to_string(), request.id.clone()));
    if let Some(ws) = request.workspace_id.as_ref().filter(|s| !s.is_empty()) {
        env.push(("WODOUYAO_WORKSPACE_ID".to_string(), ws.clone()));
    }

    if let Ok(resource_dir) = state.path_resolver.resource_dir() {
        // Tauri copies `bundle.resources` entries preserving their relative
        // path, so `src-tauri/resources/bin/wodouyao` lands at
        // `<resource_dir>/resources/bin/wodouyao` in both dev and bundled
        // builds.
        let bin_dir = resource_dir.join("resources").join("bin");
        let bin_dir_str = bin_dir.to_string_lossy().into_owned();
        let separator = if cfg!(windows) { ';' } else { ':' };
        // Precedence for the base PATH: explicit user override → parent
        // process env → empty. We always PREPEND the wodouyao bin dir so
        // the CLI is discoverable regardless of user config.
        let base_path = user_path
            .filter(|s| !s.is_empty())
            .or_else(|| std::env::var("PATH").ok().filter(|s| !s.is_empty()));
        let new_path = match base_path {
            Some(current) => format!("{}{}{}", bin_dir_str, separator, current),
            None => bin_dir_str,
        };
        env.push(("PATH".to_string(), new_path));
    } else if let Some(p) = user_path {
        // No resource dir (unlikely) — just honor the user's PATH verbatim.
        env.push(("PATH".to_string(), p));
    }

    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.create_session(
        request.id,
        &shell_path,
        request.command.as_deref(),
        request.cols,
        request.rows,
        request.cwd.as_deref(),
        &env,
        request.fast_start,
    )
}

pub fn destroy_terminal_impl(state: &AppState, id: &str) -> Result<(), String> {
    // Kill the PTY first; even if that fails, clean up the hub bookkeeping
    // so peers stop seeing a dead terminal.
    let pty_result = {
        let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
        manager.destroy_session(id)
    };
    state.topology.remove_for_terminal(id);
    state.identities.remove(id);
    pty_result
}

pub fn write_terminal_impl(state: &AppState, id: &str, data: &[u8]) -> Result<(), String> {
    let mut manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.write_to_session(id, data)
}

pub fn resize_terminal_impl(
    state: &AppState,
    id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    manager.resize_session(id, cols, rows)
}

pub fn get_default_shell_impl() -> shell::ShellInfo {
    shell::detect_default_shell()
}

pub fn list_available_shells_impl() -> Vec<shell::ShellInfo> {
    shell::list_available_shells()
}

pub fn save_clipboard_image_impl(data: &[u8], ext: &str) -> Result<String, String> {
    let base = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "cannot locate downloads dir".to_string())?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let safe_ext = ext.trim_start_matches('.').to_string();
    let safe_ext = if safe_ext.is_empty() { "png".into() } else { safe_ext };

    let path = base.join(format!("clipboard-{}.{}", ts, safe_ext));
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    path.to_str()
        .ok_or_else(|| "non-UTF8 path".to_string())
        .map(|s| s.to_string())
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn create_terminal(
    state: tauri::State<'_, AppState>,
    request: CreateTerminalRequest,
) -> Result<String, String> {
    create_terminal_impl(&state, request)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn destroy_terminal(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    destroy_terminal_impl(&state, &id)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn write_terminal(
    state: tauri::State<'_, AppState>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    write_terminal_impl(&state, &id, &data)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn resize_terminal(
    state: tauri::State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    resize_terminal_impl(&state, &id, cols, rows)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn get_default_shell() -> shell::ShellInfo {
    get_default_shell_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn list_available_shells() -> Vec<shell::ShellInfo> {
    list_available_shells_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn save_clipboard_image(data: Vec<u8>, ext: String) -> Result<String, String> {
    save_clipboard_image_impl(&data, &ext)
}
