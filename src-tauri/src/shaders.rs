//! Shader storage in `~/.wodouyao/shaders/` — runtime-agnostic file
//! operations shared by the Tauri commands (`commands::shaders`) and the
//! hub HTTP route. The `seed_from_resources` step that copies bundled
//! .frag files into the user dir lives in `commands::shaders` because it
//! needs `app.path().resource_dir()` (Tauri-only setup hook).

use std::fs;
use std::path::PathBuf;

pub fn shaders_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let dir = home.join(".wodouyao").join("shaders");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create shaders dir: {}", e))?;
    Ok(dir)
}

pub fn list() -> Result<Vec<String>, String> {
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

pub fn get(name: &str) -> Result<String, String> {
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

pub fn dir_path() -> Result<String, String> {
    let dir = shaders_dir()?;
    Ok(dir.to_string_lossy().into_owned())
}
