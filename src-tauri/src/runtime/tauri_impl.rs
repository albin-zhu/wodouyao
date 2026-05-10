//! Tauri-backed implementations of the runtime traits. The emitter holds an
//! `Arc<OnceLock<AppHandle>>` so it can be constructed *before* the Tauri
//! setup hook fires (which is when the AppHandle becomes available); emit
//! calls before then are silently dropped, matching the prior Hub behavior.

use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use tauri::{AppHandle, Emitter, Manager};

use super::{EventEmitter, PathResolver};
use crate::pty::session::{TerminalExitPayload, TerminalOutputPayload};

pub type AppHandleSlot = Arc<OnceLock<AppHandle>>;

pub struct TauriEmitter {
    handle: AppHandleSlot,
}

impl TauriEmitter {
    pub fn new(handle: AppHandleSlot) -> Self {
        Self { handle }
    }
}

impl EventEmitter for TauriEmitter {
    fn emit_json(&self, event: &str, payload: serde_json::Value) {
        if let Some(h) = self.handle.get() {
            let _ = h.emit(event, payload);
        }
    }

    fn emit_terminal_output(&self, terminal_id: &str, data: &[u8]) {
        if let Some(h) = self.handle.get() {
            let _ = h.emit(
                &format!("terminal-output-{}", terminal_id),
                TerminalOutputPayload {
                    id: terminal_id.to_string(),
                    data: data.to_vec(),
                },
            );
        }
    }

    fn emit_terminal_exit(&self, terminal_id: &str, exit_code: Option<u32>) {
        if let Some(h) = self.handle.get() {
            let _ = h.emit(
                &format!("terminal-exit-{}", terminal_id),
                TerminalExitPayload {
                    id: terminal_id.to_string(),
                    exit_code,
                },
            );
        }
    }

    fn is_ready(&self) -> bool {
        self.handle.get().is_some()
    }
}

pub struct TauriPathResolver {
    handle: AppHandleSlot,
}

impl TauriPathResolver {
    pub fn new(handle: AppHandleSlot) -> Self {
        Self { handle }
    }
}

impl PathResolver for TauriPathResolver {
    fn resource_dir(&self) -> std::io::Result<PathBuf> {
        let h = self.handle.get().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Tauri AppHandle not yet initialized",
            )
        })?;
        h.path()
            .resource_dir()
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e.to_string()))
    }
}
