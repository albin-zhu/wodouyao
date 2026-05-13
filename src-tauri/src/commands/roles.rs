//! IPC for the role registry. Roles live as md+frontmatter under
//! `~/.wodouyao/roles/` — see `crate::roles` for the parser.

use crate::roles::{self, Role};

pub fn roles_list_impl() -> Vec<Role> {
    roles::list()
}

pub fn roles_dir_path_impl() -> Result<String, String> {
    roles::user_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "no home dir".to_string())
}

pub fn roles_open_dir_impl() -> Result<(), String> {
    let dir = roles::user_dir().ok_or_else(|| "no home dir".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {}", dir.display(), e))?;
    open::that(&dir).map_err(|e| format!("open {}: {}", dir.display(), e))
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn roles_list() -> Vec<Role> {
    roles_list_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn roles_dir_path() -> Result<String, String> {
    roles_dir_path_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn roles_open_dir() -> Result<(), String> {
    roles_open_dir_impl()
}
