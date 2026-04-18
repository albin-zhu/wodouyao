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
pub struct Note {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default = "default_color")]
    pub color: String,
    pub position: Position,
    pub size: Size,
    #[serde(default)]
    pub z_index: u32,
    pub created_at: u64,
}

fn default_color() -> String {
    "#e0af68".to_string()
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct NoteCreate {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub size: Option<Size>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct NotePatch {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
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
pub struct NoteStore {
    inner: Arc<Mutex<(HashMap<String, Note>, u32)>>,
}

impl NoteStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new((HashMap::new(), 1))),
        }
    }

    pub fn list(&self) -> Vec<Note> {
        let (map, _) = &*self.inner.lock().unwrap();
        let mut v: Vec<Note> = map.values().cloned().collect();
        v.sort_by_key(|n| n.created_at);
        v
    }

    pub fn create(&self, input: NoteCreate) -> Note {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        let note = Note {
            id: format!("n_{}", Uuid::new_v4().simple()),
            text: input.text.unwrap_or_default(),
            color: input.color.unwrap_or_else(default_color),
            position: input.position.unwrap_or(Position {
                x: 200.0 + (map.len() as f64) * 20.0,
                y: 200.0 + (map.len() as f64) * 20.0,
            }),
            size: input.size.unwrap_or(Size {
                width: 240.0,
                height: 160.0,
            }),
            z_index: *next_z,
            created_at: now_ms(),
        };
        *next_z += 1;
        map.insert(note.id.clone(), note.clone());
        note
    }

    pub fn update(&self, id: &str, patch: NotePatch) -> Option<Note> {
        let mut guard = self.inner.lock().unwrap();
        let (map, _) = &mut *guard;
        let note = map.get_mut(id)?;
        if let Some(t) = patch.text {
            note.text = t;
        }
        if let Some(c) = patch.color {
            note.color = c;
        }
        if let Some(p) = patch.position {
            note.position = p;
        }
        if let Some(s) = patch.size {
            note.size = s;
        }
        Some(note.clone())
    }

    pub fn remove(&self, id: &str) -> bool {
        self.inner.lock().unwrap().0.remove(id).is_some()
    }

    pub fn get(&self, id: &str) -> Option<Note> {
        self.inner.lock().unwrap().0.get(id).cloned()
    }

    pub fn replace_all(&self, notes: Vec<Note>) {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        map.clear();
        let mut max_z = 0u32;
        for n in notes {
            if n.z_index > max_z {
                max_z = n.z_index;
            }
            map.insert(n.id.clone(), n);
        }
        *next_z = max_z + 1;
    }
}

impl Default for NoteStore {
    fn default() -> Self {
        Self::new()
    }
}
