use crate::settings::storage::{self, AppSettings};

pub fn get_settings_impl() -> Result<AppSettings, String> {
    storage::load()
}

pub fn update_settings_impl(settings: &AppSettings) -> Result<(), String> {
    storage::save(settings)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    get_settings_impl()
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn update_settings(settings: AppSettings) -> Result<(), String> {
    update_settings_impl(&settings)
}
