use std::sync::{Arc, Mutex};

use crate::clones::CloneStore;
use crate::file_nodes::FileNodeStore;
use crate::hub::{AppHandleSlot, HubHandle, IdentityRegistry, TeamRegistry, WireTopology};
use crate::notes::NoteStore;
use crate::pty::manager::PtyManager;
use crate::runtime::SharedPathResolver;
use crate::task_boards::TaskBoardStore;
use crate::tasks::TaskStore;

pub struct AppState {
    pub pty_manager: Arc<Mutex<PtyManager>>,
    pub topology: WireTopology,
    pub identities: IdentityRegistry,
    pub team_registry: TeamRegistry,
    pub tasks: TaskStore,
    pub notes: NoteStore,
    pub file_nodes: FileNodeStore,
    pub task_boards: TaskBoardStore,
    pub clones: CloneStore,
    pub hub: HubHandle,
    /// Same emitter the hub server uses to reach the frontend (Tauri
    /// WebView or browser WS client). In-process Tauri commands emit
    /// `notes-updated`, `teams-updated` etc. through this slot.
    pub app_handle: AppHandleSlot,
    /// Resolver for bundled-resource paths (CLI bin, integration assets,
    /// shaders). Tauri builds use `app.path().resource_dir()`; the
    /// headless web binary will derive it from `current_exe()`.
    pub path_resolver: SharedPathResolver,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        hub: HubHandle,
        pty_manager: Arc<Mutex<PtyManager>>,
        topology: WireTopology,
        identities: IdentityRegistry,
        team_registry: TeamRegistry,
        tasks: TaskStore,
        notes: NoteStore,
        file_nodes: FileNodeStore,
        task_boards: TaskBoardStore,
        clones: CloneStore,
        app_handle: AppHandleSlot,
        path_resolver: SharedPathResolver,
    ) -> Self {
        AppState {
            pty_manager,
            topology,
            identities,
            team_registry,
            tasks,
            notes,
            file_nodes,
            task_boards,
            clones,
            hub,
            app_handle,
            path_resolver,
        }
    }
}
