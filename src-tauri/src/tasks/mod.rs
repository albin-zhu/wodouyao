use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Task {
    pub id: String,
    pub subject: String,
    #[serde(default)]
    pub description: String,
    pub status: TaskStatus,
    #[serde(default)]
    pub owner_term_id: Option<String>,
    pub created_by: String,
    pub created_at: u64,
    #[serde(default)]
    pub blocked_by: Vec<String>,
    #[serde(default)]
    pub acceptance: Vec<String>,
    #[serde(default)]
    pub note_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    /// Suggested terminal role (e.g. "architect", "backend", "frontend").
    /// `wodouyao task next` filters by it for the calling agent. None means
    /// "any role can take it".
    #[serde(default)]
    pub role_hint: Option<String>,
    /// Where the task originated. "manual" (default), "prd", "task-master".
    /// Free-form so future sources don't need a schema migration.
    #[serde(default)]
    pub source: Option<String>,
    /// Parent task id for subtasks. None = top-level. Trees are flat in
    /// storage — the parent_id link is the only structure.
    #[serde(default)]
    pub parent_id: Option<String>,
    /// 1–10 estimated complexity, set by PM expansion. Optional.
    #[serde(default)]
    pub complexity: Option<u8>,
    /// Note id of the PRD this task came from, when source == "prd".
    #[serde(default)]
    pub prd_note_id: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct TaskCreate {
    pub subject: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub owner_term_id: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub blocked_by: Vec<String>,
    #[serde(default)]
    pub acceptance: Vec<String>,
    #[serde(default)]
    pub note_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub role_hint: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub complexity: Option<u8>,
    #[serde(default)]
    pub prd_note_id: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct TaskPatch {
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub status: Option<TaskStatus>,
    /// `Some(Some(id))` claims; `Some(None)` unclaims; `None` leaves untouched.
    #[serde(default, deserialize_with = "deserialize_optional_optional_string")]
    pub owner_term_id: Option<Option<String>>,
    #[serde(default)]
    pub blocked_by: Option<Vec<String>>,
    #[serde(default)]
    pub acceptance: Option<Vec<String>>,
    #[serde(default)]
    pub note_id: Option<Option<String>>,
    /// Same nullable-optional shape as owner_term_id so PATCH can clear it.
    #[serde(default, deserialize_with = "deserialize_optional_optional_string")]
    pub role_hint: Option<Option<String>>,
    #[serde(default)]
    pub complexity: Option<Option<u8>>,
    /// Used by the frontend hydrate self-heal to stamp orphan tasks with
    /// the active workspace. Plain Option — unset leaves untouched.
    #[serde(default)]
    pub workspace_id: Option<String>,
}

fn deserialize_optional_optional_string<'de, D>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::Deserialize;
    let v: Option<Option<String>> = Deserialize::deserialize(deserializer)?;
    Ok(v)
}

#[derive(Clone)]
pub struct TaskStore {
    inner: Arc<Mutex<HashMap<String, Task>>>,
}

#[derive(Debug)]
pub enum ClaimResult {
    Ok(Task),
    AlreadyClaimed(Task),
    NotFound,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl TaskStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list(&self) -> Vec<Task> {
        let map = self.inner.lock().unwrap();
        let mut v: Vec<Task> = map.values().cloned().collect();
        v.sort_by_key(|t| t.created_at);
        v
    }

    pub fn create(&self, input: TaskCreate) -> Task {
        let task = Task {
            id: format!("t_{}", Uuid::new_v4().simple()),
            subject: input.subject,
            description: input.description.unwrap_or_default(),
            status: TaskStatus::Pending,
            owner_term_id: input.owner_term_id,
            created_by: input.created_by.unwrap_or_else(|| "user".to_string()),
            created_at: now_ms(),
            blocked_by: input.blocked_by,
            acceptance: input.acceptance,
            note_id: input.note_id,
            workspace_id: input.workspace_id,
            role_hint: input.role_hint,
            source: input.source,
            parent_id: input.parent_id,
            complexity: input.complexity,
            prd_note_id: input.prd_note_id,
        };
        self.inner.lock().unwrap().insert(task.id.clone(), task.clone());
        task
    }

    pub fn update(&self, id: &str, patch: TaskPatch) -> Option<Task> {
        let mut map = self.inner.lock().unwrap();
        let task = map.get_mut(id)?;
        if let Some(s) = patch.subject {
            task.subject = s;
        }
        if let Some(d) = patch.description {
            task.description = d;
        }
        if let Some(s) = patch.status {
            task.status = s;
        }
        if let Some(owner) = patch.owner_term_id {
            task.owner_term_id = owner;
        }
        if let Some(bb) = patch.blocked_by {
            task.blocked_by = bb;
        }
        if let Some(a) = patch.acceptance {
            task.acceptance = a;
        }
        if let Some(n) = patch.note_id {
            task.note_id = n;
        }
        if let Some(rh) = patch.role_hint {
            task.role_hint = rh;
        }
        if let Some(ws) = patch.workspace_id {
            task.workspace_id = Some(ws);
        }
        if let Some(c) = patch.complexity {
            task.complexity = c;
        }
        Some(task.clone())
    }

    /// Atomic claim: only succeeds if the task is currently unowned.
    /// Returns the updated task, or None if not found / already claimed.
    pub fn try_claim(&self, id: &str, owner: &str) -> ClaimResult {
        let mut map = self.inner.lock().unwrap();
        let Some(task) = map.get_mut(id) else {
            return ClaimResult::NotFound;
        };
        if task.owner_term_id.is_some() && task.owner_term_id.as_deref() != Some(owner) {
            return ClaimResult::AlreadyClaimed(task.clone());
        }
        task.owner_term_id = Some(owner.to_string());
        if matches!(task.status, TaskStatus::Pending) {
            task.status = TaskStatus::InProgress;
        }
        ClaimResult::Ok(task.clone())
    }

    /// Pick the next task suitable for `caller_role`. Filters:
    ///   - status == Pending
    ///   - owner_term_id is None
    ///   - all blocked_by tasks are Completed
    ///   - role_hint is None or matches caller_role (case-insensitive)
    ///   - workspace matches if `ws_id` is Some
    /// Returns the oldest matching task (FIFO by created_at).
    pub fn next_for(&self, caller_role: Option<&str>, ws_id: Option<&str>) -> Option<Task> {
        let map = self.inner.lock().unwrap();
        let role_lc = caller_role.map(|r| r.to_lowercase());
        let mut candidates: Vec<&Task> = map
            .values()
            .filter(|t| matches!(t.status, TaskStatus::Pending))
            .filter(|t| t.owner_term_id.is_none())
            .filter(|t| ws_id.map_or(true, |w| t.workspace_id.as_deref() == Some(w)))
            .filter(|t| match (&t.role_hint, &role_lc) {
                (None, _) => true,
                (Some(hint), Some(role)) => hint.to_lowercase() == *role,
                (Some(_), None) => false,
            })
            .filter(|t| {
                t.blocked_by.iter().all(|dep_id| {
                    map.get(dep_id)
                        .map(|d| matches!(d.status, TaskStatus::Completed))
                        .unwrap_or(true) // missing deps treated as resolved
                })
            })
            .collect();
        candidates.sort_by_key(|t| t.created_at);
        candidates.first().map(|t| (*t).clone())
    }

    pub fn remove(&self, id: &str) -> bool {
        self.inner.lock().unwrap().remove(id).is_some()
    }

    pub fn replace_all(&self, tasks: Vec<Task>) {
        let mut map = self.inner.lock().unwrap();
        map.clear();
        for t in tasks {
            map.insert(t.id.clone(), t);
        }
    }

    pub fn filter_for_workspace(&self, ws_id: &str) -> Vec<Task> {
        let map = self.inner.lock().unwrap();
        let mut v: Vec<Task> = map
            .values()
            .filter(|t| t.workspace_id.as_deref() == Some(ws_id))
            .cloned()
            .collect();
        v.sort_by_key(|t| t.created_at);
        v
    }

    pub fn upsert_for_workspace(&self, ws_id: &str, tasks: Vec<Task>) {
        let mut map = self.inner.lock().unwrap();
        let to_remove: Vec<String> = map
            .iter()
            .filter(|(_, t)| t.workspace_id.as_deref() == Some(ws_id))
            .map(|(id, _)| id.clone())
            .collect();
        for id in to_remove {
            map.remove(&id);
        }
        for mut t in tasks {
            t.workspace_id = Some(ws_id.to_string());
            map.insert(t.id.clone(), t);
        }
    }
}

impl Default for TaskStore {
    fn default() -> Self {
        Self::new()
    }
}
