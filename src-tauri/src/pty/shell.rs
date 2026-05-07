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
        // 1) Ask the OS directory service for the user's login shell.
        //    This reflects `chsh -s` immediately, even when our process'
        //    inherited $SHELL is stale (e.g. wodouyao.app was launched
        //    by launchd before the chsh ran).
        if let Some(shell_path) = login_shell_from_os() {
            let path = PathBuf::from(&shell_path);
            if path.exists() {
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                return ShellInfo {
                    path: shell_path,
                    name: name.clone(),
                    shell_type: infer_shell_type(&name),
                };
            }
        }
        // 2) Fall back to $SHELL (only used if the OS lookup failed).
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
        // 3) Hardcoded fallback.
        for (path, name, st) in [
            ("/opt/homebrew/bin/fish", "fish", ShellType::Fish),
            ("/usr/local/bin/fish", "fish", ShellType::Fish),
            ("/usr/bin/fish", "fish", ShellType::Fish),
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

/// Read the calling user's login shell from the OS directory service.
/// macOS uses Open Directory (dscl); other unices use getent passwd.
/// Returns None if the lookup fails or output is unparsable; callers
/// should fall back to $SHELL or hardcoded paths.
#[cfg(not(target_os = "windows"))]
fn login_shell_from_os() -> Option<String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        // `dscl . -read ~/ UserShell` prints "UserShell: /opt/homebrew/bin/fish".
        let out = Command::new("dscl")
            .args([".", "-read", &format!("/Users/{}", whoami_string()?), "UserShell"])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8(out.stdout).ok()?;
        let line = text.lines().find(|l| l.starts_with("UserShell:"))?;
        let path = line.trim_start_matches("UserShell:").trim();
        if path.is_empty() { None } else { Some(path.to_string()) }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // `getent passwd <user>` prints "user:x:uid:gid:gecos:home:shell".
        let user = whoami_string()?;
        let out = Command::new("getent")
            .args(["passwd", &user])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8(out.stdout).ok()?;
        let line = text.lines().next()?;
        let shell = line.split(':').nth(6)?.trim();
        if shell.is_empty() { None } else { Some(shell.to_string()) }
    }
}

#[cfg(not(target_os = "windows"))]
fn whoami_string() -> Option<String> {
    std::env::var("USER")
        .ok()
        .or_else(|| std::env::var("LOGNAME").ok())
        .filter(|s| !s.is_empty())
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
            ("/opt/homebrew/bin/fish", "fish", ShellType::Fish),
            ("/usr/local/bin/fish", "fish", ShellType::Fish),
            ("/usr/bin/fish", "fish", ShellType::Fish),
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
