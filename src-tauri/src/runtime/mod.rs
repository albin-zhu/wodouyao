//! Runtime abstraction so the same core (PTY, hub, stores, commands) can run
//! under either the Tauri desktop shell or a headless HTTP/WS server. Modules
//! that previously held a `tauri::AppHandle` now hold an
//! `Arc<dyn EventEmitter>` and get path-resolution via
//! `Arc<dyn PathResolver>`.

pub mod tauri_impl;

use std::path::PathBuf;
use std::sync::Arc;

/// Sink for events that previously went through `app.emit(...)`. The Tauri
/// implementation forwards to `AppHandle::emit`; the web implementation
/// (added later) will push to a `tokio::sync::broadcast` channel that the
/// WebSocket handler drains.
///
/// Methods are named after the event family rather than taking a free-form
/// event string, so each transport can pick its own framing (e.g. binary WS
/// frames for terminal output without the IPC base64 round-trip).
pub trait EventEmitter: Send + Sync {
    /// Generic JSON event (e.g. `notes-updated`, `wires-updated`,
    /// `hub-spawn-request`). Best-effort: failures are swallowed.
    fn emit_json(&self, event: &str, payload: serde_json::Value);

    /// Per-terminal output stream. The Tauri impl emits
    /// `terminal-output-{id}` with a `{id, data}` JSON payload (status quo).
    fn emit_terminal_output(&self, terminal_id: &str, data: &[u8]);

    /// Per-terminal exit notification.
    fn emit_terminal_exit(&self, terminal_id: &str, exit_code: Option<u32>);

    /// Whether a receiver is hooked up. Hub routes that fan out an event
    /// to the frontend (e.g. `hub-spawn-request` driving an actual PTY
    /// spawn) use this to early-return 503 instead of silently losing the
    /// request. Default `true` so impls don't have to override.
    fn is_ready(&self) -> bool {
        true
    }
}

/// Resolves bundled-resource paths. Tauri uses `app.path().resource_dir()`;
/// the headless binary derives it from `current_exe()` or an env var.
pub trait PathResolver: Send + Sync {
    fn resource_dir(&self) -> std::io::Result<PathBuf>;
}

pub type SharedEmitter = Arc<dyn EventEmitter>;
pub type SharedPathResolver = Arc<dyn PathResolver>;

/// No-op emitter for unit / integration tests that exercise the hub or pty
/// manager without a real Tauri host or WS pump. All emit calls are dropped.
pub struct NoOpEmitter;

impl EventEmitter for NoOpEmitter {
    fn emit_json(&self, _: &str, _: serde_json::Value) {}
    fn emit_terminal_output(&self, _: &str, _: &[u8]) {}
    fn emit_terminal_exit(&self, _: &str, _: Option<u32>) {}
}
