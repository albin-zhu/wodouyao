use std::sync::Mutex;

use crate::pty::manager::PtyManager;

pub struct AppState {
    pub pty_manager: Mutex<PtyManager>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            pty_manager: Mutex::new(PtyManager::new()),
        }
    }
}
