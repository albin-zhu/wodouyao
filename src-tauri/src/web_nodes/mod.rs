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
pub struct WebNode {
    pub id: String,
    pub url: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub position: Position,
    pub size: Size,
    #[serde(default)]
    pub z_index: u32,
    pub created_at: u64,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct WebNodeCreate {
    #[serde(default)]
    pub id: Option<String>,
    pub url: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub position: Option<Position>,
    #[serde(default)]
    pub size: Option<Size>,
}

#[derive(Deserialize, Default, Debug, Clone)]
pub struct WebNodePatch {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
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
pub struct WebNodeStore {
    inner: Arc<Mutex<(HashMap<String, WebNode>, u32)>>,
}

impl WebNodeStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new((HashMap::new(), 1))),
        }
    }

    pub fn list(&self) -> Vec<WebNode> {
        let (map, _) = &*self.inner.lock().unwrap();
        let mut v: Vec<WebNode> = map.values().cloned().collect();
        v.sort_by_key(|w| w.created_at);
        v
    }

    pub fn create(&self, input: WebNodeCreate) -> WebNode {
        let mut guard = self.inner.lock().unwrap();
        let (map, next_z) = &mut *guard;
        let node = WebNode {
            id: input
                .id
                .unwrap_or_else(|| format!("w_{}", Uuid::new_v4().simple())),
            url: input.url,
            title: input.title,
            description: input.description,
            position: input.position.unwrap_or(Position {
                x: 350.0 + (map.len() as f64) * 20.0,
                y: 250.0 + (map.len() as f64) * 20.0,
            }),
            size: input.size.unwrap_or(Size {
                width: 300.0,
                height: 180.0,
            }),
            z_index: *next_z,
            created_at: now_ms(),
        };
        *next_z += 1;
        map.insert(node.id.clone(), node.clone());
        node
    }

    pub fn update(&self, id: &str, patch: WebNodePatch) -> Option<WebNode> {
        let mut guard = self.inner.lock().unwrap();
        let (map, _) = &mut *guard;
        let node = map.get_mut(id)?;
        if let Some(u) = patch.url {
            node.url = u;
        }
        if let Some(t) = patch.title {
            node.title = Some(t);
        }
        if let Some(d) = patch.description {
            node.description = Some(d);
        }
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

    pub fn get(&self, id: &str) -> Option<WebNode> {
        self.inner.lock().unwrap().0.get(id).cloned()
    }

    pub fn replace_all(&self, nodes: Vec<WebNode>) {
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
}

impl Default for WebNodeStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Fetch a URL's text content with a reasonable byte cap. Returns body text
/// (if the response is text-ish) plus content-type for the caller to branch on.
pub fn fetch_text(url: &str, max_bytes: usize) -> Result<(String, String), String> {
    let resp = ureq::get(url)
        .timeout(std::time::Duration::from_secs(10))
        .call()
        .map_err(|e| format!("fetch {}: {}", url, e))?;
    let content_type = resp
        .header("content-type")
        .unwrap_or("application/octet-stream")
        .to_string();
    let mut reader = resp.into_reader().take(max_bytes as u64);
    let mut buf = Vec::new();
    use std::io::Read;
    reader
        .read_to_end(&mut buf)
        .map_err(|e| format!("read body: {}", e))?;
    let body = String::from_utf8_lossy(&buf).to_string();
    Ok((body, content_type))
}
