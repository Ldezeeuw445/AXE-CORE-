#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

fn safe_vault_path(vault_root: &str, relative: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(vault_root);
    if !root.is_absolute() {
        return Err("Vault path must be absolute".into());
    }
    let rel = relative.trim().trim_start_matches('/');
    if rel.is_empty() {
        return Err("Empty relative path".into());
    }
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(_) => {}
            _ => return Err(format!("Illegal path component in '{relative}'")),
        }
    }
    let full = root.join(rel);
    let root_c = root.canonicalize().unwrap_or(root.clone());
    if let Ok(full_c) = full.canonicalize() {
        if !full_c.starts_with(&root_c) {
            return Err("Path escapes vault root".into());
        }
        return Ok(full_c);
    }
    if let Some(parent) = full.parent() {
        if parent.exists() {
            let parent_c = parent.canonicalize().map_err(|e| e.to_string())?;
            if !parent_c.starts_with(&root_c) && parent_c != root_c {
                return Err("Path escapes vault root".into());
            }
        }
    }
    Ok(full)
}

#[tauri::command]
fn write_vault_file(vault_root: String, relative_path: String, content: String) -> Result<(), String> {
    let full = safe_vault_path(&vault_root, &relative_path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    fs::write(&full, content).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

#[tauri::command]
fn read_vault_file(vault_root: String, relative_path: String) -> Result<String, String> {
    let full = safe_vault_path(&vault_root, &relative_path)?;
    fs::read_to_string(&full).map_err(|e| format!("read: {e}"))
}

#[tauri::command]
fn vault_path_exists(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
fn ensure_vault_dir(vault_root: String, relative_dir: String) -> Result<(), String> {
    let full = safe_vault_path(&vault_root, &relative_dir)?;
    fs::create_dir_all(&full).map_err(|e| format!("mkdir: {e}"))?;
    Ok(())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        win.unminimize().ok();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            write_vault_file,
            read_vault_file,
            vault_path_exists,
            ensure_vault_dir,
            show_main_window,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Close (X) → hide window, keep process for clap + tray
            if let Some(win) = app.get_webview_window("main") {
                let win_h = win.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_h.hide();
                    }
                });
            }

            // System tray: Show / Quit
            let show_i = MenuItem::with_id(app, "show", "Show AXE CORE", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("AXE CORE")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.unminimize();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            let _ = handle;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
