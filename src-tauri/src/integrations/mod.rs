pub mod claude;
pub mod codex;
pub mod common;

use serde::Serialize;

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Agent {
    Claude,
    Codex,
}

#[derive(Serialize, Clone, Debug)]
pub struct IntegrationStatus {
    pub agent: Agent,
    /// Skill directory exists at the target.
    pub skill_installed: bool,
    /// CLAUDE.md / equivalent has our injected marker block (Claude only).
    pub doc_installed: bool,
}
