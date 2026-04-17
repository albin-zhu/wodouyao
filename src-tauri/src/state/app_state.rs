use std::sync::{Arc, Mutex};

use crate::hub::{HubHandle, IdentityRegistry, TeamRegistry, WireTopology};
use crate::pty::manager::PtyManager;

pub struct AppState {
    pub pty_manager: Arc<Mutex<PtyManager>>,
    pub topology: WireTopology,
    pub identities: IdentityRegistry,
    pub team_registry: TeamRegistry,
    pub hub: HubHandle,
}

impl AppState {
    pub fn new(
        hub: HubHandle,
        pty_manager: Arc<Mutex<PtyManager>>,
        topology: WireTopology,
        identities: IdentityRegistry,
        team_registry: TeamRegistry,
    ) -> Self {
        AppState {
            pty_manager,
            topology,
            identities,
            team_registry,
            hub,
        }
    }
}
