//! Claude Code integration: install the `wodouyao` skill into
//! `~/.claude/skills/wodouyao/` and inject a marker block into
//! `~/.claude/CLAUDE.md`.

use std::path::{Path, PathBuf};

use super::common::{
    copy_dir_if_newer, has_marker_block, inject_marker_block, remove_dir_if_exists,
    remove_marker_block,
};
use super::IntegrationStatus;

pub const SKILL_NAME: &str = "wodouyao";

const CLAUDE_MD_BLOCK: &str = r#"## Wodouyao terminal integration

When the `WODOUYAO_ID` environment variable is set, you are running inside a
Wodouyao canvas terminal. Use the `wodouyao` skill to collaborate with other
terminals on the canvas:

- `wodouyao peers` — list wired peer terminal ids
- `wodouyao spawn --name N --command C` — create a new terminal (auto-wired)
- `wodouyao send <peer> "<text>" Enter` — drive input on a peer
- `wodouyao read <peer>` — fetch a peer's recent output
- `wodouyao whoami` / `wodouyao hello --name N --kind K` — identity

Wires on the canvas act as an ACL — only directly connected peers are
reachable. Full reference is in the `wodouyao` skill."#;

pub fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

fn claude_dir() -> Option<PathBuf> {
    home().map(|h| h.join(".claude"))
}

fn skill_target() -> Option<PathBuf> {
    claude_dir().map(|d| d.join("skills").join(SKILL_NAME))
}

fn claude_md() -> Option<PathBuf> {
    claude_dir().map(|d| d.join("CLAUDE.md"))
}

fn skill_source(resource_dir: &Path) -> PathBuf {
    resource_dir
        .join("resources")
        .join("skills")
        .join(SKILL_NAME)
}

pub fn status() -> IntegrationStatus {
    let skill_installed = skill_target().map(|p| p.exists()).unwrap_or(false);
    let doc_installed = claude_md().map(|p| has_marker_block(&p)).unwrap_or(false);
    IntegrationStatus {
        agent: super::Agent::Claude,
        skill_installed,
        doc_installed,
    }
}

pub fn install(resource_dir: &Path) -> Result<IntegrationStatus, String> {
    let src = skill_source(resource_dir);
    if !src.exists() {
        return Err(format!("bundled skill missing at {}", src.display()));
    }
    let target = skill_target().ok_or_else(|| "no home dir".to_string())?;
    copy_dir_if_newer(&src, &target)?;

    let md = claude_md().ok_or_else(|| "no home dir".to_string())?;
    inject_marker_block(&md, CLAUDE_MD_BLOCK)?;

    Ok(status())
}

pub fn uninstall() -> Result<IntegrationStatus, String> {
    if let Some(target) = skill_target() {
        remove_dir_if_exists(&target)?;
    }
    if let Some(md) = claude_md() {
        remove_marker_block(&md)?;
    }
    Ok(status())
}
