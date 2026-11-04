mod cmd_watch;
mod look_watch;
mod shell_watch;

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
#[cfg(not(target_os = "macos"))]
use tauri::{LogicalPosition, LogicalSize, Size};
use tauri_plugin_autostart::MacosLauncher;

#[derive(Serialize, Default)]
struct OverlayConfigDto {
    api_key: Option<String>,
    api_origin: Option<String>,
}

fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

fn home_api_key() -> Option<String> {
    let home = std::env::var_os("HOME")?;
    let path = PathBuf::from(home).join(".axe").join("axe-api.key");
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[tauri::command]
fn get_overlay_config(app: AppHandle) -> Result<OverlayConfigDto, String> {
    let path = config_path(&app)?;
    let mut dto = OverlayConfigDto::default();
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        dto.api_key = v
            .get("apiKey")
            .or_else(|| v.get("api_key"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
        dto.api_origin = v
            .get("apiOrigin")
            .or_else(|| v.get("api_origin"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
    }
    if dto.api_key.is_none() {
        dto.api_key = home_api_key();
    }
    Ok(dto)
}

#[tauri::command]
fn set_launch_at_login(app: AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    if enable {
        mgr.enable().map_err(|e| e.to_string())
    } else {
        mgr.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn get_launch_at_login(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// Collapsed topbar hoogte (logical). Moet matchen met frontend TOPBAR_HEIGHT.
const COLLAPSED_H: f64 = 44.0;

/// Laatste expanded-state voor display-watcher her-pin (bg thread-safe).
pub(crate) static OVERLAY_EXPANDED: AtomicBool = AtomicBool::new(false);

fn overlay_metrics<R: Runtime>(app: &AppHandle<R>) -> (f64, f64, f64, f64, f64) {
    // Fallback voor non-macOS; macOS pin gebruikt NSScreen.main rechtstreeks.
    if let Ok(Some(m)) = app.primary_monitor() {
        let scale = m.scale_factor();
        let size = m.size();
        let pos = m.position();
        let screen_w = size.width as f64 / scale;
        let screen_h = size.height as f64 / scale;
        let screen_x = pos.x as f64 / scale;
        (screen_x, screen_w, screen_h, 0.0, 0.0)
    } else {
        (0.0, 1920.0, 1080.0, 0.0, 0.0)
    }
}

fn pin_log(msg: &str) {
    use std::io::Write;
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return;
    };
    let path = home.join("Library/Logs/axe-overlay-pin.log");
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "{}", msg);
    }
}

/// AppKit setLevel/setFrame alleen op main thread (display/cmd watchers hoppen).
pub(crate) fn pin_overlay_frame<R: Runtime>(app: &AppHandle<R>, expanded: bool) -> Result<(), String> {
    OVERLAY_EXPANDED.store(expanded, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        let on_main: bool = unsafe { msg_send![class!(NSThread), isMainThread] };
        if !on_main {
            let app2 = app.clone();
            let (tx, rx) = std::sync::mpsc::channel();
            app.run_on_main_thread(move || {
                let _ = tx.send(pin_overlay_frame_inner(&app2, expanded));
            })
            .map_err(|e| e.to_string())?;
            return rx
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap_or_else(|_| Err("pin_overlay_frame: main-thread timeout".into()));
        }
    }
    pin_overlay_frame_inner(app, expanded)
}

#[cfg(target_os = "macos")]
fn cocoa_center_frame(expanded: bool) -> Result<(f64, f64, f64, f64, f64), String> {
    // Returns (x, cocoa_y, w, h, top_y) on the *primary* display — flush + centered.
    // Do NOT use NSScreen.mainScreen: it follows the key window and can pin the
    // notch onto a secondary monitor when HQ/Trading OS is focused there.
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSRect;
    use objc::{class, msg_send, sel, sel_impl};
    unsafe {
        let screens: id = msg_send![class!(NSScreen), screens];
        if screens == nil {
            return Err("geen scherm voor overlay".into());
        }
        let count: usize = msg_send![screens, count];
        if count == 0 {
            return Err("geen scherm voor overlay".into());
        }
        let mut screen: id = msg_send![screens, objectAtIndex: 0usize];
        let mut best_score = f64::MAX;
        for i in 0..count {
            let s: id = msg_send![screens, objectAtIndex: i];
            if s.is_null() || s == nil {
                continue;
            }
            let sf: NSRect = msg_send![s, frame];
            // Primary ≈ origin nearest (0,0), prefer larger area as tie-break.
            let score = sf.origin.x.abs() + sf.origin.y.abs() - (sf.size.width * sf.size.height) * 1e-9;
            if score < best_score {
                best_score = score;
                screen = s;
            }
        }
        if screen.is_null() || screen == nil {
            return Err("geen scherm voor overlay".into());
        }
        let frame: NSRect = msg_send![screen, frame];
        let visible: NSRect = msg_send![screen, visibleFrame];
        let screen_w = frame.size.width;
        let screen_h = frame.size.height;
        let w = (screen_w * 0.34).max(720.0).round();
        let h = if expanded {
            (w * 0.7).max(screen_h * 0.42).max(720.0).round()
        } else {
            COLLAPSED_H
        };
        let top_y = visible.origin.y + visible.size.height;
        let cocoa_y = top_y - h;
        let x = frame.origin.x + ((screen_w - w) / 2.0).max(0.0);
        Ok((x, cocoa_y, w, h, top_y))
    }
}

fn pin_overlay_frame_inner<R: Runtime>(app: &AppHandle<R>, expanded: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window missing".to_string())?;

    #[cfg(target_os = "macos")]
    {
        use cocoa::base::{id, YES};
        use cocoa::foundation::{NSPoint, NSRect, NSSize};
        use objc::{msg_send, sel, sel_impl};

        let ns_win = win.ns_window().map_err(|e| e.to_string())? as id;
        let (x, cocoa_y, w, h, top_y) = cocoa_center_frame(expanded)?;
        unsafe {
            let _: () = msg_send![ns_win, setMovable: cocoa::base::NO];
            let _: () = msg_send![ns_win, setLevel: 25_i64]; // NSStatusWindowLevel
            let ns_frame = NSRect::new(NSPoint::new(x, cocoa_y), NSSize::new(w, h));
            let _: () = msg_send![ns_win, setFrame: ns_frame display: YES];
        }
        pin_log(&format!(
            "pin expanded={expanded} top_y={top_y:.1} frame=({x:.1},{cocoa_y:.1},{w:.0}x{h:.0})"
        ));
        // set_always_on_top kan Tauri-positie terugzetten — Cocoa-frame opnieuw.
        let _ = win.set_always_on_top(true);
        let (x2, y2, w2, h2, _) = cocoa_center_frame(expanded)?;
        unsafe {
            let ns_frame = NSRect::new(NSPoint::new(x2, y2), NSSize::new(w2, h2));
            let _: () = msg_send![ns_win, setFrame: ns_frame display: YES];
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let (sx, screen_w, screen_h, _, _) = overlay_metrics(app);
        let w = (screen_w * 0.34).max(720.0).round();
        let h = if expanded {
            (w * 0.7).max(screen_h * 0.42).max(720.0).round()
        } else {
            COLLAPSED_H
        };
        let x = (sx + ((screen_w - w) / 2.0)).max(0.0);
        win.set_size(Size::Logical(LogicalSize::new(w, h)))
            .map_err(|e| e.to_string())?;
        let _ = win.set_position(LogicalPosition::new(x, 0.0));
        let _ = win.set_always_on_top(true);
        Ok(())
    }
}


#[tauri::command]
fn resize_overlay(app: AppHandle, expanded: bool) -> Result<(), String> {
    pin_overlay_frame(&app, expanded)
}

#[tauri::command]
fn get_shell_state() -> shell_watch::ShellState {
    shell_watch::probe_shell_state()
}

#[tauri::command]
fn activate_axe_shell(route: Option<String>) -> Result<(), String> {
    shell_watch::activate_axe_shell(route)
}

#[tauri::command]
fn get_axe_look() -> look_watch::LookState {
    look_watch::read_look()
}

fn start_display_watcher<R: Runtime>(app: AppHandle<R>) {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    std::mem::forget(stop);

    thread::spawn(move || {
        let mut last_key: Option<String> = None;
        let mut ticks: u32 = 0;
        while !stop_flag.load(Ordering::Relaxed) {
            let key = if let Ok(Some(m)) = app.primary_monitor() {
                format!(
                    "{}x{}@{}+{},{}",
                    m.size().width,
                    m.size().height,
                    m.scale_factor(),
                    m.position().x,
                    m.position().y
                )
            } else {
                "none".into()
            };
            let expanded = OVERLAY_EXPANDED.load(Ordering::Relaxed);
            let changed = match &last_key {
                None => {
                    last_key = Some(key);
                    true
                }
                Some(prev) if prev != &key => {
                    last_key = Some(key);
                    true
                }
                Some(_) => false,
            };
            ticks = ticks.wrapping_add(1);
            // Display-change altijd; anders ~elke 3s her-pin tegen show/aot drift.
            if changed || ticks % 2 == 0 {
                let _ = pin_overlay_frame(&app, expanded);
            }
            thread::sleep(Duration::from_millis(1500));
        }
    });
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_overlay_config,
            set_launch_at_login,
            get_launch_at_login,
            resize_overlay,
            get_shell_state,
            activate_axe_shell,
            get_axe_look
        ])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("overlay") {
                let _ = win.set_always_on_top(true);
                #[cfg(target_os = "macos")]
                {
                    use cocoa::base::id;
                    use objc::{msg_send, sel, sel_impl};
                    if let Ok(nsw) = win.ns_window() {
                        let ns_win = nsw as id;
                        unsafe {
                            let _: () = msg_send![ns_win, setMovable: cocoa::base::NO];
                            let _: () = msg_send![ns_win, setLevel: 25_i64];
                        }
                    }
                }
            }
            let _ = pin_overlay_frame(app.handle(), false);
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = fs::create_dir_all(&dir);
            }
            shell_watch::start_watcher(app.handle().clone());
            cmd_watch::start_watcher(app.handle().clone());
            look_watch::start_watcher(app.handle().clone());
            start_display_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AXE Overlay");
}
