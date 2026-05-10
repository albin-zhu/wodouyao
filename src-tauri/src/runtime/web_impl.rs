//! Web-runtime implementations of the runtime traits. Events go through a
//! `tokio::sync::broadcast` channel that the WS handler subscribes to.
//! Path resolution derives from `current_exe()` since there's no Tauri
//! resource dir at runtime.

use std::path::PathBuf;
use tokio::sync::broadcast;

use super::{EventEmitter, PathResolver};

/// One frame of the event stream multiplexed onto the single
/// `/v1/events` WebSocket. Text frames carry JSON envelopes; binary
/// frames carry length-prefixed terminal output.
#[derive(Debug, Clone)]
pub enum WebEvent {
    Json {
        event: String,
        payload: serde_json::Value,
    },
    TerminalOutput {
        id: String,
        data: Vec<u8>,
    },
    TerminalExit {
        id: String,
        exit_code: Option<u32>,
    },
}

pub struct WebEmitter {
    tx: broadcast::Sender<WebEvent>,
}

impl WebEmitter {
    pub fn new(capacity: usize) -> Self {
        let (tx, _) = broadcast::channel(capacity);
        Self { tx }
    }

    /// Hand out a fresh receiver for a new WS client. Receivers see
    /// events emitted *after* they subscribe — early events are dropped
    /// to keep the channel bounded.
    pub fn subscribe(&self) -> broadcast::Receiver<WebEvent> {
        self.tx.subscribe()
    }
}

impl EventEmitter for WebEmitter {
    fn emit_json(&self, event: &str, payload: serde_json::Value) {
        let _ = self.tx.send(WebEvent::Json {
            event: event.to_string(),
            payload,
        });
    }

    fn emit_terminal_output(&self, terminal_id: &str, data: &[u8]) {
        let _ = self.tx.send(WebEvent::TerminalOutput {
            id: terminal_id.to_string(),
            data: data.to_vec(),
        });
    }

    fn emit_terminal_exit(&self, terminal_id: &str, exit_code: Option<u32>) {
        let _ = self.tx.send(WebEvent::TerminalExit {
            id: terminal_id.to_string(),
            exit_code,
        });
    }

    /// Conservative gate matching the Tauri impl: refuse hub spawn
    /// requests until at least one WS client has connected, otherwise
    /// the spawn event would be dropped before the frontend could act.
    fn is_ready(&self) -> bool {
        self.tx.receiver_count() > 0
    }
}

/// Resolves bundled-resource paths for the headless server. Looks for
/// a `resources/` sibling next to the running binary — matching the
/// layout `cargo build` produces when the bundled CLI is copied into
/// the target dir.
pub struct WebPathResolver;

impl WebPathResolver {
    pub fn new() -> Self {
        Self
    }
}

impl Default for WebPathResolver {
    fn default() -> Self {
        Self::new()
    }
}

impl PathResolver for WebPathResolver {
    fn resource_dir(&self) -> std::io::Result<PathBuf> {
        // Dev convenience: `WODOUYAO_RESOURCE_DIR` points at the source
        // tree's `src-tauri/` so callers find the bundled `wodouyao` CLI
        // at `<resource_dir>/resources/bin/wodouyao`. The npm `server:dev`
        // script sets it for you.
        if let Ok(p) = std::env::var("WODOUYAO_RESOURCE_DIR") {
            if !p.is_empty() {
                return Ok(PathBuf::from(p));
            }
        }
        let exe = std::env::current_exe()?;
        let dir = exe.parent().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "binary has no parent dir")
        })?;
        Ok(dir.to_path_buf())
    }
}
