use portable_pty::{Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::thread;
use tauri::{AppHandle, Emitter};

use super::shell::ShellType;

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
}

impl PtySession {
    pub fn spawn(
        id: String,
        shell_path: &str,
        command: Option<&str>,
        cols: u16,
        rows: u16,
        cwd: Option<&str>,
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
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
