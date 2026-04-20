use std::sync::{Arc, Mutex};

use crate::file_nodes::FileNodeStore;
use crate::hub::{HubHandle, IdentityRegistry, TeamRegistry, WireTopology};
use crate::notes::NoteStore;
use crate::pty::manager::PtyManager;
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
    pub hub: HubHandle,
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
            hub,
        }
    }
}
