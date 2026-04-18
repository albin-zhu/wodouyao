use std::sync::{Arc, Mutex};

use crate::hub::{HubHandle, IdentityRegistry, TeamRegistry, WireTopology};
use crate::pty::manager::PtyManager;
use crate::tasks::TaskStore;

pub struct AppState {
    pub pty_manager: Arc<Mutex<PtyManager>>,
    pub topology: WireTopology,
    pub identities: IdentityRegistry,
    pub team_registry: TeamRegistry,
    pub tasks: TaskStore,
    pub hub: HubHandle,
}

impl AppState {
    pub fn new(
        hub: HubHandle,
        pty_manager: Arc<Mutex<PtyManager>>,
        topology: WireTopology,
        identities: IdentityRegistry,
        team_registry: TeamRegistry,
        tasks: TaskStore,
    ) -> Self {
        AppState {
            pty_manager,
            topology,
            identities,
            team_registry,
            tasks,
            hub,
        }
    }
}
