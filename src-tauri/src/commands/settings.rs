use crate::settings::storage::{self, AppSettings};

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    storage::load()
}

#[tauri::command]
pub fn update_settings(settings: AppSettings) -> Result<(), String> {
    storage::save(&settings)
}
