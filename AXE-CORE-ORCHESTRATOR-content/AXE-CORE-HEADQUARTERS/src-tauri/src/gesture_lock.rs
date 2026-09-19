//! Beperkte brug voor de particle-gesture PIN.
//!
//! Alleen load/save/clear van het PBKDF2-record. Geen generieke KV-opslag,
//! geen gebarenreeks, geen PIN-geheim naar de VPS. Op Android versleutelt
//! Kotlin het record met Android KeyStore AES-GCM (zelfde keten als de
//! Samsung-APK: KeyStore → AES/GCM/NoPadding → SharedPreferences-blob).
//! Ontbreekt die keten, dan faalt het commando — geen localStorage-fallback.

use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_RECORD_BYTES: usize = 4096;
const MIN_LENGTH: u64 = 3;
const MAX_LENGTH: u64 = 16;
const MIN_ITERATIONS: u64 = 120_000;
const MAX_ITERATIONS: u64 = 1_000_000;
const SALT_BYTES: usize = 32;
const HASH_BYTES: usize = 32;

#[cfg(target_os = "android")]
struct GestureLockAndroid<R: tauri::Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Deserialize)]
struct LoadResponse {
    record: Option<String>,
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Serialize)]
struct SavePayload<'a> {
    record: &'a str,
}

pub fn plugin<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("gesture-lock")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = api.register_android_plugin("com.axe.core", "GestureLockPlugin")?;
                app.manage(GestureLockAndroid(handle));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}

pub fn record_geldig(raw: &str) -> Result<(), String> {
    if raw.len() > MAX_RECORD_BYTES {
        return Err("gesture-lock record too large".into());
    }
    let v: Value = serde_json::from_str(raw).map_err(|_| "gesture-lock record is not JSON")?;
    let obj = v.as_object().ok_or("gesture-lock record must be an object")?;
    const VELDEN: [&str; 6] = [
        "salt",
        "hash",
        "length",
        "iterations",
        "failedAttempts",
        "lockedUntil",
    ];
    if obj.len() != VELDEN.len() || VELDEN.iter().any(|k| !obj.contains_key(*k)) {
        return Err("gesture-lock record has unexpected fields".into());
    }
    b64_len(obj.get("salt"), SALT_BYTES, "salt")?;
    b64_len(obj.get("hash"), HASH_BYTES, "hash")?;
    let length = als_u64(obj.get("length"), "length")?;
    if !(MIN_LENGTH..=MAX_LENGTH).contains(&length) {
        return Err("gesture-lock length out of range".into());
    }
    let iterations = als_u64(obj.get("iterations"), "iterations")?;
    if !(MIN_ITERATIONS..=MAX_ITERATIONS).contains(&iterations) {
        return Err("gesture-lock iterations out of range".into());
    }
    let _ = als_u64(obj.get("failedAttempts"), "failedAttempts")?;
    let _ = als_u64(obj.get("lockedUntil"), "lockedUntil")?;
    Ok(())
}

fn als_u64(v: Option<&Value>, veld: &str) -> Result<u64, String> {
    v.and_then(Value::as_u64)
        .ok_or_else(|| format!("gesture-lock {veld} must be a number"))
}

fn b64_len(v: Option<&Value>, verwacht: usize, veld: &str) -> Result<(), String> {
    let s = v
        .and_then(Value::as_str)
        .ok_or_else(|| format!("gesture-lock {veld} must be a string"))?;
    if s.is_empty() || s.len() > 128 || s.chars().any(|c| !c.is_ascii()) {
        return Err(format!("gesture-lock {veld} is not base64"));
    }
    let bytes = b64_decode(s).ok_or_else(|| format!("gesture-lock {veld} is not base64"))?;
    if bytes.len() != verwacht {
        return Err(format!("gesture-lock {veld} has the wrong size"));
    }
    Ok(())
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let clean: Vec<u8> = s.bytes().filter(|c| *c != b'=').collect();
    if clean.iter().any(|c| val(*c).is_none()) {
        return None;
    }
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for chunk in clean.chunks(4) {
        if chunk.len() < 2 {
            return None;
        }
        let a = val(chunk[0])?;
        let b = val(chunk[1])?;
        out.push((a << 2) | (b >> 4));
        if chunk.len() >= 3 {
            let c = val(chunk[2])?;
            out.push(((b & 0x0f) << 4) | (c >> 2));
            if chunk.len() == 4 {
                let d = val(chunk[3])?;
                out.push(((c & 0x03) << 6) | d);
            }
        }
    }
    Some(out)
}

#[cfg(target_os = "android")]
fn android_handle<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<tauri::State<'_, GestureLockAndroid<R>>, String> {
    use tauri::Manager;
    app.try_state::<GestureLockAndroid<R>>()
        .ok_or_else(|| "Secure storage unavailable".into())
}

#[tauri::command]
pub fn gesture_lock_load<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "android")]
    {
        let res: LoadResponse = android_handle(&app)?
            .0
            .run_mobile_plugin("load", ())
            .map_err(|e| e.to_string())?;
        if let Some(raw) = &res.record {
            record_geldig(raw)?;
        }
        Ok(res.record)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Secure PIN storage is only available on Android.".into())
    }
}

#[tauri::command]
pub fn gesture_lock_save<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    record: String,
) -> Result<(), String> {
    record_geldig(&record)?;
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = android_handle(&app)?
            .0
            .run_mobile_plugin("save", SavePayload { record: &record })
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Secure PIN storage is only available on Android.".into())
    }
}

#[tauri::command]
pub fn gesture_lock_clear<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        let _: serde_json::Value = android_handle(&app)?
            .0
            .run_mobile_plugin("clear", ())
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("Secure PIN storage is only available on Android.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::record_geldig;
    use base64_stub::b64;

    mod base64_stub {
        pub fn b64(bytes: &[u8]) -> String {
            const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let mut out = String::new();
            for chunk in bytes.chunks(3) {
                let a = chunk[0] as u32;
                let b = chunk.get(1).copied().unwrap_or(0) as u32;
                let c = chunk.get(2).copied().unwrap_or(0) as u32;
                let n = (a << 16) | (b << 8) | c;
                out.push(T[((n >> 18) & 63) as usize] as char);
                out.push(T[((n >> 12) & 63) as usize] as char);
                if chunk.len() > 1 {
                    out.push(T[((n >> 6) & 63) as usize] as char);
                } else {
                    out.push('=');
                }
                if chunk.len() > 2 {
                    out.push(T[(n & 63) as usize] as char);
                } else {
                    out.push('=');
                }
            }
            out
        }
    }

    fn record() -> String {
        let salt = b64(&[7u8; 32]);
        let hash = b64(&[9u8; 32]);
        format!(
            r#"{{"salt":"{salt}","hash":"{hash}","length":4,"iterations":120000,"failedAttempts":0,"lockedUntil":0}}"#
        )
    }

    #[test]
    fn accepteert_pbkdf2_record() {
        assert!(record_geldig(&record()).is_ok());
    }

    #[test]
    fn weigert_gebarenreeks() {
        assert!(record_geldig(r#"{"gestures":["swipeRight","triangle","1","check"]}"#).is_err());
        assert!(record_geldig("swipeRight\u{1f}triangle").is_err());
    }

    #[test]
    fn weigert_zwakke_iterations() {
        let raw = record().replace("120000", "1");
        assert!(record_geldig(&raw).is_err());
    }

    #[test]
    fn weigert_extra_velden() {
        let raw = record().replacen('{', r#"{"pin":"1234","#, 1);
        assert!(record_geldig(&raw).is_err());
    }
}
