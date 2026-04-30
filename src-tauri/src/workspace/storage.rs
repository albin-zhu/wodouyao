use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::file_nodes::FileNode;
use crate::hub::{Team, Wire};
use crate::notes::Note;
use crate::task_boards::TaskBoard;
use crate::tasks::Task;

#[derive(Serialize, Deserialize, Clone)]
pub struct Position {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Dimensions {
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CanvasState {
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    pub grid_visible: bool,
    pub grid_size: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TerminalNodeLayout {
    pub id: String,
    pub name: String,
    pub shell_type: String,
    pub initial_command: Option<String>,
    pub position: Position,
    pub size: Dimensions,
    pub is_folded: bool,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub cwd: Option<String>,
    pub canvas: CanvasState,
    pub terminals: Vec<TerminalNodeLayout>,
    #[serde(default)]
    pub wires: Vec<Wire>,
    #[serde(default)]
    pub teams: Vec<Team>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub notes: Vec<Note>,
    #[serde(default)]
    pub file_nodes: Vec<FileNode>,
    #[serde(default)]
    pub task_boards: Vec<TaskBoard>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WorkspaceMeta {
    pub id: String,
    pub name: String,
    pub terminal_count: usize,
    pub updated_at: u64,
}

// ── Storage layout ────────────────────────────────────────────────────────
//
// Per-project workspace data is stored in-tree at `$cwd/.wodouyao/`:
//
//   $cwd/.wodouyao/
//   ├── CLAUDE.md              (agent cheatsheet, generated on first spawn)
//   ├── workspace.json         (meta + canvas + terminal layouts + entities)
//   ├── sessions.json          (agent session recovery info)
//   └── tasks/<id>/docs/*.md   (task documents)
//
// A global catalog at `~/Library/Application Support/com.wodouyao.app/
// workspaces.json` maps workspace_id → cwd so the app can list known
// workspaces without scanning the filesystem. Legacy per-workspace JSON
// files under `workspaces/<id>.json` (pre-refactor) are migrated on first
// read: anything with a valid, existing cwd gets copied into that cwd's
// `.wodouyao/` and de-registered from the old dir.

fn app_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Cannot find data directory")?;
    let dir = base.join("com.wodouyao.app");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create app data dir: {}", e))?;
    Ok(dir)
}

fn legacy_workspaces_dir() -> Result<PathBuf, String> {
    let dir = app_data_dir()?.join("workspaces");
    // Don't create if absent — we want to know whether legacy state exists.
    Ok(dir)
}

fn catalog_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("workspaces.json"))
}

/// Project-level `.wodouyao/` directory for a given cwd. Created on demand.
fn project_dir(cwd: &str) -> Result<PathBuf, String> {
    let dir = PathBuf::from(cwd).join(".wodouyao");
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create .wodouyao/: {}", e))?;
    Ok(dir)
}

/// Bundle of per-project paths for convenient access.
pub struct ProjectPaths {
    pub root: PathBuf,
    pub workspace_json: PathBuf,
    pub sessions_json: PathBuf,
    pub tasks_dir: PathBuf,
}

pub fn project_paths(cwd: &str) -> Result<ProjectPaths, String> {
    let root = project_dir(cwd)?;
    Ok(ProjectPaths {
        workspace_json: root.join("workspace.json"),
        sessions_json: root.join("sessions.json"),
        tasks_dir: root.join("tasks"),
        root,
    })
}

#[derive(Serialize, Deserialize, Default)]
struct Catalog {
    #[serde(default)]
    entries: Vec<CatalogEntry>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CatalogEntry {
    id: String,
    name: String,
    cwd: String,
    #[serde(default)]
    updated_at: u64,
}

fn read_catalog() -> Catalog {
    let Ok(p) = catalog_path() else {
        return Catalog::default();
    };
    if !p.exists() {
        return Catalog::default();
    }
    match fs::read_to_string(&p) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Catalog::default(),
    }
}

fn write_catalog(cat: &Catalog) -> Result<(), String> {
    let p = catalog_path()?;
    let json = serde_json::to_string_pretty(cat).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| format!("Failed to write catalog: {}", e))
}

fn upsert_catalog(entry: CatalogEntry) {
    let mut cat = read_catalog();
    cat.entries.retain(|e| e.id != entry.id);
    cat.entries.push(entry);
    let _ = write_catalog(&cat);
}

fn remove_from_catalog(id: &str) {
    let mut cat = read_catalog();
    let before = cat.entries.len();
    cat.entries.retain(|e| e.id != id);
    if cat.entries.len() != before {
        let _ = write_catalog(&cat);
    }
}

/// One-shot migration from the legacy `~/Library/.../workspaces/<id>.json`
/// layout. For each legacy file whose `cwd` field still points at an
/// existing directory, copy to `$cwd/.wodouyao/workspace.json` and register
/// the workspace in the catalog. The legacy file is renamed with a
/// `.migrated` suffix so the operation is one-way but recoverable.
/// Idempotent — running it twice is safe.
pub fn migrate_legacy_workspaces() {
    let Ok(legacy) = legacy_workspaces_dir() else {
        return;
    };
    if !legacy.exists() {
        return;
    }
    let Ok(entries) = fs::read_dir(&legacy) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let Ok(json) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(ws) = serde_json::from_str::<Workspace>(&json) else {
            continue;
        };
        let Some(cwd) = ws.cwd.as_deref().filter(|s| !s.is_empty()) else {
            continue;
        };
        if !PathBuf::from(cwd).is_dir() {
            continue;
        }
        // Copy workspace file into .wodouyao/
        let Ok(paths) = project_paths(cwd) else {
            continue;
        };
        if paths.workspace_json.exists() {
            // Project already has a .wodouyao/workspace.json; don't overwrite.
            // Still de-register the legacy file so list() doesn't double up.
            let _ = fs::rename(&path, path.with_extension("json.migrated"));
            upsert_catalog(CatalogEntry {
                id: ws.id.clone(),
                name: ws.name.clone(),
                cwd: cwd.to_string(),
                updated_at: ws.updated_at,
            });
            continue;
        }
        if fs::write(&paths.workspace_json, &json).is_ok() {
            upsert_catalog(CatalogEntry {
                id: ws.id.clone(),
                name: ws.name.clone(),
                cwd: cwd.to_string(),
                updated_at: ws.updated_at,
            });
            let _ = fs::rename(&path, path.with_extension("json.migrated"));
        }
    }
}

pub fn save(workspace: &Workspace) -> Result<(), String> {
    let json = serde_json::to_string_pretty(workspace).map_err(|e| e.to_string())?;
    // Primary write: project-local `.wodouyao/workspace.json`. Requires cwd.
    if let Some(cwd) = workspace.cwd.as_deref().filter(|s| !s.is_empty()) {
        let paths = project_paths(cwd)?;
        fs::write(&paths.workspace_json, &json)
            .map_err(|e| format!("Failed to save workspace: {}", e))?;
        upsert_catalog(CatalogEntry {
            id: workspace.id.clone(),
            name: workspace.name.clone(),
            cwd: cwd.to_string(),
            updated_at: workspace.updated_at,
        });
        return Ok(());
    }
    // Legacy fallback: workspace has no cwd, write to ~/Library so it's at
    // least persisted somewhere.
    let dir = legacy_workspaces_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create legacy dir: {}", e))?;
    let path = dir.join(format!("{}.json", workspace.id));
    fs::write(path, json).map_err(|e| format!("Failed to save workspace: {}", e))
}

pub fn load(id: &str) -> Result<Workspace, String> {
    // Try catalog → project path first.
    let cat = read_catalog();
    if let Some(entry) = cat.entries.iter().find(|e| e.id == id) {
        let paths = project_paths(&entry.cwd)?;
        if paths.workspace_json.exists() {
            let json = fs::read_to_string(&paths.workspace_json)
                .map_err(|e| format!("Failed to read workspace: {}", e))?;
            return serde_json::from_str(&json)
                .map_err(|e| format!("Failed to parse workspace: {}", e));
        }
    }
    // Fallback: legacy single-file location.
    let path = legacy_workspaces_dir()?.join(format!("{}.json", id));
    let json =
        fs::read_to_string(path).map_err(|e| format!("Failed to read workspace: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("Failed to parse workspace: {}", e))
}

pub fn list() -> Result<Vec<WorkspaceMeta>, String> {
    migrate_legacy_workspaces();
    let cat = read_catalog();
    let mut metas: Vec<WorkspaceMeta> = cat
        .entries
        .into_iter()
        .filter_map(|e| {
            // Read the project file to fetch terminal_count without hydrating
            // the whole thing into memory indefinitely.
            let paths = project_paths(&e.cwd).ok()?;
            let json = fs::read_to_string(&paths.workspace_json).ok()?;
            let ws: Workspace = serde_json::from_str(&json).ok()?;
            Some(WorkspaceMeta {
                id: ws.id,
                name: ws.name,
                terminal_count: ws.terminals.len(),
                updated_at: ws.updated_at,
            })
        })
        .collect();

    // Include any un-migrated legacy workspaces (cwd missing or stale dir).
    if let Ok(legacy) = legacy_workspaces_dir() {
        if legacy.exists() {
            if let Ok(entries) = fs::read_dir(&legacy) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.extension().is_none_or(|ext| ext != "json") {
                        continue;
                    }
                    let Ok(json) = fs::read_to_string(&p) else {
                        continue;
                    };
                    let Ok(ws) = serde_json::from_str::<Workspace>(&json) else {
                        continue;
                    };
                    if metas.iter().any(|m| m.id == ws.id) {
                        continue;
                    }
                    metas.push(WorkspaceMeta {
                        id: ws.id,
                        name: ws.name,
                        terminal_count: ws.terminals.len(),
                        updated_at: ws.updated_at,
                    });
                }
            }
        }
    }

    metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(metas)
}

pub fn delete(id: &str) -> Result<(), String> {
    let cat = read_catalog();
    if let Some(entry) = cat.entries.iter().find(|e| e.id == id).cloned() {
        if let Ok(paths) = project_paths(&entry.cwd) {
            let _ = fs::remove_file(&paths.workspace_json);
        }
    }
    remove_from_catalog(id);
    // Also remove legacy file if present.
    if let Ok(legacy) = legacy_workspaces_dir() {
        let path = legacy.join(format!("{}.json", id));
        let _ = fs::remove_file(path);
    }
    Ok(())
}
