//! Deel HQ's `axe_look` (black|glass) via `~/.axe/look`.
//! HQ schrijft bij wissel (zet_plaat_materiaal); overlay pollt en emit't.

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

const POLL_MS: u64 = 500;
const DEFAULT_LOOK: &str = "glass";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LookState {
    pub look: String,
}

fn look_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join(".axe").join("look"))
}

pub fn read_look() -> LookState {
    let raw = look_path()
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| s == "black" || s == "glass")
        .unwrap_or_else(|| DEFAULT_LOOK.to_string());
    LookState { look: raw }
}

pub fn write_look(look: &str) -> Result<(), String> {
    if look != "black" && look != "glass" {
        return Err(format!("onbekende look: {look}"));
    }
    let path = look_path().ok_or_else(|| "HOME niet gezet".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir ~/.axe: {e}"))?;
    }
    fs::write(&path, look).map_err(|e| format!("schrijf ~/.axe/look: {e}"))
}

pub fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    std::mem::forget(stop);

    thread::spawn(move || {
        let mut last: Option<LookState> = None;
        thread::sleep(Duration::from_millis(200));
        while !stop_flag.load(Ordering::Relaxed) {
            let state = read_look();
            let changed = last.as_ref().map(|l| l != &state).unwrap_or(true);
            if changed {
                let _ = app.emit("axe-look", &state);
                last = Some(state);
            }
            thread::sleep(Duration::from_millis(POLL_MS));
        }
    });
}
