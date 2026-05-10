#[cfg(feature = "tauri-runtime")]
mod commands;
pub mod file_nodes;
pub mod hub;
pub mod integrations;
pub mod notes;
pub mod pty;
pub mod runtime;
pub mod settings;
pub mod shaders;
pub mod state;
pub mod task_boards;
pub mod tasks;
pub mod workspace;

#[cfg(feature = "tauri-runtime")]
use std::sync::{Arc, Mutex, OnceLock};

#[cfg(feature = "tauri-runtime")]
use file_nodes::FileNodeStore;
#[cfg(feature = "tauri-runtime")]
use hub::{server, AppHandleSlot, IdentityRegistry, TeamRegistry, WireTopology};
#[cfg(feature = "tauri-runtime")]
use notes::NoteStore;
#[cfg(feature = "tauri-runtime")]
use pty::manager::PtyManager;
#[cfg(feature = "tauri-runtime")]
use runtime::tauri_impl::{TauriEmitter, TauriPathResolver};
#[cfg(feature = "tauri-runtime")]
use runtime::{EventEmitter, PathResolver};
#[cfg(feature = "tauri-runtime")]
use state::AppState;
#[cfg(feature = "tauri-runtime")]
use task_boards::TaskBoardStore;
#[cfg(feature = "tauri-runtime")]
use tasks::TaskStore;

/// On macOS (and to a lesser extent Linux), GUI apps launched from
/// Finder/Dock/Spotlight inherit only launchd's bare environment —
/// PATH is `/usr/bin:/bin:/usr/sbin:/sbin`, no NODE_PATH, no PYENV,
/// no `~/.local/bin`, etc. That breaks every PTY we spawn because it
/// can't find `claude`, `codex`, `node`, the user's shims…
///
/// At startup, run the user's login shell once in interactive mode,
/// dump its env, and merge anything missing into the current process
/// env. From then on, every PTY (and our hub) sees the same PATH the
/// user gets in Terminal.app.
pub fn hydrate_login_shell_env() {
    if std::env::var("WODOUYAO_LOGIN_SHELL_HYDRATED").is_ok() {
        return; // already done in this process
    }
    // On Windows the inherited GUI env is fine; nothing to do.
    if cfg!(windows) {
        return;
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    // -i -l so .zshrc / .bashrc are sourced (PATH lives there for most
    // users who use pyenv / nvm / asdf / homebrew shims).
    let output = std::process::Command::new(&shell)
        .args(["-ilc", "/usr/bin/env"])
        .output();
    let Ok(out) = output else {
        log::warn!("env hydrate: failed to run {} -ilc env", shell);
        return;
    };
    if !out.status.success() {
        log::warn!("env hydrate: {} exited non-zero", shell);
        return;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut imported = 0usize;
    for line in stdout.lines() {
        let Some(eq) = line.find('=') else { continue };
        let key = &line[..eq];
        let val = &line[eq + 1..];
        // Don't trample existing GUI-set vars (the user's launch agents
        // may have set TMPDIR etc. for a reason). Login shell only fills
        // in gaps.
        if std::env::var_os(key).is_none() {
            // SAFETY: single-threaded at this point in startup.
            unsafe {
                std::env::set_var(key, val);
            }
            imported += 1;
        }
    }
    // Always replace PATH with the login shell's — it's the variable that
    // matters most and the launchd-supplied one is almost certainly worse.
    if let Some(path_line) = stdout.lines().find(|l| l.starts_with("PATH=")) {
        let val = &path_line[5..];
        unsafe {
            std::env::set_var("PATH", val);
        }
    }
    unsafe {
        std::env::set_var("WODOUYAO_LOGIN_SHELL_HYDRATED", "1");
    }
    log::info!("env hydrate: imported {} vars from {} -ilc", imported, shell);
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// Force-enable font smoothing (AppleFontSmoothing = 2) for this app
/// only. macOS 10.14+ disabled subpixel AA globally, which makes WebKit
/// text look thin and ugly on non-Retina screens (1x MacBook external
/// monitors, non-Retina MacBooks, scaled "more space" modes). Writing
/// this preference scoped to our bundle id gets the old-style smoothing
/// back without affecting anything else on the user's machine.
#[cfg(target_os = "macos")]
fn enable_macos_font_smoothing() {
    let _ = std::process::Command::new("defaults")
        .args([
            "write",
            "-g",
            "com.wodouyao.app",
            "AppleFontSmoothing",
            "-int",
            "2",
        ])
        .status();
    let _ = std::process::Command::new("defaults")
        .args([
            "write",
            "com.wodouyao.app",
            "AppleFontSmoothing",
            "-int",
            "2",
        ])
        .status();
}

#[cfg(feature = "tauri-runtime")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    hydrate_login_shell_env();
    #[cfg(target_os = "macos")]
    enable_macos_font_smoothing();
    let topology = WireTopology::new();
    let identities = IdentityRegistry::new();
    let team_registry = TeamRegistry::new();
    let task_store = TaskStore::new();
    let note_store = NoteStore::new();
    let file_node_store = FileNodeStore::new();
    let task_board_store = TaskBoardStore::new();
    // Inner OnceLock holds the AppHandle once Tauri's setup hook fires.
    // TauriEmitter wraps it; hub server, PTY, AppState all take a typed
    // `Arc<dyn EventEmitter>` (aliased as `AppHandleSlot` in the hub mod
    // for back-compat). Emit calls before setup fires silently no-op.
    let app_handle_inner: Arc<OnceLock<tauri::AppHandle>> = Arc::new(OnceLock::new());
    let emitter: Arc<dyn EventEmitter> =
        Arc::new(TauriEmitter::new(app_handle_inner.clone()));
    let path_resolver: Arc<dyn PathResolver> =
        Arc::new(TauriPathResolver::new(app_handle_inner.clone()));
    let app_handle_slot: AppHandleSlot = emitter.clone();
    let pty_manager = Arc::new(Mutex::new(PtyManager::new(emitter.clone())));
    let hub_handle = server::start(
        topology.clone(),
        identities.clone(),
        team_registry.clone(),
        task_store.clone(),
        note_store.clone(),
        file_node_store.clone(),
        task_board_store.clone(),
        pty_manager.clone(),
        app_handle_slot.clone(),
    )
    .expect("failed to start hub server");
    log::info!("hub listening at {}", hub_handle.url);

    let app_state = AppState::new(
        hub_handle,
        pty_manager,
        topology,
        identities,
        team_registry,
        task_store,
        note_store,
        file_node_store,
        task_board_store,
        app_handle_slot,
        path_resolver,
    );
    let setup_slot = app_handle_inner;

    tauri::Builder::default()
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
            if let Err(e) = commands::shaders::seed_from_resources(app.handle()) {
                log::warn!("shader seed failed: {}", e);
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
            commands::hub::get_hub_endpoint,
            commands::hub::bootstrap_workflow,
            commands::terminal::create_terminal,
            commands::terminal::destroy_terminal,
            commands::terminal::write_terminal,
            commands::terminal::resize_terminal,
            commands::terminal::get_default_shell,
            commands::terminal::list_available_shells,
            commands::terminal::save_clipboard_image,
            commands::workspace::save_workspace,
            commands::workspace::load_workspace,
            commands::workspace::list_workspaces,
            commands::workspace::delete_workspace,
            commands::workspace::save_workspace_terminals,
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
            commands::file_preview::file_preview_text,
            commands::file_preview::file_preview_dir,
            commands::file_preview::file_inspect,
            commands::tasks::tasks_list,
            commands::tasks::tasks_create,
            commands::tasks::tasks_update,
            commands::tasks::tasks_remove,
            commands::notes::notes_list,
            commands::notes::notes_create,
            commands::notes::notes_update,
            commands::notes::notes_remove,
            commands::notes::notes_replace_all,
            commands::file_nodes::file_nodes_list,
            commands::file_nodes::file_nodes_create,
            commands::file_nodes::file_nodes_update,
            commands::file_nodes::file_nodes_remove,
            commands::file_nodes::file_nodes_replace_all,
            commands::task_boards::task_boards_list,
            commands::task_boards::task_boards_create,
            commands::task_boards::task_boards_update,
            commands::task_boards::task_boards_remove,
            commands::task_boards::task_boards_replace_all,
            commands::shaders::shaders_list,
            commands::shaders::shaders_get,
            commands::shaders::shaders_dir_path,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
