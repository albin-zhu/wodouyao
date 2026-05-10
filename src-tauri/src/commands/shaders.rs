#[cfg(feature = "tauri-runtime")]
use std::fs;

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

/// Copy every `.frag` from the bundled resources/shaders/ into
/// `~/.wodouyao/shaders/` that doesn't already exist there. Called once
/// on app setup so users/agents start with a handful of example shaders
/// and can then add their own. Tauri-only; the headless server does not
/// ship bundled .frag files.
#[cfg(feature = "tauri-runtime")]
pub fn seed_from_resources(app: &AppHandle) -> Result<(), String> {
    let dest = crate::shaders::shaders_dir()?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource dir: {}", e))?;
    let src = resource_dir.join("resources").join("shaders");
    if !src.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&src).map_err(|e| format!("read src: {}", e))? {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("frag") {
            continue;
        }
        let name = match path.file_name() {
            Some(n) => n,
            None => continue,
        };
        let target = dest.join(name);
        if target.exists() {
            continue;
        }
        fs::copy(&path, &target).map_err(|e| format!("copy {}: {}", name.to_string_lossy(), e))?;
    }
    Ok(())
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
