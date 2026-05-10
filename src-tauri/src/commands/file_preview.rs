use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct DirEntryInfo {
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct DirListing {
    pub entries: Vec<DirEntryInfo>,
    pub truncated: bool,
}

#[derive(Serialize)]
pub struct FileInspect {
    pub is_dir: bool,
    pub size: u64,
    pub exists: bool,
}

#[derive(Deserialize)]
pub struct FilePreviewTextArgs {
    pub path: String,
    #[serde(default)]
    pub max_bytes: Option<usize>,
}

const MAX_DIR_ENTRIES: usize = 50;
const DEFAULT_TEXT_BYTES: usize = 4096;

pub fn file_preview_text_impl(path: &str, max_bytes: Option<usize>) -> Result<String, String> {
    let cap = max_bytes.unwrap_or(DEFAULT_TEXT_BYTES);
    let bytes = fs::read(path).map_err(|e| format!("read failed: {}", e))?;
    let slice = if bytes.len() > cap { &bytes[..cap] } else { &bytes[..] };
    Ok(String::from_utf8_lossy(slice).into_owned())
}

pub fn file_preview_dir_impl(path: &str) -> Result<DirListing, String> {
    let dir = PathBuf::from(path);
    let read = fs::read_dir(&dir).map_err(|e| format!("read_dir failed: {}", e))?;
    let mut entries: Vec<DirEntryInfo> = Vec::new();
    let mut truncated = false;
    for (i, item) in read.enumerate() {
        if i >= MAX_DIR_ENTRIES {
            truncated = true;
            break;
        }
        let item = match item {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = item.file_name().to_string_lossy().into_owned();
        let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        entries.push(DirEntryInfo { name, is_dir });
    }
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(DirListing { entries, truncated })
}

pub fn file_inspect_impl(path: &str) -> Result<FileInspect, String> {
    let p = PathBuf::from(path);
    let meta = match fs::metadata(&p) {
        Ok(m) => m,
        Err(_) => {
            return Ok(FileInspect { is_dir: false, size: 0, exists: false });
        }
    };
    Ok(FileInspect {
        is_dir: meta.is_dir(),
        size: meta.len(),
        exists: true,
    })
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_preview_text(path: String, max_bytes: Option<usize>) -> Result<String, String> {
    file_preview_text_impl(&path, max_bytes)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_preview_dir(path: String) -> Result<DirListing, String> {
    file_preview_dir_impl(&path)
}

#[cfg(feature = "tauri-runtime")]
#[tauri::command]
pub fn file_inspect(path: String) -> Result<FileInspect, String> {
    file_inspect_impl(&path)
}
