#[cfg(feature = "tauri-runtime")]
use tauri::{AppHandle, Manager};

pub fn shaders_list_impl() -> Result<Vec<String>, String> {
    crate::shaders::list()
}

pub fn shaders_get_impl(name: &str) -> Result<String, String> {
    crate::shaders::get(name)
}

pub fn shaders_dir_path_impl() -> Result<String, String> {
    crate::shaders::dir_path()
}

/// Tauri-side wrapper around `crate::shaders::seed_from`: resolves the
/// resource dir from `AppHandle` and delegates. Lives here (not in
/// crate::shaders) because it depends on Tauri APIs.
#[cfg(feature = "tauri-runtime")]
pub fn seed_from_resources(app: &AppHandle) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource dir: {}", e))?;
    crate::shaders::seed_from(&resource_dir)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn shaders_list() -> Result<Vec<String>, String> {
    shaders_list_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn shaders_get(name: String) -> Result<String, String> {
    shaders_get_impl(&name)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn shaders_dir_path() -> Result<String, String> {
    shaders_dir_path_impl()
}
