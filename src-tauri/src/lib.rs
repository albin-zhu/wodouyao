mod commands;
mod pty;
mod settings;
mod state;
mod workspace;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::terminal::create_terminal,
            commands::terminal::destroy_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::get_default_shell,
            commands::terminal::list_available_shells,
            commands::workspace::save_workspace,
            commands::workspace::load_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::delete_workspace,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::agents::detect_cli_agents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
