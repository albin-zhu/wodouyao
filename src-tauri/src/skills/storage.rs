/// Skills subsystem — file-based skill loading.
///
/// A skill is a Markdown file with a YAML frontmatter block:
///
/// ```markdown
/// ---
/// name: my-skill
/// description: One-line description
/// roles:
///   - backend
/// triggers:
///   - "rate limit"
/// ---
///
/// ## Body content here
/// ```
///
/// Two directories are scanned:
///   1. `~/.wodouyao/skills/*.md`  (user-level, lower priority)
///   2. `<cwd>/.wodouyao/skills/*.md` (project-level, overrides user-level on name clash)
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub triggers: Vec<String>,
    pub roles: Vec<String>,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub body: String,
    pub source: SkillSource,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillSource {
    User,
    Project,
}

/// Load all skills, applying project-level overrides on name clash.
pub fn load_skills(cwd: &Path) -> Vec<Skill> {
    let mut map: indexmap::IndexMap<String, Skill> = indexmap::IndexMap::new();

    // 1. User-level (lower priority)
    if let Some(home) = dirs::home_dir() {
        let user_dir = home.join(".wodouyao").join("skills");
        load_from_dir(&user_dir, SkillSource::User, &mut map);
    }

    // 2. Project-level (higher priority — overrides user)
    let project_dir = cwd.join(".wodouyao").join("skills");
    load_from_dir(&project_dir, SkillSource::Project, &mut map);

    map.into_values().collect()
}

fn load_from_dir(
    dir: &Path,
    source: SkillSource,
    map: &mut indexmap::IndexMap<String, Skill>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return, // directory doesn't exist — that's fine
    };

    let mut paths: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("md"))
        .collect();
    paths.sort(); // deterministic load order

    for path in paths {
        match parse_skill_file(&path, source.clone()) {
            Ok(skill) => {
                map.insert(skill.name.clone(), skill);
            }
            Err(e) => {
                log::warn!("[skills] parse error {}: {}", path.display(), e);
            }
        }
    }
}

/// Parse a single `.md` skill file.
pub fn parse_skill_file(path: &Path, source: SkillSource) -> Result<Skill, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("read error: {}", e))?;

    parse_skill_content(&content, path, source)
}

/// Parse skill content from a string (also used in CLI `add` validation).
pub fn parse_skill_content(content: &str, path: &Path, source: SkillSource) -> Result<Skill, String> {
    // Split frontmatter from body
    let (frontmatter, body) = split_frontmatter(content);

    // Parse frontmatter fields using our minimal YAML parser
    let fm = parse_yaml_frontmatter(&frontmatter)?;

    // Derive name: explicit `name:` field, or filename stem
    let name = fm.get_string("name").unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unnamed")
            .to_string()
    });

    Ok(Skill {
        name,
        description: fm.get_string("description"),
        version: fm.get_string("version"),
        triggers: fm.get_string_list("triggers"),
        roles: fm.get_string_list("roles"),
        author: fm.get_string("author"),
        tags: fm.get_string_list("tags"),
        body: body.trim_start_matches('\n').to_string(),
        source,
    })
}

/// Split `---\n<fm>\n---\n<body>` into `(frontmatter, body)`.
/// If there's no frontmatter block, returns `("", content)`.
fn split_frontmatter(content: &str) -> (String, String) {
    if !content.starts_with("---") {
        return (String::new(), content.to_string());
    }
    // Find the closing `---`
    let after_open = content.trim_start_matches("---").trim_start_matches('\n');
    if let Some(close_idx) = after_open.find("\n---") {
        let fm = after_open[..close_idx].to_string();
        let body = after_open[close_idx + 4..].to_string(); // skip "\n---"
        (fm, body)
    } else {
        (String::new(), content.to_string())
    }
}

// ─── Minimal YAML-like frontmatter parser ─────────────────────────────────
// Supports:
//   key: value          → string scalar
//   key:                → start of block list
//     - item            → list item
//   key: [a, b, c]      → inline list (flow sequence)

struct FrontmatterMap {
    entries: Vec<(String, FmValue)>,
}

enum FmValue {
    Scalar(String),
    List(Vec<String>),
}

impl FrontmatterMap {
    fn get_string(&self, key: &str) -> Option<String> {
        self.entries.iter().find(|(k, _)| k == key).and_then(|(_, v)| {
            if let FmValue::Scalar(s) = v {
                let s = s.trim().trim_matches('"').trim_matches('\'').to_string();
                if s.is_empty() { None } else { Some(s) }
            } else {
                None
            }
        })
    }

    fn get_string_list(&self, key: &str) -> Vec<String> {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| match v {
            FmValue::List(items) => items.clone(),
            FmValue::Scalar(s) => {
                // Maybe inline: "a, b, c" or "[a, b]"
                let s = s.trim().trim_matches('[').trim_matches(']');
                s.split(',')
                    .map(|x| x.trim().trim_matches('"').trim_matches('\'').to_string())
                    .filter(|x| !x.is_empty())
                    .collect()
            }
        }).unwrap_or_default()
    }
}

fn parse_yaml_frontmatter(fm: &str) -> Result<FrontmatterMap, String> {
    let mut entries: Vec<(String, FmValue)> = Vec::new();
    let mut current_key: Option<String> = None;
    let mut current_list: Vec<String> = Vec::new();

    for line in fm.lines() {
        let stripped = line.trim_end();
        if stripped.is_empty() {
            continue;
        }

        if stripped.starts_with("  - ") || stripped.starts_with("- ") {
            // List item
            let item = stripped.trim_start_matches('-').trim()
                .trim_matches('"').trim_matches('\'').to_string();
            if current_key.is_some() {
                current_list.push(item);
            }
            continue;
        }

        // Check for key: value or key:
        if let Some(colon_idx) = stripped.find(':') {
            // Flush previous key
            if let Some(key) = current_key.take() {
                if current_list.is_empty() {
                    entries.push((key, FmValue::Scalar(String::new())));
                } else {
                    entries.push((key, FmValue::List(current_list.drain(..).collect())));
                }
            }
            current_list.clear();

            let key = stripped[..colon_idx].trim().to_string();
            let value = stripped[colon_idx + 1..].trim().to_string();

            if value.is_empty() {
                // Block list follows
                current_key = Some(key);
            } else if value.starts_with('[') {
                // Inline flow sequence: [a, b, c]
                entries.push((key, FmValue::Scalar(value)));
            } else {
                // Scalar value
                entries.push((key, FmValue::Scalar(value)));
            }
        }
    }

    // Flush last key
    if let Some(key) = current_key.take() {
        if current_list.is_empty() {
            entries.push((key, FmValue::Scalar(String::new())));
        } else {
            entries.push((key, FmValue::List(current_list)));
        }
    }

    Ok(FrontmatterMap { entries })
}

/// Build the skill injection string for the given role.
/// Returns an empty string if no skills match.
pub fn skill_injection_for_role(role: Option<&str>, cwd: Option<&str>) -> String {
    let cwd_path = cwd
        .filter(|s| !s.is_empty())
        .map(Path::new)
        .unwrap_or(Path::new("."));
    let skills = load_skills(cwd_path);

    let matched: Vec<&Skill> = skills
        .iter()
        .filter(|s| {
            if s.roles.is_empty() {
                // No role restriction — inject for all
                return true;
            }
            match role {
                Some(r) => s.roles.iter().any(|sr| sr.eq_ignore_ascii_case(r)),
                None => false, // skill has role restriction but spawn has no role → skip
            }
        })
        .collect();

    if matched.is_empty() {
        return String::new();
    }

    matched
        .iter()
        .map(|s| s.body.as_str())
        .collect::<Vec<_>>()
        .join("\n\n---\n\n")
}

// Make indexmap available without adding it to Cargo.toml by using std HashMap
// Actually, let's just use a Vec + dedup logic instead to avoid new deps.
// Re-implement without indexmap:
mod indexmap {
    pub struct IndexMap<K, V> {
        keys: Vec<K>,
        vals: Vec<V>,
    }

    impl<K: PartialEq + Clone, V> IndexMap<K, V> {
        pub fn new() -> Self {
            Self { keys: vec![], vals: vec![] }
        }

        pub fn insert(&mut self, key: K, val: V) {
            if let Some(pos) = self.keys.iter().position(|k| k == &key) {
                self.vals[pos] = val;
            } else {
                self.keys.push(key);
                self.vals.push(val);
            }
        }

        pub fn into_values(self) -> impl Iterator<Item = V> {
            self.vals.into_iter()
        }
    }
}
