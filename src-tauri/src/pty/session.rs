use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};
use std::collections::VecDeque;
use std::io::{Read, Write};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use super::shell::ShellType;

const RING_BUFFER_CAPACITY: usize = 64 * 1024;

#[derive(serde::Serialize, Clone)]
pub struct TerminalOutputPayload {
    pub id: String,
    pub data: Vec<u8>,
}

#[derive(serde::Serialize, Clone)]
pub struct TerminalExitPayload {
    pub id: String,
    pub exit_code: Option<u32>,
}

pub struct PtySession {
    pub id: String,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn Child + Send + Sync>,
    pub shell_type: ShellType,
    pub cols: u16,
    pub rows: u16,
    pub ring_buffer: Arc<Mutex<VecDeque<u8>>>,
    pub subscribers: Arc<Mutex<Vec<mpsc::Sender<Vec<u8>>>>>,
}

impl PtySession {
    pub fn spawn(
        id: String,
        shell_path: &str,
        command: Option<&str>,
        cols: u16,
        rows: u16,
        cwd: Option<&str>,
        env: &[(String, String)],
        fast_start: bool,
        app_handle: AppHandle,
    ) -> Result<Self, String> {
        let pty_system = portable_pty::native_pty_system();

        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(shell_path);
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        // portable-pty's CommandBuilder starts with an EMPTY environment by
        // default, which breaks a bunch of things:
        //   - `TERM` absent → tools like Claude / git / less assume dumb
        //     terminal and drop ANSI colors and alt-screen support.
        //   - `HOME` / `USER` absent → shell rc files and many CLIs fail or
        //     refuse to write caches.
        //   - `LANG` absent → UTF-8 glyphs render as `?`.
        //
        // Seed a sensible baseline, then let the caller's env (and the
        // hard-coded terminal capability advertisement below) win.
        let baseline_keys = [
            "HOME",
            "USER",
            "LOGNAME",
            "SHELL",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "TMPDIR",
            "TZ",
            "SSH_AUTH_SOCK",
        ];
        for key in baseline_keys {
            if let Ok(val) = std::env::var(key) {
                if !val.is_empty() {
                    cmd.env(key, val);
                }
            }
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        for (k, v) in env {
            cmd.env(k, v);
        }
        if fast_start {
            // Skip rc/profile files so the shell drops into an interactive
            // prompt instantly. User loses PATH / aliases / custom prompt.
            let basename = std::path::Path::new(shell_path)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            // Strip trailing ".exe" on Windows.
            let basename = basename.trim_end_matches(".exe");
            match basename {
                "zsh" => {
                    cmd.arg("--no-rcs");
                    cmd.arg("--no-global-rcs");
                }
                "bash" | "sh" => {
                    cmd.arg("--noprofile");
                    cmd.arg("--norc");
                }
                "fish" => {
                    cmd.arg("-N");
                }
                "pwsh" | "powershell" => {
                    cmd.arg("-NoProfile");
                }
                _ => {} // unknown shell: best-effort, do nothing
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        // Drop the slave side - we only need the master
        drop(pair.slave);

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        let ring_buffer: Arc<Mutex<VecDeque<u8>>> =
            Arc::new(Mutex::new(VecDeque::with_capacity(RING_BUFFER_CAPACITY)));
        let ring_for_reader = Arc::clone(&ring_buffer);
        let subscribers: Arc<Mutex<Vec<mpsc::Sender<Vec<u8>>>>> =
            Arc::new(Mutex::new(Vec::new()));
        let subscribers_for_reader = Arc::clone(&subscribers);

        // Use a plain std::thread instead of tokio — no runtime needed
        let reader_id = id.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = app_handle.emit(
                            &format!("terminal-exit-{}", reader_id),
                            TerminalExitPayload {
                                id: reader_id.clone(),
                                exit_code: None,
                            },
                        );
                        break;
                    }
                    Ok(n) => {
                        if let Ok(mut ring) = ring_for_reader.lock() {
                            let slice = &buf[..n];
                            if slice.len() >= RING_BUFFER_CAPACITY {
                                ring.clear();
                                ring.extend(&slice[slice.len() - RING_BUFFER_CAPACITY..]);
                            } else {
                                let overflow = (ring.len() + slice.len())
                                    .saturating_sub(RING_BUFFER_CAPACITY);
                                for _ in 0..overflow {
                                    ring.pop_front();
                                }
                                ring.extend(slice);
                            }
                        }
                        if let Ok(mut subs) = subscribers_for_reader.lock() {
                            let slice = &buf[..n];
                            subs.retain(|s| s.send(slice.to_vec()).is_ok());
                        }
                        let _ = app_handle.emit(
                            &format!("terminal-output-{}", reader_id),
                            TerminalOutputPayload {
                                id: reader_id.clone(),
                                data: buf[..n].to_vec(),
                            },
                        );
                    }
                    Err(_) => {
                        let _ = app_handle.emit(
                            &format!("terminal-exit-{}", reader_id),
                            TerminalExitPayload {
                                id: reader_id.clone(),
                                exit_code: None,
                            },
                        );
                        break;
                    }
                }
            }
        });

        let shell_type = super::shell::detect_default_shell().shell_type;

        let mut session = PtySession {
            id,
            master: pair.master,
            writer,
            child,
            shell_type,
            cols,
            rows,
            ring_buffer,
            subscribers,
        };

        // If an initial command is provided, write it after a short delay
        if let Some(cmd_str) = command {
            let cmd_with_newline = format!("{}\n", cmd_str);
            let _ = session.writer.write_all(cmd_with_newline.as_bytes());
            let _ = session.writer.flush();
        }

        Ok(session)
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), String> {
        self.writer
            .write_all(data)
            .map_err(|e| format!("Write failed: {}", e))?;
        self.writer
            .flush()
            .map_err(|e| format!("Flush failed: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize failed: {}", e))
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
    }

    pub fn subscribe(&self) -> mpsc::Receiver<Vec<u8>> {
        let (tx, rx) = mpsc::channel();
        if let Ok(mut subs) = self.subscribers.lock() {
            subs.push(tx);
        }
        rx
    }

    pub fn recent_output(&self, max_bytes: usize) -> Vec<u8> {
        let Ok(ring) = self.ring_buffer.lock() else {
            return Vec::new();
        };
        let len = ring.len();
        let take = max_bytes.min(len);
        let start = len - take;
        ring.iter().skip(start).copied().collect()
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
