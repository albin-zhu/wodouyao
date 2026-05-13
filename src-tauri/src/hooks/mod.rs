//! Task lifecycle hooks dispatched to "notifier" agent terminals.
//!
//! When a hook matches a task transition we look up every terminal whose
//! role is `notifier` in the active workspace and write a single
//! `[wodouyao:hook] {json}\n` line to its PTY. The notifier agent's system
//! prompt teaches it to parse those lines and route the event to whatever
//! channel its installed CLIs / skills can reach (lark-cli, slack, etc.).
//!
//! Persistent config: `AppSettings.hooks` — id, name, events, enabled,
//! filter. No shell command, no provider-specific schema; the agent on the
//! receiving end is the integration layer.
//!
//! Runtime telemetry: `RUNTIME` keeps last-fired stats and a per-hook ring
//! buffer of recent dispatches for the Logs tab.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::pty::manager::PtyManager;
use crate::settings::storage as settings;
use crate::tasks::{Task, TaskStatus};
use crate::workspace::storage as workspace;

const RUN_BUFFER_CAP: usize = 50;
pub const NOTIFIER_ROLE: &str = "notifier";
pub const HOOK_LINE_PREFIX: &str = "[wodouyao:hook]";

// ── persisted schema ─────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Hook {
    pub id: String,
    pub name: String,
    pub events: Vec<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub filter: HookFilter,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct HookFilter {
    #[serde(default)]
    pub status: Option<Vec<String>>,
    #[serde(default)]
    pub subject_pattern: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

fn default_enabled() -> bool {
    true
}

// ── runtime telemetry ────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug, Default)]
pub struct HookStats {
    pub last_fired_at: Option<u64>,
    pub last_notifier_count: Option<u32>,
    pub last_error: Option<String>,
    pub fire_count: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct HookRun {
    pub timestamp: u64,
    pub event: String,
    pub task_id: String,
    pub task_subject: String,
    pub notifier_count: u32,
    pub error: Option<String>,
}

#[derive(Default)]
struct HookRuntime {
    stats: HookStats,
    runs: VecDeque<HookRun>,
}

static RUNTIME: LazyLock<Mutex<HashMap<String, HookRuntime>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn stats_snapshot() -> HashMap<String, HookStats> {
    let map = RUNTIME.lock().unwrap();
    map.iter().map(|(k, v)| (k.clone(), v.stats.clone())).collect()
}

pub fn runs_for(hook_id: &str) -> Vec<HookRun> {
    let map = RUNTIME.lock().unwrap();
    map.get(hook_id)
        .map(|r| r.runs.iter().cloned().collect())
        .unwrap_or_default()
}

fn record_run(hook_id: &str, run: HookRun) {
    let mut map = RUNTIME.lock().unwrap();
    let entry = map.entry(hook_id.to_string()).or_default();
    entry.stats.last_fired_at = Some(run.timestamp);
    entry.stats.last_notifier_count = Some(run.notifier_count);
    entry.stats.last_error = run.error.clone();
    entry.stats.fire_count += 1;
    if entry.runs.len() >= RUN_BUFFER_CAP {
        entry.runs.pop_front();
    }
    entry.runs.push_back(run);
}

// ── events ───────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug)]
pub enum TaskEvent {
    Created,
    Claimed,
    Completed,
    Removed,
}

impl TaskEvent {
    pub fn name(self) -> &'static str {
        match self {
            TaskEvent::Created => "task.created",
            TaskEvent::Claimed => "task.claimed",
            TaskEvent::Completed => "task.completed",
            TaskEvent::Removed => "task.removed",
        }
    }
}

pub fn task_changed(
    pty_manager: &Arc<Mutex<PtyManager>>,
    prev: Option<&Task>,
    next: Option<&Task>,
) {
    let events = derive_events(prev, next);
    if events.is_empty() {
        return;
    }
    let task = next.or(prev);
    let Some(task) = task else { return };
    for event in events {
        fire(pty_manager, event, task);
    }
}

fn derive_events(prev: Option<&Task>, next: Option<&Task>) -> Vec<TaskEvent> {
    let mut out = Vec::new();
    match (prev, next) {
        (None, Some(_)) => out.push(TaskEvent::Created),
        (Some(_), None) => out.push(TaskEvent::Removed),
        (Some(p), Some(n)) => {
            if p.owner_term_id.is_none() && n.owner_term_id.is_some() {
                out.push(TaskEvent::Claimed);
            }
            let was = matches!(p.status, TaskStatus::Completed);
            let is = matches!(n.status, TaskStatus::Completed);
            if is && !was {
                out.push(TaskEvent::Completed);
            }
        }
        (None, None) => {}
    }
    out
}

// ── fire ────────────────────────────────────────────────────────────────

fn fire(pty_manager: &Arc<Mutex<PtyManager>>, event: TaskEvent, task: &Task) {
    let s = match settings::load() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[hooks] load settings: {}", e);
            return;
        }
    };
    let event_name = event.name();
    for hook in &s.hooks {
        if !hook.enabled || !hook.events.iter().any(|e| e == event_name) {
            continue;
        }
        if !filter_matches(&hook.filter, task) {
            continue;
        }
        let run = dispatch(pty_manager, hook, event_name, task);
        record_run(&hook.id, run);
    }
}

/// Synthetic fire used by the "Test" button in the UI. Builds a fake task
/// representing the kind of payload an agent would actually receive.
pub fn fire_test(
    pty_manager: &Arc<Mutex<PtyManager>>,
    hook_id: &str,
) -> Result<HookRun, String> {
    let s = settings::load().map_err(|e| format!("load settings: {}", e))?;
    let hook = s
        .hooks
        .iter()
        .find(|h| h.id == hook_id)
        .ok_or_else(|| "hook not found".to_string())?
        .clone();
    let synthetic = Task {
        id: "test-task".into(),
        subject: format!("[test] {}", hook.name),
        description: "Synthetic task fired by Test button".into(),
        status: TaskStatus::Completed,
        owner_term_id: None,
        created_by: "wodouyao-test".into(),
        created_at: now_secs(),
        blocked_by: vec![],
        acceptance: vec![],
        note_id: None,
        workspace_id: workspace::current_workspace_id(),
        role_hint: None,
        source: Some("test".into()),
        parent_id: None,
        complexity: None,
        prd_note_id: None,
        docs: vec![],
    };
    let run = dispatch(pty_manager, &hook, "test.fire", &synthetic);
    record_run(hook_id, run.clone());
    Ok(run)
}

fn filter_matches(f: &HookFilter, task: &Task) -> bool {
    if let Some(allowed) = &f.status {
        let s = task_status_str(&task.status);
        if !allowed.iter().any(|x| x == s) {
            return false;
        }
    }
    if let Some(pat) = &f.subject_pattern {
        if !pat.is_empty() {
            match regex::Regex::new(pat) {
                Ok(re) => {
                    if !re.is_match(&task.subject) {
                        return false;
                    }
                }
                Err(_) => return false,
            }
        }
    }
    if let Some(ws) = &f.workspace_id {
        if !ws.is_empty() && task.workspace_id.as_deref() != Some(ws.as_str()) {
            return false;
        }
    }
    true
}

fn dispatch(
    pty_manager: &Arc<Mutex<PtyManager>>,
    hook: &Hook,
    event_name: &str,
    task: &Task,
) -> HookRun {
    let target_ws = task
        .workspace_id
        .clone()
        .or_else(workspace::current_workspace_id);
    let notifier_ids = match target_ws.as_deref() {
        Some(ws_id) => find_notifier_terminals(ws_id),
        None => vec![],
    };

    if notifier_ids.is_empty() {
        return HookRun {
            timestamp: now_secs(),
            event: event_name.to_string(),
            task_id: task.id.clone(),
            task_subject: task.subject.clone(),
            notifier_count: 0,
            error: Some("no notifier terminal in workspace".into()),
        };
    }

    let payload = serde_json::json!({
        "event": event_name,
        "hook_id": hook.id,
        "hook_name": hook.name,
        "ts": now_secs(),
        "task": task,
    });
    let body = format!("{} {}", HOOK_LINE_PREFIX, payload);

    let mut delivered = 0u32;
    let mut errors: Vec<String> = Vec::new();
    for term_id in &notifier_ids {
        match submit_to_agent(pty_manager, term_id, body.as_bytes()) {
            Ok(_) => delivered += 1,
            Err(e) => errors.push(format!("{}: {}", term_id, e)),
        }
    }

    HookRun {
        timestamp: now_secs(),
        event: event_name.to_string(),
        task_id: task.id.clone(),
        task_subject: task.subject.clone(),
        notifier_count: delivered,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
    }
}

/// Mirrors `hub::server::write_peer_send`: write the body without trailing
/// CR/LF, sleep briefly so the agent's TUI registers the buffer, then send a
/// canonical `\r` to act as Enter. Releases the PtyManager lock between the
/// two writes so concurrent hub traffic isn't blocked during the sleep.
fn submit_to_agent(
    pty_manager: &Arc<Mutex<PtyManager>>,
    term_id: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let mut end = bytes.len();
    while end > 0 {
        let b = bytes[end - 1];
        if b == b'\r' || b == b'\n' {
            end -= 1;
        } else {
            break;
        }
    }
    let body = &bytes[..end];
    {
        let mut mgr = pty_manager.lock().map_err(|e| format!("pty lock: {}", e))?;
        if !body.is_empty() {
            mgr.write_to_session(term_id, body)?;
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(30));
    {
        let mut mgr = pty_manager.lock().map_err(|e| format!("pty lock: {}", e))?;
        mgr.write_to_session(term_id, b"\r")?;
    }
    Ok(())
}

/// Read the workspace.json for `ws_id` and return every terminal layout id
/// whose role is `notifier`. Errors collapse to an empty list — a missing
/// workspace just means "no notifiers right now".
fn find_notifier_terminals(ws_id: &str) -> Vec<String> {
    match workspace::load(ws_id) {
        Ok(ws) => ws
            .terminals
            .iter()
            .filter(|t| {
                t.role
                    .as_deref()
                    .map(|r| r.eq_ignore_ascii_case(NOTIFIER_ROLE))
                    .unwrap_or(false)
            })
            .map(|t| t.id.clone())
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn task_status_str(s: &TaskStatus) -> &'static str {
    match s {
        TaskStatus::Pending => "pending",
        TaskStatus::InProgress => "in_progress",
        TaskStatus::Completed => "completed",
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
