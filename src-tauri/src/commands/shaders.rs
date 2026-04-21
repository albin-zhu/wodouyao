use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

fn shaders_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let dir = home.join(".wodouyao").join("shaders");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create shaders dir: {}", e))?;
    Ok(dir)
}

/// Copy every `.frag` from the bundled resources/shaders/ into
/// `~/.wodouyao/shaders/` that doesn't already exist there. Called once
/// on app setup so users/agents start with a handful of example shaders
/// and can then add their own.
pub fn seed_from_resources(app: &AppHandle) -> Result<(), String> {
    let dest = shaders_dir()?;
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

#[tauri::command]
pub fn shaders_list() -> Result<Vec<String>, String> {
    let dir = shaders_dir()?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read: {}", e))? {
        let entry = entry.map_err(|e| format!("entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("frag") {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            out.push(stem.to_string());
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn shaders_get(name: String) -> Result<String, String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("invalid shader name".into());
    }
    let dir = shaders_dir()?;
    let path = dir.join(format!("{}.frag", name));
    if !path.exists() {
        return Err(format!("shader not found: {}", name));
    }
    fs::read_to_string(&path).map_err(|e| format!("read: {}", e))
}

#[tauri::command]
pub fn shaders_dir_path() -> Result<String, String> {
    let dir = shaders_dir()?;
    Ok(dir.to_string_lossy().into_owned())
}
