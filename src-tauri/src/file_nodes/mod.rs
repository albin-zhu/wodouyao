use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileNode {
    pub id: String,
    pub path: String,
    pub name: String,
    /// "image" | "text" | "video" | "directory" | "other"
    pub kind: String,
    pub position: Position,
    pub size: Size,
    #[serde(default)]
    pub z_index: u32,
    pub created_at: u64,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct FileNodeCreate {
    #[serde(default)]
    pub id: Option<String>,
    pub path: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub size: Option<Size>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct FileNodePatch {
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub size: Option<Size>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Clone)]
pub struct FileNodeStore {
    inner: Arc<Mutex<(HashMap<String, FileNode>, u32)>>,
}

impl FileNodeStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new((HashMap::new(), 1))),
        }
    }

    pub fn list(&self) -> Vec<FileNode> {
        let (map, _) = &*self.inner.lock().unwrap();
        let mut v: Vec<FileNode> = map.values().cloned().collect();
        v.sort_by_key(|n| n.created_at);
        v
    }

    pub fn create(&self, input: FileNodeCreate) -> FileNode {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        let node = FileNode {
            id: input
                .id
                .unwrap_or_else(|| format!("f_{}", Uuid::new_v4().simple())),
            path: input.path,
            name: input.name,
            kind: input.kind,
            position: input.position.unwrap_or(Position {
                x: 250.0 + (map.len() as f64) * 20.0,
                y: 250.0 + (map.len() as f64) * 20.0,
            }),
            size: input.size.unwrap_or(Size {
                width: 280.0,
                height: 220.0,
            }),
            z_index: *next_z,
            created_at: now_ms(),
            workspace_id: input.workspace_id,
        };
        *next_z += 1;
        map.insert(node.id.clone(), node.clone());
        node
    }

    pub fn update(&self, id: &str, patch: FileNodePatch) -> Option<FileNode> {
        let mut guard = self.inner.lock().unwrap();
        let (map, _) = &mut *guard;
        let node = map.get_mut(id)?;
        if let Some(p) = patch.position {
            node.position = p;
        }
        if let Some(s) = patch.size {
            node.size = s;
        }
        Some(node.clone())
    }

    pub fn remove(&self, id: &str) -> bool {
        self.inner.lock().unwrap().0.remove(id).is_some()
    }

    pub fn get(&self, id: &str) -> Option<FileNode> {
        self.inner.lock().unwrap().0.get(id).cloned()
    }

    pub fn replace_all(&self, nodes: Vec<FileNode>) {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        map.clear();
        let mut max_z = 0u32;
        for n in nodes {
            if n.z_index > max_z {
                max_z = n.z_index;
            }
            map.insert(n.id.clone(), n);
        }
        *next_z = max_z + 1;
    }

    pub fn filter_for_workspace(&self, ws_id: &str) -> Vec<FileNode> {
        let (map, _) = &*self.inner.lock().unwrap();
        let mut v: Vec<FileNode> = map
            .values()
            .filter(|n| n.workspace_id.as_deref() == Some(ws_id))
            .cloned()
            .collect();
        v.sort_by_key(|n| n.created_at);
        v
    }

    pub fn upsert_for_workspace(&self, ws_id: &str, nodes: Vec<FileNode>) {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        let to_remove: Vec<String> = map
            .iter()
            .filter(|(_, n)| n.workspace_id.as_deref() == Some(ws_id))
            .map(|(id, _)| id.clone())
            .collect();
        for id in to_remove {
            map.remove(&id);
        }
        let mut max_z = *next_z;
        for mut n in nodes {
            n.workspace_id = Some(ws_id.to_string());
            if n.z_index >= max_z {
                max_z = n.z_index + 1;
            }
            map.insert(n.id.clone(), n);
        }
        *next_z = max_z;
    }
}

impl Default for FileNodeStore {
    fn default() -> Self {
        Self::new()
    }
}
