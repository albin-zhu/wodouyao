//! Role registry. Each role is a single markdown file under
//! `~/.wodouyao/roles/<key>.md` whose YAML frontmatter declares display
//! metadata (name, glyph, color, hint, order) and whose body is the
//! agent's system prompt.
//!
//! On first boot we seed the user folder from the bundled
//! `resources/roles/*.md`. Afterwards the user folder is the source of
//! truth — edit a file and the role's prompt/metadata changes; drop a new
//! file and a new role appears in the picker.
//!
//! Conflict resolution: user dir always wins. We don't merge frontmatter;
//! a user file fully replaces the bundle's same-key file. New bundle files
//! (added by future releases) are seeded into the user dir on next launch
//! only if they don't already exist there.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
pub struct Role {
    pub key: String,
    pub name: String,
    pub glyph: String,
    pub color: String,
    pub hint: String,
    pub order: i32,
    pub prompt: String,
    /// "user" — read from `~/.wodouyao/roles/`. (We never expose bundled
    /// roles directly; they're seeded into user dir first.)
    pub source: String,
}

#[derive(Deserialize, Default)]
struct Frontmatter {
    #[serde(default)]
    key: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    glyph: Option<String>,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    hint: Option<String>,
    #[serde(default)]
    order: Option<i32>,
}

/// Split a markdown file with optional YAML frontmatter. If no `---` fence
/// is found the entire input becomes the body and frontmatter is empty.
fn parse_md(content: &str) -> Result<(Frontmatter, String), String> {
    let normalized = content.replace("\r\n", "\n");
    let trimmed = normalized.trim_start_matches('\n');
    if !trimmed.starts_with("---\n") {
        return Ok((Frontmatter::default(), trimmed.to_string()));
    }
    let after_open = &trimmed["---\n".len()..];
    // Find a line that is exactly `---` to close the block.
    let close = after_open
        .find("\n---\n")
        .or_else(|| {
            // file may end immediately after the closing fence with no
            // trailing newline.
            after_open.strip_suffix("\n---").map(|_| after_open.len() - 4)
        })
        .ok_or_else(|| "frontmatter missing closing ---".to_string())?;
    let yaml_part = &after_open[..close];
    let body = after_open[close..]
        .trim_start_matches("\n---\n")
        .trim_start_matches("\n---")
        .trim_start_matches('\n')
        .to_string();
    let frontmatter: Frontmatter =
        serde_yaml::from_str(yaml_part).map_err(|e| format!("yaml: {}", e))?;
    Ok((frontmatter, body))
}

fn read_dir_into(path: &Path, source: &str, out: &mut HashMap<String, Role>) {
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let stem = match p.file_stem().and_then(|s| s.to_str()) {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => continue,
        };
        let content = match std::fs::read_to_string(&p) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[roles] read {}: {}", p.display(), e);
                continue;
            }
        };
        let (fm, body) = match parse_md(&content) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[roles] parse {}: {}", p.display(), e);
                continue;
            }
        };
        let key = fm
            .key
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or(&stem)
            .to_lowercase();
        let role = Role {
            key: key.clone(),
            name: fm.name.unwrap_or_else(|| stem.clone()),
            glyph: fm.glyph.unwrap_or_default(),
            color: fm
                .color
                .unwrap_or_else(|| "var(--color-text-muted)".into()),
            hint: fm.hint.unwrap_or_default(),
            order: fm.order.unwrap_or(99),
            prompt: body,
            source: source.to_string(),
        };
        out.insert(key, role);
    }
}

pub fn list() -> Vec<Role> {
    let mut map: HashMap<String, Role> = HashMap::new();
    if let Some(dir) = user_dir() {
        read_dir_into(&dir, "user", &mut map);
    }
    let mut out: Vec<Role> = map.into_values().collect();
    out.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.key.cmp(&b.key)));
    out
}

pub fn get(key: &str) -> Option<Role> {
    let key_lc = key.to_lowercase();
    list().into_iter().find(|r| r.key == key_lc)
}

pub fn user_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".wodouyao").join("roles"))
}

/// Copy bundled role md files into the user dir. Skips files that already
/// exist — user edits are sacred. Called once on app start.
pub fn seed_from(resource_dir: &Path) -> Result<u32, String> {
    let target = user_dir().ok_or_else(|| "no home dir".to_string())?;
    let src = resource_dir.join("resources").join("roles");
    if !src.exists() {
        return Err(format!("bundled roles missing at {}", src.display()));
    }
    std::fs::create_dir_all(&target)
        .map_err(|e| format!("create {}: {}", target.display(), e))?;
    let entries = std::fs::read_dir(&src)
        .map_err(|e| format!("read {}: {}", src.display(), e))?;
    let mut copied = 0;
    for entry in entries.flatten() {
        let from = entry.path();
        if from.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let to = target.join(entry.file_name());
        if to.exists() {
            continue;
        }
        std::fs::copy(&from, &to).map_err(|e| format!("copy {}: {}", from.display(), e))?;
        copied += 1;
    }
    Ok(copied)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_md_with_frontmatter() {
        let s = "---\nname: PM\norder: 10\n---\n\n## Body\n\nhello\n";
        let (fm, body) = parse_md(s).unwrap();
        assert_eq!(fm.name.as_deref(), Some("PM"));
        assert_eq!(fm.order, Some(10));
        assert!(body.starts_with("## Body"));
    }

    #[test]
    fn parse_md_without_frontmatter() {
        let s = "## Plain prompt body\n";
        let (fm, body) = parse_md(s).unwrap();
        assert!(fm.name.is_none());
        assert!(body.starts_with("## Plain"));
    }
}
