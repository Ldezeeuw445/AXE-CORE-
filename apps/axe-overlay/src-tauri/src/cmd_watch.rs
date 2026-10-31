//! Watch ~/.axe/overlay.cmd for one-shot IPC from Hammerspoon / axe-keys.
//! Commands are single-line tokens; the file is truncated after each read.

use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

fn cmd_path() -> PathBuf {
    dirs_home()
        .map(|h| h.join(".axe").join("overlay.cmd"))
        .unwrap_or_else(|| PathBuf::from("/tmp/axe-overlay.cmd"))
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn ensure_parent(path: &PathBuf) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
}

/// Start a lightweight poller. Emits `overlay-cmd` with the command string.
pub fn start_watcher<R: Runtime + 'static>(app: AppHandle<R>) {
    let last = Arc::new(Mutex::new(String::new()));
    thread::spawn(move || {
        let path = cmd_path();
        ensure_parent(&path);
        loop {
            thread::sleep(Duration::from_millis(250));
            let raw = match fs::read_to_string(&path) {
                Ok(s) if !s.trim().is_empty() => s,
                _ => continue,
            };
            // Clear immediately so the same cmd isn't re-fired
            let _ = fs::write(&path, "");
            for line in raw.lines() {
                let cmd = line.trim();
                if cmd.is_empty() {
                    continue;
                }
                {
                    let mut guard = last.lock().unwrap_or_else(|e| e.into_inner());
                    // Allow repeats — Hammerspoon may re-issue expand
                    *guard = cmd.to_string();
                }
                let _ = app.emit("overlay-cmd", cmd.to_string());
                // Ensure window is visible for interactive cmds
                if matches!(
                    cmd,
                    "expand"
                        | "ptt-start"
                        | "ptt-stop"
                        | "approvals"
                        | "approve-top"
                        | "ask-about-this"
                        | "northsea-brief"
                        | "daily-brief"
                        | "focus-on"
                        | "focus-off"
                        | "manager-next"
                        | "manager-prev"
                        | "manager-open"
                ) {
                    if let Some(win) = app.get_webview_window("overlay") {
                        let _ = win.show();
                        let _ = win.set_always_on_top(true);
                    }
                }
            }
        }
    });
}
