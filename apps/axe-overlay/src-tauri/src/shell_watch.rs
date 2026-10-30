//! Watch AXE CORE (Tauri shell) via macOS CGWindowList + NSWorkspace.
//! No Accessibility permission. Notch shows when shell is absent / hidden /
//! minimized; hides when the shell has a real on-screen window.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

const SHELL_BUNDLE_ID: &str = "com.axe.core";
const SHELL_OWNER_NAME: &str = "AXE CORE";
const MIN_SHELL_HEIGHT: f64 = 80.0;
const POLL_MS: u64 = 450;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShellState {
    pub running: bool,
    pub visible: bool,
    pub show_notch: bool,
}

impl ShellState {
    fn compute(running: bool, visible: bool) -> Self {
        Self {
            running,
            visible,
            show_notch: !running || !visible,
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use core_foundation::array::{CFArrayGetCount, CFArrayGetValueAtIndex};
    use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
    use core_foundation::dictionary::{CFDictionaryGetValueIfPresent, CFDictionaryRef};
    use core_foundation::number::{CFNumberGetValue, CFNumberRef, kCFNumberFloat64Type};
    use core_foundation::string::{CFString, CFStringRef};
    use core_graphics::display::{
        kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly, CGWindowListCopyWindowInfo,
    };
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::c_void;

    pub fn probe() -> ShellState {
        let running = is_shell_running();
        let visible = running && has_onscreen_shell_window();
        ShellState::compute(running, visible)
    }

    fn is_shell_running() -> bool {
        unsafe {
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
            let apps: id = msg_send![workspace, runningApplications];
            if apps == nil {
                return false;
            }
            let count: usize = msg_send![apps, count];
            for i in 0..count {
                let app: id = msg_send![apps, objectAtIndex: i];
                let bid: id = msg_send![app, bundleIdentifier];
                if bid == nil {
                    continue;
                }
                let c = NSString::UTF8String(bid);
                if c.is_null() {
                    continue;
                }
                let rust = std::ffi::CStr::from_ptr(c).to_string_lossy();
                if rust == SHELL_BUNDLE_ID {
                    return true;
                }
            }
            false
        }
    }

    fn cf_dict_string(dict: CFDictionaryRef, key: &str) -> Option<String> {
        unsafe {
            let cf_key = CFString::new(key);
            let mut value: *const c_void = std::ptr::null();
            if CFDictionaryGetValueIfPresent(
                dict,
                cf_key.as_CFTypeRef() as *const c_void,
                &mut value,
            ) == 0
                || value.is_null()
            {
                return None;
            }
            let s = CFString::wrap_under_get_rule(value as CFStringRef);
            Some(s.to_string())
        }
    }

    fn cf_dict_bounds_height(dict: CFDictionaryRef) -> f64 {
        unsafe {
            let cf_key = CFString::new("kCGWindowBounds");
            let mut bounds_ptr: *const c_void = std::ptr::null();
            if CFDictionaryGetValueIfPresent(
                dict,
                cf_key.as_CFTypeRef() as *const c_void,
                &mut bounds_ptr,
            ) == 0
                || bounds_ptr.is_null()
            {
                return 0.0;
            }
            let bounds = bounds_ptr as CFDictionaryRef;
            let h_key = CFString::new("Height");
            let mut h_ptr: *const c_void = std::ptr::null();
            if CFDictionaryGetValueIfPresent(
                bounds,
                h_key.as_CFTypeRef() as *const c_void,
                &mut h_ptr,
            ) == 0
                || h_ptr.is_null()
            {
                return 0.0;
            }
            let mut out = 0.0_f64;
            if CFNumberGetValue(h_ptr as CFNumberRef, kCFNumberFloat64Type, &mut out as *mut f64 as *mut c_void)
            {
                out
            } else {
                0.0
            }
        }
    }

    fn has_onscreen_shell_window() -> bool {
        let options = kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements;
        let cf_arr = unsafe { CGWindowListCopyWindowInfo(options, 0) };
        if cf_arr.is_null() {
            return false;
        }
        let mut found = false;
        unsafe {
            let count = CFArrayGetCount(cf_arr);
            for i in 0..count {
                let dict = CFArrayGetValueAtIndex(cf_arr, i) as CFDictionaryRef;
                if dict.is_null() {
                    continue;
                }
                let owner = match cf_dict_string(dict, "kCGWindowOwnerName") {
                    Some(s) => s,
                    None => continue,
                };
                if owner != SHELL_OWNER_NAME {
                    continue;
                }
                if cf_dict_bounds_height(dict) >= MIN_SHELL_HEIGHT {
                    found = true;
                    break;
                }
            }
            CFRelease(cf_arr as CFTypeRef);
        }
        found
    }

    pub fn activate_shell() -> Result<(), String> {
        // Prefer LaunchServices via `open -b` (bundle id) — no Accessibility needed.
        let status = std::process::Command::new("open")
            .args(["-b", SHELL_BUNDLE_ID])
            .status()
            .map_err(|e| format!("open -b {SHELL_BUNDLE_ID}: {e}"))?;
        if status.success() {
            return Ok(());
        }
        std::process::Command::new("open")
            .args(["-a", "AXE CORE"])
            .status()
            .map_err(|e| format!("open -a AXE CORE: {e}"))?;
        Ok(())
    }
}

#[cfg(not(target_os = "macos"))]
mod macos {
    use super::*;
    pub fn probe() -> ShellState {
        ShellState::compute(false, false)
    }
    pub fn activate_shell() -> Result<(), String> {
        Err("activate_shell is macOS-only".into())
    }
}

pub fn probe_shell_state() -> ShellState {
    macos::probe()
}

pub fn activate_axe_shell() -> Result<(), String> {
    macos::activate_shell()
}

pub fn start_watcher<R: Runtime>(app: AppHandle<R>) {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_flag = stop.clone();
    std::mem::forget(stop);

    thread::spawn(move || {
        let mut last: Option<ShellState> = None;
        thread::sleep(Duration::from_millis(250));
        while !stop_flag.load(Ordering::Relaxed) {
            let state = probe_shell_state();
            let changed = last.map(|l| l != state).unwrap_or(true);
            if changed {
                // Frontend plays emerge/retract then show/hide the window.
                let _ = app.emit("shell-state", state);
                last = Some(state);
            }
            thread::sleep(Duration::from_millis(POLL_MS));
        }
    });
}
