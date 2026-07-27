// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Component, Path, PathBuf};

/// Resolve `relative` under `vault_root` and reject path traversal.
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
    // Ensure resolved path still starts with root
    let root_c = root.canonicalize().unwrap_or(root.clone());
    if let Ok(full_c) = full.canonicalize() {
        if !full_c.starts_with(&root_c) {
            return Err("Path escapes vault root".into());
        }
        return Ok(full_c);
    }
    // File may not exist yet — check parent
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            write_vault_file,
            read_vault_file,
            vault_path_exists,
            ensure_vault_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
