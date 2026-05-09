/// Tauri IPC commands for the skills subsystem.
///
/// Exposed commands:
///   skill_list   — list skills (optional role/source filter)
///   skill_get    — get one skill by name
///   skill_save   — write a skill file to user or project scope
///   skill_delete — delete a skill file from user or project scope
use std::path::Path;

use super::storage::{Skill, SkillSource};

// ─── skill_list ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn skill_list(
    role: Option<String>,
    tag: Option<String>,
    source: Option<String>,
    cwd: Option<String>,
) -> Result<Vec<Skill>, String> {
    let cwd_path = cwd
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Path::new)
        .unwrap_or(Path::new("."));

    let mut skills = super::storage::load_skills(cwd_path);

    if let Some(ref r) = role {
        skills.retain(|s| s.roles.iter().any(|sr| sr.eq_ignore_ascii_case(r)));
    }
    if let Some(ref t) = tag {
        skills.retain(|s| s.tags.iter().any(|st| st.eq_ignore_ascii_case(t)));
    }
    if let Some(ref src) = source {
        let want = match src.as_str() {
            "user" => SkillSource::User,
            "project" => SkillSource::Project,
            _ => return Err(format!("unknown source: {}", src)),
        };
        skills.retain(|s| s.source == want);
    }

    Ok(skills)
}

// ─── skill_get ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn skill_get(name: String, cwd: Option<String>) -> Result<Skill, String> {
    let cwd_path = cwd
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(Path::new)
        .unwrap_or(Path::new("."));

    let skills = super::storage::load_skills(cwd_path);
    skills
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("skill not found: {}", name))
}

// ─── skill_save ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn skill_save(
    skill: Skill,
    scope: String,
    cwd: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let dir = resolve_skills_dir(&scope, cwd.as_deref())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create skills dir: {}", e))?;

    let filename = format!("{}.md", skill.name);
    let dest = dir.join(&filename);

    if dest.exists() && !force.unwrap_or(false) {
        return Err(format!("skill already exists: {}", skill.name));
    }

    let content = skill_to_markdown(&skill);
    std::fs::write(&dest, content).map_err(|e| format!("write error: {}", e))?;
    Ok(())
}

// ─── skill_delete ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn skill_delete(name: String, scope: String, cwd: Option<String>) -> Result<(), String> {
    let dir = resolve_skills_dir(&scope, cwd.as_deref())?;
    let dest = dir.join(format!("{}.md", name));

    if !dest.exists() {
        return Err(format!("skill not found in {} scope: {}", scope, name));
    }

    std::fs::remove_file(&dest).map_err(|e| format!("delete error: {}", e))?;
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────

fn resolve_skills_dir(scope: &str, cwd: Option<&str>) -> Result<std::path::PathBuf, String> {
    match scope {
        "user" => {
            let home = dirs::home_dir().ok_or("cannot find home directory")?;
            Ok(home.join(".wodouyao").join("skills"))
        }
        "project" => {
            let cwd_path = cwd
                .filter(|s| !s.is_empty())
                .ok_or("project scope requires cwd")?;
            Ok(Path::new(cwd_path).join(".wodouyao").join("skills"))
        }
        _ => Err(format!("unknown scope: {}", scope)),
    }
}

fn skill_to_markdown(skill: &Skill) -> String {
    let mut fm = String::from("---\n");
    fm.push_str(&format!("name: {}\n", skill.name));
    if let Some(ref desc) = skill.description {
        fm.push_str(&format!("description: \"{}\"\n", desc.replace('"', "\\\"")));
    }
    if let Some(ref ver) = skill.version {
        fm.push_str(&format!("version: {}\n", ver));
    }
    if !skill.roles.is_empty() {
        fm.push_str("roles:\n");
        for r in &skill.roles {
            fm.push_str(&format!("  - {}\n", r));
        }
    }
    if !skill.triggers.is_empty() {
        fm.push_str("triggers:\n");
        for t in &skill.triggers {
            fm.push_str(&format!("  - \"{}\"\n", t.replace('"', "\\\"")));
        }
    }
    if !skill.tags.is_empty() {
        fm.push_str("tags:\n");
        for t in &skill.tags {
            fm.push_str(&format!("  - {}\n", t));
        }
    }
    if let Some(ref author) = skill.author {
        fm.push_str(&format!("author: {}\n", author));
    }
    fm.push_str("---\n");

    if skill.body.is_empty() {
        fm
    } else {
        format!("{}\n{}", fm, skill.body)
    }
}
