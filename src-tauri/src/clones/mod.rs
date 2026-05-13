//! Saved agent snapshots ("clones") — workspace-scoped store of named
//! claude sessions that can be re-spawned to produce new terminals already
//! aware of project context.
//!
//! The persisted form lives in `workspace.json` under the `clones` array
//! (see `crate::workspace::storage::Clone`). This module owns the
//! in-memory mirror and CRUD; persistence is invoked via
//! `workspace::storage::persist_clones_for_workspace`.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub use crate::workspace::storage::Clone;

#[derive(Deserialize, Default, Debug, Clone)]
pub struct CloneCreate {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default = "default_kind")]
    pub agent_kind: String,
    pub session_id: String,
    #[serde(default)]
    pub role_hint: Option<String>,
    #[serde(default)]
    pub parent_clone_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// Optional explicit workspace; if None we'll stamp the active one.
    #[serde(default)]
    pub workspace_id: Option<String>,
}

fn default_kind() -> String {
    "claude".into()
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct ClonePatch {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub role_hint: Option<Option<String>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    /// Used by spawn paths to bump usage stats. Set to true to set
    /// last_used_at = now and increment fork_count.
    #[serde(default)]
    pub mark_used: bool,
}

/// In-memory store, keyed by clone id. Each clone carries its
/// workspace_id-equivalent context via the workspace ownership of the
/// `Clone` records — we store one global map and filter by ws on read.
#[derive(Clone, Default)]
pub struct CloneStore {
    inner: Arc<Mutex<HashMap<String, (Clone, Option<String>)>>>,
}

impl CloneStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn list(&self) -> Vec<Clone> {
        self.inner
            .lock()
            .unwrap()
            .values()
            .map(|(c, _)| c.clone())
            .collect()
    }

    pub fn filter_for_workspace(&self, ws_id: &str) -> Vec<Clone> {
        self.inner
            .lock()
            .unwrap()
            .values()
            .filter_map(|(c, w)| {
                if w.as_deref() == Some(ws_id) {
                    Some(c.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    pub fn workspace_of(&self, id: &str) -> Option<String> {
        self.inner.lock().unwrap().get(id).and_then(|(_, w)| w.clone())
    }

    pub fn get(&self, id: &str) -> Option<Clone> {
        self.inner
            .lock()
            .unwrap()
            .get(id)
            .map(|(c, _)| c.clone())
    }

    /// Look up a clone by exact name within a workspace. Used by the CLI
    /// `wodouyao clone spawn <name|id>` shortcut.
    pub fn find_by_name(&self, ws_id: &str, name: &str) -> Option<Clone> {
        self.inner
            .lock()
            .unwrap()
            .values()
            .find(|(c, w)| w.as_deref() == Some(ws_id) && c.name == name)
            .map(|(c, _)| c.clone())
    }

    pub fn create(&self, input: CloneCreate) -> Clone {
        let now = now_secs();
        let clone = Clone {
            id: format!("clone_{}", Uuid::new_v4().simple()),
            name: input.name,
            description: input.description.unwrap_or_default(),
            agent_kind: input.agent_kind,
            session_id: input.session_id,
            role_hint: input.role_hint,
            parent_clone_id: input.parent_clone_id,
            workspace_id: input.workspace_id.clone(),
            created_at: now,
            last_used_at: 0,
            fork_count: 0,
            tags: input.tags,
        };
        self.inner.lock().unwrap().insert(
            clone.id.clone(),
            (clone.clone(), input.workspace_id),
        );
        clone
    }

    pub fn update(&self, id: &str, patch: ClonePatch) -> Option<Clone> {
        let mut map = self.inner.lock().unwrap();
        let entry = map.get_mut(id)?;
        let c = &mut entry.0;
        if let Some(n) = patch.name {
            c.name = n;
        }
        if let Some(d) = patch.description {
            c.description = d;
        }
        if let Some(rh) = patch.role_hint {
            c.role_hint = rh;
        }
        if let Some(tags) = patch.tags {
            c.tags = tags;
        }
        if patch.mark_used {
            c.last_used_at = now_secs();
            c.fork_count = c.fork_count.saturating_add(1);
        }
        Some(c.clone())
    }

    pub fn remove(&self, id: &str) -> bool {
        self.inner.lock().unwrap().remove(id).is_some()
    }

    /// Used on workspace load — wipe and rebuild from disk.
    pub fn replace_for_workspace(&self, ws_id: &str, clones: Vec<Clone>) {
        let mut map = self.inner.lock().unwrap();
        // Drop any existing entries for this workspace.
        map.retain(|_, (_, w)| w.as_deref() != Some(ws_id));
        for mut c in clones {
            // Stamp workspace_id on the struct so old persisted clones
            // (which lacked the field) gain it on first load.
            if c.workspace_id.is_none() {
                c.workspace_id = Some(ws_id.to_string());
            }
            map.insert(c.id.clone(), (c, Some(ws_id.to_string())));
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Validate that a claude session file still exists on disk for the given
/// `(cwd, session_id)`. Claude stores session JSONL at:
///   `~/.claude/projects/<encoded_cwd>/<session_id>.jsonl`
/// where `encoded_cwd` is the absolute cwd with `/` replaced by `-`.
pub fn validate_claude_session(cwd: &str, session_id: &str) -> bool {
    claude_session_path(cwd, session_id)
        .map(|p| p.exists())
        .unwrap_or(false)
}

fn claude_session_path(cwd: &str, session_id: &str) -> Option<std::path::PathBuf> {
    let home = dirs::home_dir()?;
    Some(
        home.join(".claude")
            .join("projects")
            .join(encode_cwd(cwd))
            .join(format!("{}.jsonl", session_id)),
    )
}

/// Fork a claude session: copy the parent's JSONL to a fresh UUID file in
/// the same project dir. The returned id is suitable for `claude -r <id>`
/// — the new session inherits the entire parent history but writes
/// diverge, so multiple instances spawned from the same clone don't stomp
/// each other.
///
/// Returns the new session id on success. The session id format is the
/// same UUID Claude uses (lowercased, hyphenated).
pub fn fork_claude_session(cwd: &str, parent_session_id: &str) -> Result<String, String> {
    let src = claude_session_path(cwd, parent_session_id)
        .ok_or_else(|| "no home dir".to_string())?;
    if !src.exists() {
        return Err(format!(
            "parent session file missing: {}",
            src.display()
        ));
    }
    let new_id = Uuid::new_v4().to_string();
    let dst = claude_session_path(cwd, &new_id)
        .ok_or_else(|| "no home dir".to_string())?;
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {}", parent.display(), e))?;
    }
    std::fs::copy(&src, &dst)
        .map_err(|e| format!("copy {} -> {}: {}", src.display(), dst.display(), e))?;
    Ok(new_id)
}

fn encode_cwd(cwd: &str) -> String {
    // Claude project dir naming: replace path separators with `-`.
    // E.g. /Users/mt/workspace/wodouyao -> -Users-mt-workspace-wodouyao
    let mut out = String::with_capacity(cwd.len());
    for ch in cwd.chars() {
        match ch {
            '/' | '\\' => out.push('-'),
            _ => out.push(ch),
        }
    }
    out
}
