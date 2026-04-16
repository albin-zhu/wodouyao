use std::collections::HashMap;
use tauri::AppHandle;

use super::session::PtySession;

pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    app_handle: Option<AppHandle>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            sessions: HashMap::new(),
            app_handle: None,
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
}
