use std::collections::{HashMap, HashSet};
use std::sync::mpsc;
use tauri::AppHandle;

use super::session::PtySession;

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    app_handle: Option<AppHandle>,
    live_test_ids: HashSet<String>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            sessions: HashMap::new(),
            app_handle: None,
            live_test_ids: HashSet::new(),
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub fn create_session(
        &mut self,
        id: String,
        shell_path: &str,
        command: Option<&str>,
        cols: u16,
        rows: u16,
        cwd: Option<&str>,
        env: &[(String, String)],
    ) -> Result<String, String> {
        let app_handle = self
            .app_handle
            .clone()
            .ok_or("App handle not set")?;

        let session = PtySession::spawn(
            id.clone(),
            shell_path,
            command,
            cols,
            rows,
            cwd,
            env,
            app_handle,
        )?;

        self.sessions.insert(id.clone(), session);
        Ok(id)
    }

    pub fn destroy_session(&mut self, id: &str) -> Result<(), String> {
        if let Some(mut session) = self.sessions.remove(id) {
            session.kill();
            Ok(())
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn has_session(&self, id: &str) -> bool {
        self.sessions.contains_key(id) || self.live_test_ids.contains(id)
    }

    pub fn live_ids(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.sessions.keys().cloned().collect();
        ids.extend(self.live_test_ids.iter().cloned());
        ids
    }

    /// Test hook: pretend a session exists without actually spawning a PTY.
    /// Used only by integration tests exercising the hub's liveness filter.
    #[doc(hidden)]
    pub fn mark_live_for_test(&mut self, id: String) {
        self.live_test_ids.insert(id);
    }

    pub fn write_to_session(&mut self, id: &str, data: &[u8]) -> Result<(), String> {
        if let Some(session) = self.sessions.get_mut(id) {
            session.write(data)
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn resize_session(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        if let Some(session) = self.sessions.get(id) {
            session.resize(cols, rows)
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn read_recent(&self, id: &str, max_bytes: usize) -> Result<Vec<u8>, String> {
        if let Some(session) = self.sessions.get(id) {
            Ok(session.recent_output(max_bytes))
        } else {
            Err(format!("Session {} not found", id))
        }
    }

    pub fn subscribe(&self, id: &str) -> Result<mpsc::Receiver<Vec<u8>>, String> {
        self.sessions
            .get(id)
            .map(|s| s.subscribe())
            .ok_or_else(|| format!("Session {} not found", id))
    }
}
