//! Codex integration: install the `wodouyao` skill into `~/.codex/skills/wodouyao/`.

use std::path::{Path, PathBuf};

use super::common::{copy_dir_if_newer, remove_dir_if_exists};
use super::IntegrationStatus;

pub const SKILL_NAME: &str = "wodouyao";

fn codex_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex"))
}

fn skill_target() -> Option<PathBuf> {
    codex_dir().map(|d| d.join("skills").join(SKILL_NAME))
}

fn skill_source(resource_dir: &Path) -> PathBuf {
    resource_dir
        .join("resources")
        .join("skills")
        .join(SKILL_NAME)
}

pub fn status() -> IntegrationStatus {
    let skill_installed = skill_target().map(|p| p.exists()).unwrap_or(false);
    IntegrationStatus {
        agent: super::Agent::Codex,
        skill_installed,
        doc_installed: false,
    }
}

pub fn install(resource_dir: &Path) -> Result<IntegrationStatus, String> {
    let src = skill_source(resource_dir);
    if !src.exists() {
        return Err(format!("bundled skill missing at {}", src.display()));
    }
    let target = skill_target().ok_or_else(|| "no home dir".to_string())?;
    copy_dir_if_newer(&src, &target)?;
    Ok(status())
}

pub fn uninstall() -> Result<IntegrationStatus, String> {
    if let Some(target) = skill_target() {
        remove_dir_if_exists(&target)?;
    }
    Ok(status())
}
