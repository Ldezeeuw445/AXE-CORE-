mod shell_watch;

use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, Size};
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

#[tauri::command]
fn get_overlay_config(app: AppHandle) -> Result<OverlayConfigDto, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(OverlayConfigDto::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(OverlayConfigDto {
        api_key: v
            .get("apiKey")
            .or_else(|| v.get("api_key"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        api_origin: v
            .get("apiOrigin")
            .or_else(|| v.get("api_origin"))
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
    })
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

#[tauri::command]
fn resize_overlay(app: AppHandle, expanded: bool) -> Result<(), String> {
    let win = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window missing".to_string())?;
    let (w, h) = if expanded {
        (460.0_f64, 520.0_f64)
    } else {
        (460.0_f64, 56.0_f64)
    };
    win.set_size(Size::Logical(LogicalSize::new(w, h)))
        .map_err(|e| e.to_string())?;
    if let Ok(Some(m)) = app.primary_monitor() {
        let size = m.size();
        let scale = m.scale_factor();
        let screen_w = size.width as f64 / scale;
        let x = ((screen_w - w) / 2.0).max(0.0);
        let _ = win.set_position(LogicalPosition::new(x, 0.0));
    }
    let _ = win.set_always_on_top(true);
    Ok(())
}

#[tauri::command]
fn get_shell_state() -> shell_watch::ShellState {
    shell_watch::probe_shell_state()
}

#[tauri::command]
fn activate_axe_shell() -> Result<(), String> {
    shell_watch::activate_axe_shell()
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
            activate_axe_shell
        ])
        .setup(|app| {
            if let Some(win) = app.get_webview_window("overlay") {
                let _ = win.set_always_on_top(true);
                if let Ok(Some(m)) = app.primary_monitor() {
                    let size = m.size();
                    let scale = m.scale_factor();
                    let screen_w = size.width as f64 / scale;
                    let w = 460.0_f64;
                    let x = ((screen_w - w) / 2.0).max(0.0);
                    let _ = win.set_position(LogicalPosition::new(x, 0.0));
                }
            }
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = fs::create_dir_all(&dir);
            }
            // Start shell presence watcher (macOS). On other OS it no-ops to "show".
            shell_watch::start_watcher(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running AXE Overlay");
}
