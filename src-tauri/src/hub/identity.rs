use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Predefined skill verbs. Agents may also self-declare `x.*` custom verbs.
pub const BUILTIN_CAPABILITIES: &[&str] = &[
    "ping",
    "whoami",
    "delegate",
    "read-scrollback",
    "shell-exec",
];

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Identity {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub agent_kind: Option<String>,
    #[serde(default)]
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub registered_at: u64,
}

#[derive(Clone, Default)]
pub struct IdentityRegistry {
    inner: Arc<Mutex<HashMap<String, Identity>>>,
}

impl IdentityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn upsert(&self, mut identity: Identity) -> Identity {
        if identity.registered_at == 0 {
            identity.registered_at = now_ms();
        }
        let mut map = self.inner.lock().unwrap();
        map.insert(identity.id.clone(), identity.clone());
        identity
    }

    pub fn get(&self, id: &str) -> Identity {
        let map = self.inner.lock().unwrap();
        map.get(id)
            .cloned()
            .unwrap_or_else(|| Identity {
                id: id.to_string(),
                ..Identity::default()
            })
    }

    pub fn remove(&self, id: &str) {
        self.inner.lock().unwrap().remove(id);
    }
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
