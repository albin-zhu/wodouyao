//! Shared file operations for agent integrations.

use std::fs;
use std::path::Path;
use std::time::SystemTime;

/// Copy every file under `src` into `dst` when the target is missing or stale.
/// Returns `true` if a copy actually happened.
pub fn copy_dir_if_newer(src: &Path, dst: &Path) -> Result<bool, String> {
    if !src.exists() {
        return Err(format!("source missing: {}", src.display()));
    }
    if dst.exists() && !source_is_newer(src, dst) {
        return Ok(false);
    }
    if dst.exists() {
        fs::remove_dir_all(dst).map_err(|e| format!("clear old: {}", e))?;
    }
    copy_dir_recursive(src, dst)?;
    Ok(true)
}

pub fn remove_dir_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path).map_err(|e| format!("remove {}: {}", path.display(), e))?;
    }
    Ok(())
}

fn source_is_newer(source: &Path, target: &Path) -> bool {
    let s = latest_mtime(source).unwrap_or(SystemTime::UNIX_EPOCH);
    let t = latest_mtime(target).unwrap_or(SystemTime::UNIX_EPOCH);
    s > t
}

fn latest_mtime(root: &Path) -> Option<SystemTime> {
    let mut latest = None;
    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        let meta = fs::metadata(&path).ok()?;
        if let Ok(m) = meta.modified() {
            latest = Some(latest.map_or(m, |cur: SystemTime| cur.max(m)));
        }
        if meta.is_dir() {
            let entries = fs::read_dir(&path).ok()?;
            for entry in entries.flatten() {
                stack.push(entry.path());
            }
        }
    }
    latest
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("create {}: {}", dst.display(), e))?;
    let entries = fs::read_dir(src).map_err(|e| format!("read {}: {}", src.display(), e))?;
    for entry in entries.flatten() {
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if ty.is_file() {
            fs::copy(&from, &to).map_err(|e| format!("copy {}: {}", from.display(), e))?;
        }
    }
    Ok(())
}

pub const MARKER_BEGIN: &str = "<!-- wodouyao:begin -->";
pub const MARKER_END: &str = "<!-- wodouyao:end -->";

/// Inject `block` between markers in `path`, or replace an existing marker
/// block. Creates the file if missing. Leaves existing user content outside
/// the markers untouched.
pub fn inject_marker_block(path: &Path, block: &str) -> Result<(), String> {
    let existing = if path.exists() {
        fs::read_to_string(path).map_err(|e| format!("read {}: {}", path.display(), e))?
    } else {
        String::new()
    };
    let wrapped = format!("{}\n{}\n{}", MARKER_BEGIN, block.trim(), MARKER_END);
    let next = match find_block(&existing) {
        Some((start, end)) => {
            let mut s = String::with_capacity(existing.len());
            s.push_str(&existing[..start]);
            s.push_str(&wrapped);
            s.push_str(&existing[end..]);
            s
        }
        None => {
            let mut s = existing;
            if !s.is_empty() && !s.ends_with('\n') {
                s.push('\n');
            }
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str(&wrapped);
            s.push('\n');
            s
        }
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {}", e))?;
    }
    fs::write(path, next).map_err(|e| format!("write {}: {}", path.display(), e))?;
    Ok(())
}

/// Remove our marker block from `path`. No-op if the file or block is absent.
pub fn remove_marker_block(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let existing =
        fs::read_to_string(path).map_err(|e| format!("read {}: {}", path.display(), e))?;
    let Some((start, end)) = find_block(&existing) else {
        return Ok(());
    };
    let mut s = String::with_capacity(existing.len());
    s.push_str(&existing[..start]);
    // Collapse the blank line we added when injecting.
    let tail = &existing[end..];
    s.push_str(tail.trim_start_matches('\n'));
    // Strip any dangling trailing blank lines we introduced.
    while s.ends_with("\n\n\n") {
        s.pop();
    }
    fs::write(path, s).map_err(|e| format!("write {}: {}", path.display(), e))?;
    Ok(())
}

pub fn has_marker_block(path: &Path) -> bool {
    let Ok(s) = fs::read_to_string(path) else {
        return false;
    };
    find_block(&s).is_some()
}

fn find_block(s: &str) -> Option<(usize, usize)> {
    let start = s.find(MARKER_BEGIN)?;
    let end_of_end = s[start..]
        .find(MARKER_END)
        .map(|rel| start + rel + MARKER_END.len())?;
    Some((start, end_of_end))
}
