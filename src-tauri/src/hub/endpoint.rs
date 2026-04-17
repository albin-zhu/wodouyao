use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct EndpointFile {
    pub url: String,
    pub token: String,
}

pub fn path() -> PathBuf {
    let pid = std::process::id();
    std::env::temp_dir().join(format!("wodouyao-{}.endpoint", pid))
}

pub fn write(path: &Path, payload: &EndpointFile) -> Result<(), String> {
    let json = serde_json::to_string_pretty(payload).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("write endpoint file: {}", e))?;
    // Best-effort restrict permissions on Unix so other users can't read the token.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn remove(path: &Path) {
    let _ = fs::remove_file(path);
}
