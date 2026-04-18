mod commands;
pub mod hub;
mod integrations;
pub mod pty;
mod settings;
mod state;
pub mod workspace;

use std::sync::{Arc, Mutex, OnceLock};

use hub::{server, AppHandleSlot, IdentityRegistry, TeamRegistry, WireTopology};
use pty::manager::PtyManager;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let topology = WireTopology::new();
    let identities = IdentityRegistry::new();
    let team_registry = TeamRegistry::new();
    let pty_manager = Arc::new(Mutex::new(PtyManager::new()));
    let app_handle_slot: AppHandleSlot = Arc::new(OnceLock::new());
    let hub_handle = server::start(
        topology.clone(),
        identities.clone(),
        team_registry.clone(),
        pty_manager.clone(),
        app_handle_slot.clone(),
    )
    .expect("failed to start hub server");
    log::info!("hub listening at {}", hub_handle.url);

    let app_state = AppState::new(hub_handle, pty_manager, topology, identities, team_registry);
    let setup_slot = app_handle_slot.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .setup(move |app| {
            use tauri::Manager;
            let _ = setup_slot.set(app.handle().clone());
            if let Ok(resource_dir) = app.path().resource_dir() {
                match integrations::claude::install(&resource_dir) {
                    Ok(status) => log::info!("claude install: {:?}", status),
                    Err(e) => log::warn!("claude install failed: {}", e),
                }
            }

            // On macOS, Tauri's default menu binds Cmd+W to "Close Window".
            // Replace it with a custom menu that omits that item, so Cmd+W
            // does nothing (matches our canvas-as-single-surface UX).
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};
                let app_name = app.package_info().name.clone();
                let app_menu = SubmenuBuilder::new(app, &app_name)
                    .about(Some(AboutMetadata::default()))
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .fullscreen()
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu])
                    .build()?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
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
            commands::wire::wire_list,
            commands::wire::wire_create,
            commands::wire::wire_remove,
            commands::wire::wire_replace_all,
            commands::wire::wire_peers_for,
            commands::integrations::integrations_status,
            commands::integrations::integrations_install,
            commands::integrations::integrations_uninstall,
            commands::team::teams_list,
            commands::team::teams_team_for_terminal,
            commands::team::teams_dissolve,
            commands::team::teams_create,
            commands::team::teams_join,
            commands::team::teams_leave,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
