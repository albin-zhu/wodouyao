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
pub struct TaskBoard {
    pub id: String,
    pub label: String,
    pub position: Position,
    pub size: Size,
    #[serde(default)]
    pub z_index: u32,
    pub created_at: u64,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct TaskBoardCreate {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub size: Option<Size>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct TaskBoardPatch {
    #[serde(default)]
    pub label: Option<String>,
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
pub struct TaskBoardStore {
    inner: Arc<Mutex<(HashMap<String, TaskBoard>, u32)>>,
}

impl TaskBoardStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new((HashMap::new(), 1))),
        }
    }

    pub fn list(&self) -> Vec<TaskBoard> {
        let (map, _) = &*self.inner.lock().unwrap();
        let mut v: Vec<TaskBoard> = map.values().cloned().collect();
        v.sort_by_key(|b| b.created_at);
        v
    }

    pub fn create(&self, input: TaskBoardCreate) -> TaskBoard {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        let board = TaskBoard {
            id: input
                .id
                .unwrap_or_else(|| format!("tb_{}", Uuid::new_v4().simple())),
            label: input.label.unwrap_or_else(|| "Tasks".to_string()),
            position: input.position.unwrap_or(Position { x: 300.0, y: 200.0 }),
            size: input.size.unwrap_or(Size {
                width: 320.0,
                height: 400.0,
            }),
            z_index: *next_z,
            created_at: now_ms(),
            workspace_id: input.workspace_id,
        };
        *next_z += 1;
        map.insert(board.id.clone(), board.clone());
        board
    }

    pub fn update(&self, id: &str, patch: TaskBoardPatch) -> Option<TaskBoard> {
        let mut guard = self.inner.lock().unwrap();
        let (map, _) = &mut *guard;
        let board = map.get_mut(id)?;
        if let Some(l) = patch.label {
            board.label = l;
        }
        if let Some(p) = patch.position {
            board.position = p;
        }
        if let Some(s) = patch.size {
            board.size = s;
        }
        Some(board.clone())
    }

    pub fn remove(&self, id: &str) -> bool {
        self.inner.lock().unwrap().0.remove(id).is_some()
    }

    pub fn get(&self, id: &str) -> Option<TaskBoard> {
        self.inner.lock().unwrap().0.get(id).cloned()
    }

    pub fn replace_all(&self, boards: Vec<TaskBoard>) {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        map.clear();
        let mut max_z = 0u32;
        for b in boards {
            if b.z_index > max_z {
                max_z = b.z_index;
            }
            map.insert(b.id.clone(), b);
        }
        *next_z = max_z + 1;
    }

    pub fn filter_for_workspace(&self, ws_id: &str) -> Vec<TaskBoard> {
        let (map, _) = &*self.inner.lock().unwrap();
        let mut v: Vec<TaskBoard> = map
            .values()
            .filter(|b| b.workspace_id.as_deref() == Some(ws_id))
            .cloned()
            .collect();
        v.sort_by_key(|b| b.created_at);
        v
    }

    pub fn upsert_for_workspace(&self, ws_id: &str, boards: Vec<TaskBoard>) {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        let to_remove: Vec<String> = map
            .iter()
            .filter(|(_, b)| b.workspace_id.as_deref() == Some(ws_id))
            .map(|(id, _)| id.clone())
            .collect();
        for id in to_remove {
            map.remove(&id);
        }
        let mut max_z = *next_z;
        for mut b in boards {
            b.workspace_id = Some(ws_id.to_string());
            if b.z_index >= max_z {
                max_z = b.z_index + 1;
            }
            map.insert(b.id.clone(), b);
        }
        *next_z = max_z;
    }
}

impl Default for TaskBoardStore {
    fn default() -> Self {
        Self::new()
    }
}
