use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Wire {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    #[serde(default = "default_forward")]
    pub forward_output: bool,
    /// Resource type carried by this wire: "io" (terminal↔terminal),
    /// "note", "file", "team", or other custom kinds. None for legacy wires.
    #[serde(default)]
    pub kind: Option<String>,
    /// Workspace this wire belongs to. None for legacy / not yet stamped.
    #[serde(default)]
    pub workspace_id: Option<String>,
}

fn default_forward() -> bool {
    true
}

#[derive(Clone)]
pub struct WireTopology {
    inner: Arc<Mutex<HashMap<String, Wire>>>,
}

impl WireTopology {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list(&self) -> Vec<Wire> {
        let map = self.inner.lock().unwrap();
        map.values().cloned().collect()
    }

    pub fn insert(&self, wire: Wire) -> Wire {
        let mut map = self.inner.lock().unwrap();
        map.insert(wire.id.clone(), wire.clone());
        wire
    }

    pub fn remove(&self, id: &str) -> bool {
        self.inner.lock().unwrap().remove(id).is_some()
    }

    pub fn replace_all(&self, wires: Vec<Wire>) {
        let mut map = self.inner.lock().unwrap();
        map.clear();
        for w in wires {
            map.insert(w.id.clone(), w);
        }
    }

    /// Return all wires belonging to `ws_id`. Wires with `workspace_id == None`
    /// are treated as legacy and included only if `ws_id == None`.
    pub fn filter_for_workspace(&self, ws_id: &str) -> Vec<Wire> {
        let map = self.inner.lock().unwrap();
        map.values()
            .filter(|w| w.workspace_id.as_deref() == Some(ws_id))
            .cloned()
            .collect()
    }

    /// Replace only the slice of wires whose `workspace_id == ws_id`.
    /// Each incoming wire has its `workspace_id` forced to `ws_id`.
    pub fn upsert_for_workspace(&self, ws_id: &str, wires: Vec<Wire>) {
        let mut map = self.inner.lock().unwrap();
        let to_remove: Vec<String> = map
            .iter()
            .filter(|(_, w)| w.workspace_id.as_deref() == Some(ws_id))
            .map(|(id, _)| id.clone())
            .collect();
        for id in to_remove {
            map.remove(&id);
        }
        for mut w in wires {
            w.workspace_id = Some(ws_id.to_string());
            map.insert(w.id.clone(), w);
        }
    }

    pub fn peers_for(&self, term_id: &str) -> Vec<String> {
        let map = self.inner.lock().unwrap();
        let mut peers = Vec::new();
        for w in map.values() {
            if w.source_id == term_id {
                peers.push(w.target_id.clone());
            } else if w.target_id == term_id {
                peers.push(w.source_id.clone());
            }
        }
        peers
    }

    /// Drop every wire touching `term_id`. Returns the ids of removed wires
    /// so the frontend can reconcile its own mirror.
    pub fn remove_for_terminal(&self, term_id: &str) -> Vec<String> {
        let mut map = self.inner.lock().unwrap();
        let to_remove: Vec<String> = map
            .iter()
            .filter(|(_, w)| w.source_id == term_id || w.target_id == term_id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &to_remove {
            map.remove(id);
        }
        to_remove
    }
}

impl Default for WireTopology {
    fn default() -> Self {
        Self::new()
    }
}
