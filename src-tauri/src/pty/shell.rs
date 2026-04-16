use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ShellType {
    Bash,
    Zsh,
    PowerShell,
    Pwsh,
    Cmd,
    Fish,
    Custom(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShellInfo {
    pub path: String,
    pub name: String,
    pub shell_type: ShellType,
}

pub fn detect_default_shell() -> ShellInfo {
    #[cfg(target_os = "windows")]
    {
        if let Ok(path) = which::which("pwsh") {
            return ShellInfo {
                path: path.to_string_lossy().into_owned(),
                name: "PowerShell 7".into(),
                shell_type: ShellType::Pwsh,
            };
        }
        if let Ok(path) = which::which("powershell") {
            return ShellInfo {
                path: path.to_string_lossy().into_owned(),
                name: "PowerShell".into(),
                shell_type: ShellType::PowerShell,
            };
        }
        ShellInfo {
            path: "cmd.exe".into(),
            name: "Command Prompt".into(),
            shell_type: ShellType::Cmd,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(shell_env) = std::env::var("SHELL") {
            let path = PathBuf::from(&shell_env);
            if path.exists() {
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                let shell_type = infer_shell_type(&name);
                return ShellInfo {
                    path: shell_env,
                    name,
                    shell_type,
                };
            }
        }
        // Fallback
        for (path, name, st) in [
            ("/bin/zsh", "zsh", ShellType::Zsh),
            ("/bin/bash", "bash", ShellType::Bash),
            ("/bin/sh", "sh", ShellType::Bash),
        ] {
            if PathBuf::from(path).exists() {
                return ShellInfo {
                    path: path.into(),
                    name: name.into(),
                    shell_type: st,
                };
            }
        }
        ShellInfo {
            path: "/bin/sh".into(),
            name: "sh".into(),
            shell_type: ShellType::Bash,
        }
    }
}

pub fn list_available_shells() -> Vec<ShellInfo> {
    let mut shells = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(path) = which::which("pwsh") {
            shells.push(ShellInfo {
                path: path.to_string_lossy().into_owned(),
                name: "PowerShell 7".into(),
                shell_type: ShellType::Pwsh,
            });
        }
        if let Ok(path) = which::which("powershell") {
            shells.push(ShellInfo {
                path: path.to_string_lossy().into_owned(),
                name: "PowerShell".into(),
                shell_type: ShellType::PowerShell,
            });
        }
        if let Ok(path) = which::which("cmd") {
            shells.push(ShellInfo {
                path: path.to_string_lossy().into_owned(),
                name: "Command Prompt".into(),
                shell_type: ShellType::Cmd,
            });
        }
        // Git Bash
        let git_bash = PathBuf::from(r"C:\Program Files\Git\bin\bash.exe");
        if git_bash.exists() {
            shells.push(ShellInfo {
                path: git_bash.to_string_lossy().into_owned(),
                name: "Git Bash".into(),
                shell_type: ShellType::Bash,
            });
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        for (path, name, st) in [
            ("/bin/zsh", "zsh", ShellType::Zsh),
            ("/bin/bash", "bash", ShellType::Bash),
            ("/usr/bin/fish", "fish", ShellType::Fish),
            ("/usr/local/bin/fish", "fish", ShellType::Fish),
            ("/bin/sh", "sh", ShellType::Bash),
        ] {
            if PathBuf::from(path).exists() {
                shells.push(ShellInfo {
                    path: path.into(),
                    name: name.into(),
                    shell_type: st,
                });
            }
        }
    }

    shells
}

#[cfg(not(target_os = "windows"))]
fn infer_shell_type(name: &str) -> ShellType {
    match name {
        "bash" => ShellType::Bash,
        "zsh" => ShellType::Zsh,
        "fish" => ShellType::Fish,
        "pwsh" => ShellType::Pwsh,
        _ => ShellType::Custom(name.to_string()),
    }
}
