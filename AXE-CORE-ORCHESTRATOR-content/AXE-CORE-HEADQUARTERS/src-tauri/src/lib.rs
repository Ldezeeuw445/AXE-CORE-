// De twee achtergronddienst-modules zijn desktop-only: `diensten` start npm en
// uvicorn op deze Mac, `launchd` praat met macOS launchd. In een APK bestaat
// geen van beide, dus daar hoort de code niet eens gecompileerd te worden.
#[cfg(desktop)]
mod diensten;
#[cfg(desktop)]
mod launchd;
mod gesture_lock;

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{Emitter, Manager};
// Menu, tray en venster-events bestaan alleen op desktop (achter de tray-icon-
// feature). Op mobiel zijn die modules er niet, dus de import is desktop-only.
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};

#[derive(serde::Serialize)]
struct VaultFile {
    relative_path: String,
    content: String,
    mtime_ms: u64,
}

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

/// Recursively lists every .md file under `{vault_root}/{subfolder}`, for the
/// Core <- disk half of vault sync (the AXE/ subtree only — never the user's
/// whole personal vault, so this can't accidentally ingest unrelated private
/// notes into Supabase memory).
#[tauri::command]
fn list_vault_files(vault_root: String, subfolder: String) -> Result<Vec<VaultFile>, String> {
    let root = safe_vault_path(&vault_root, &subfolder)?;
    let mut out = Vec::new();
    if !root.is_dir() {
        return Ok(out);
    }
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        let entries = fs::read_dir(&dir).map_err(|e| format!("readdir {}: {e}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(_) => continue, // skip unreadable/binary files rather than fail the whole sync
            };
            let mtime_ms = fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let rel_in_subfolder = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let relative_path = format!("{}/{}", subfolder.trim_matches('/'), rel_in_subfolder);
            out.push(VaultFile { relative_path, content, mtime_ms });
        }
    }
    Ok(out)
}

#[tauri::command]
fn ensure_vault_dir(vault_root: String, relative_dir: String) -> Result<(), String> {
    let full = safe_vault_path(&vault_root, &relative_dir)?;
    fs::create_dir_all(&full).map_err(|e| format!("mkdir: {e}"))?;
    Ok(())
}

/// Welke machine dit is. De webview riep `platform_info` al aan
/// (axeDeviceService.ts), maar het commando bestond niet: beide Macs heetten in
/// core_axe_devices "Mac", en "open NorthSea Desk op me iMac" kon de iMac niet
/// van de Mac mini onderscheiden (29 okt).
#[tauri::command]
fn platform_info() -> serde_json::Value {
    serde_json::json!({
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "hostname": hostnaam(),
    })
}

fn hostnaam() -> Option<String> {
    let lees = |programma: &str, args: &[&str]| -> Option<String> {
        let uit = std::process::Command::new(programma).args(args).output().ok()?;
        let naam = String::from_utf8_lossy(&uit.stdout).trim().to_string();
        (uit.status.success() && !naam.is_empty()).then_some(naam)
    };
    // LocalHostName is de vaste Bonjour-naam (main-imac-luka); `hostname` kan
    // per netwerk wisselen.
    #[cfg(target_os = "macos")]
    if let Some(naam) = lees("/usr/sbin/scutil", &["--get", "LocalHostName"]) {
        return Some(naam);
    }
    lees("hostname", &["-s"])
}


/// Pin the AXE float notch to an absolute top-left frame (logical points, top-left origin).
/// Tauri/wry `set_position` is clamped under the menu bar (~y=30); NSWindow setFrame is not.
/// AppKit setFrame must run on the main thread (same pattern as axe-overlay pin_overlay_frame).
#[tauri::command]
fn dock_notch_frame(app: tauri::AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc::{class, msg_send, sel, sel_impl};
        let on_main: bool = unsafe { msg_send![class!(NSThread), isMainThread] };
        if !on_main {
            let app2 = app.clone();
            let (tx, rx) = std::sync::mpsc::channel();
            app.run_on_main_thread(move || {
                let _ = tx.send(dock_notch_frame_inner(&app2, x, y, w, h));
            })
            .map_err(|e| e.to_string())?;
            return rx
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap_or_else(|_| Err("dock_notch_frame: main-thread timeout".into()));
        }
        return dock_notch_frame_inner(&app, x, y, w, h);
    }
    #[cfg(not(target_os = "macos"))]
    {
        dock_notch_frame_inner(&app, x, y, w, h)
    }
}

/// Doorzichtig notch-venster: geen OS-schaduw, geen ondoorzichtige backing.
/// Anders tekent macOS een rechthoek achter CSS-radius → donkere hoek-streepjes.
#[cfg(target_os = "macos")]
fn macos_notch_window_shape(ns_win: cocoa::base::id) {
    use cocoa::base::{id, NO};
    use objc::{class, msg_send, sel, sel_impl};
    unsafe {
        let _: () = msg_send![ns_win, setOpaque: NO];
        let _: () = msg_send![ns_win, setHasShadow: NO];
        let clear: id = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![ns_win, setBackgroundColor: clear];
    }
}

fn dock_notch_frame_inner(app: &tauri::AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let win = app
        .get_webview_window("axe-float-axe")
        .or_else(|| app.get_webview_window("AXE"))
        .ok_or_else(|| "axe float window missing".to_string())?;
    #[cfg(target_os = "macos")]
    {
        use cocoa::base::{id, nil, YES};
        use cocoa::foundation::{NSPoint, NSRect, NSSize};
        use objc::{class, msg_send, sel, sel_impl};

        let ns_win = win.ns_window().map_err(|e| e.to_string())? as id;
        macos_notch_window_shape(ns_win);
        unsafe {
            // NSStatusWindowLevel (25): allowed over the menu bar / notch strip.
            let _: () = msg_send![ns_win, setLevel: 25_i64];
            // Het scherm waar de aanroeper om vraagt, en anders het primaire.
            //
            // Hier stond alleen die tweede helft: altijd het primaire scherm,
            // en dan de x van de aanroeper DAARIN vastgeklemd. De JS-kant
            // rekent inmiddels met currentMonitor, dus die x hoort bij het
            // scherm waar Luka zit -- en werd hier stil teruggezet naar de
            // rechterrand van het eerste scherm. Een altijd-aanwezige balk
            // die altijd op je andere monitor staat, is altijd afwezig.
            //
            // De x is de probe en niet de y: Cocoa rekent y van onderaf en de
            // aanroeper van bovenaf, dus alleen x betekent in beide hetzelfde.
            let probe_x = x + w / 2.0;
            let mut screen: id = msg_send![class!(NSScreen), mainScreen];
            let screens: id = msg_send![class!(NSScreen), screens];
            if screens != nil {
                let count: usize = msg_send![screens, count];
                let mut gekozen: id = nil;
                for i in 0..count {
                    let s: id = msg_send![screens, objectAtIndex: i];
                    if s.is_null() || s == nil {
                        continue;
                    }
                    let sf: NSRect = msg_send![s, frame];
                    if probe_x >= sf.origin.x && probe_x < sf.origin.x + sf.size.width {
                        gekozen = s;
                        break;
                    }
                }
                if gekozen == nil {
                    // Geen scherm bevat die x (scherm losgekoppeld of de JS
                    // kant kon de monitor niet bepalen): dan het primaire --
                    // origin dichtst bij (0,0) en het grootste vlak.
                    let mut best: id = screen;
                    let mut best_score = f64::MAX;
                    for i in 0..count {
                        let s: id = msg_send![screens, objectAtIndex: i];
                        if s.is_null() || s == nil {
                            continue;
                        }
                        let sf: NSRect = msg_send![s, frame];
                        let score = sf.origin.x.abs() + sf.origin.y.abs()
                            - (sf.size.width * sf.size.height) * 1e-9;
                        if score < best_score {
                            best_score = score;
                            best = s;
                        }
                    }
                    gekozen = best;
                }
                if !gekozen.is_null() && gekozen != nil {
                    screen = gekozen;
                }
            }
            if screen.is_null() || screen == nil {
                return Err("no screen for notch window".into());
            }
            let sf: NSRect = msg_send![screen, frame];
            // Vlak tegen de fysieke bovenrand, dus óver de menubalk heen.
            //
            // Hier stond `visibleFrame`, en die begint ONDER de menubalk. De
            // notch hing daardoor een strook lager en voelde als een zwevend
            // paneel, terwijl zijn bovenkant recht is en zijn onderkant rond
            // -- de vorm van iets dat tegen de schermrand aan zit. `frame` is
            // het hele scherm, en op NSStatusWindowLevel (25, hierboven
            // gezet) mag een venster daar ook echt bovenop staan.
            let top_y = sf.origin.y + sf.size.height;
            let cocoa_y = top_y - h;
            // Keep caller's x (already centered on primary in JS); clamp into this screen.
            let x_clamped = x.max(sf.origin.x).min(sf.origin.x + sf.size.width - w);
            let frame = NSRect::new(NSPoint::new(x_clamped, cocoa_y), NSSize::new(w, h));
            let _: () = msg_send![ns_win, setFrame: frame display: YES];
            // De y van de aanroeper blijft ongebruikt: de bovenrand van het
            // gekozen scherm is bepalend, en die rekenen we hier zelf uit.
            let _ = y;
        }
        // Hier stond `win.set_always_on_top(true)` met daarna een tweede
        // plaatsing. Dat was de reden dat de notch ná 0b5d25f8 nog steeds
        // 30pt lager hing (gemeten op de iMac, 6 nov: y=30, laag 5).
        //
        // tao zet bij set_always_on_top het niveau op NSFloatingWindowLevel
        // (3), en dat ASYNCHROON via de main queue -- het landt dus ná het
        // niveau 25 hierboven. Op niveau 3 klemt macOS elk setFrame onder de
        // menubalk; op 25 mag een randloos venster tegen de bovenrand. Zelf
        // gemeten met een kaal NSWindow: borderless L25 → top 1440, dezelfde
        // setFrame op L3 → 1410. De tweede plaatsing die het moest herstellen
        // gebeurde dus precies op het niveau waarop het niet kan.
        //
        // Niveau 25 is al "altijd bovenop" (hoger dan floating), dus de
        // aanroep was ook overbodig. Nooit meer set_always_on_top op dit
        // venster, ook niet vanuit JS (FloatAxe.tsx).
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::LogicalPosition;
        use tauri::LogicalSize;
        win.set_size(tauri::Size::Logical(LogicalSize::new(w, h)))
            .map_err(|e| e.to_string())?;
        win.set_position(tauri::Position::Logical(LogicalPosition::new(x, y)))
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
struct LookState {
    look: String,
}

fn read_shared_look() -> LookState {
    let raw = std::env::var_os("HOME")
        .and_then(|h| fs::read_to_string(PathBuf::from(h).join(".axe").join("look")).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| s == "black" || s == "glass")
        .unwrap_or_else(|| "glass".to_string());
    LookState { look: raw }
}

#[tauri::command]
fn get_axe_look() -> LookState {
    read_shared_look()
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        #[cfg(desktop)]
        win.unminimize().ok();
    }
    Ok(())
}

/// Pending route from the standalone axe-overlay notch (`~/.axe/overlay-open-route`).
/// Reads + deletes the file. Only `/northsea` and `/trading` are accepted.
#[tauri::command]
fn consume_overlay_open_route() -> Result<Option<String>, String> {
    let home = std::env::var_os("HOME").ok_or_else(|| "HOME niet gezet".to_string())?;
    let path = PathBuf::from(home).join(".axe").join("overlay-open-route");
    if !path.is_file() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("lees overlay-open-route: {e}"))?;
    let _ = fs::remove_file(&path);
    let route = raw.trim();
    match route {
        "/northsea" | "/trading" => Ok(Some(route.to_string())),
        _ => Ok(None),
    }
}

// ── De globale mic-sneltoets ────────────────────────────────────────────────
//
// Deze twee namen staan ook in src/domain/voice/sneltoets.ts. Verandert er hier
// één, dan moet die daar mee: Rust stuurt het event en de frontend luistert
// ernaar, en er is niets dat een verschil zou opmerken -- de sneltoets zou
// gewoon stil niets meer doen.
#[cfg(desktop)]
const SNELTOETS_ACCELERATOR: &str = "Alt+Space";
#[cfg(desktop)]
const SNELTOETS_EVENT: &str = "axe://sneltoets-mic";

/// Toont het venster na de sneltoets, zonder de focus af te pakken waar dat kan.
///
/// `show_main_window` hierboven zet er `set_focus()` bij, en daar is dat goed:
/// je hebt er zelf in de app om gevraagd. Bij een GLOBALE sneltoets is het
/// verkeerd. Je drukt hem juist terwijl je in een andere app zit -- vaak een die
/// in volledig scherm staat -- en op macOS klapt het hele beeld dan om naar een
/// ander Space. Voor een sneltoets die alleen de mic hoort te openen is dat het
/// tegenovergestelde van handig: je wilt praten TERWIJL je in die app bezig blijft.
///
/// Dus op macOS wel tonen, niet activeren. Op Windows en Linux bestaat die
/// Space-val niet, en is een venster dat niet vooraan komt juist onvindbaar --
/// daar dus wel `set_focus()`.
///
/// Wat hier bewust NIET gebeurt: `set_visible_on_all_workspaces(true)`. Dat zou
/// het venster ook over een app in volledig scherm heen laten verschijnen, maar
/// het is een blijvende verandering aan het venster, niet iets voor deze ene
/// druk. Staat er een app in volledig scherm voorop, dan blijft het venster dus
/// onzichtbaar tot je zelf terugwisselt -- de mic gaat wél gewoon open, want het
/// event hieronder gaat los van het venster.
#[cfg(desktop)]
fn toon_sneltoets_venster(app: &tauri::AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let _ = win.unminimize();
    let _ = win.show();
    #[cfg(not(target_os = "macos"))]
    let _ = win.set_focus();
}

/// Wisselt het native glas mee met de lichte of donkere stand.
///
/// Houdt het glas gelijk in beide standen.
///
/// De naam suggereert een wissel, en dat was ook de bedoeling: Sidebar met een
/// lichte appearance voor de lichte stand. Gemeten resultaat was bleek glas --
/// het bureaublad werd weer herkenbaar in plaats van tot vlekken vervaagd.
///
/// Het glas dat hier hoort is in allebei de standen hetzelfde: grijsblauw
/// matglas. Het verschil tussen licht en donker zit in wat er OP de plaat
/// ligt, niet in de plaat. Deze functie blijft bestaan omdat de app hem bij
/// elke standwissel aanroept en het materiaal daarna opnieuw moet aanhaken --
/// anders valt de vervaging weg zodra het venster van uitstraling verandert.
#[tauri::command]
fn zet_plaat_materiaal(window: tauri::Window, licht: bool) -> Result<(), String> {
    let look = if licht { "glass" } else { "black" };
    // Alleen het hoofdvenster mag ~/.axe/look schrijven én vibrancy zetten.
    // De notch-webview (axe-float-axe) laadt dezelfde bundle en riep dit aan
    // met DEFAULT_LOOK=glass: bestand werd glass terwijl HQ black was, en
    // HudWindow-vibrancy (rechthoek, radius 18) gaf donkere hoek-streepjes
    // onder de afgeronde CSS-balk.
    if window.label() != "main" {
        return Ok(());
    }
    {
        let look_path = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".axe"));
        if let Some(dir) = look_path {
            let _ = fs::create_dir_all(&dir);
            let _ = fs::write(dir.join("look"), look);
        }
    }
    let _ = window.app_handle().emit("axe-look", LookState { look: look.to_string() });
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

        // Hetzelfde glas in allebei de standen.
        //
        // Eerst probeerde ik het om te klappen: Sidebar met een lichte
        // appearance voor de lichte stand. Dat maakte het glas bleek -- je
        // keek er zowat doorheen en de bergen achter het venster waren weer
        // herkenbaar. Wat Luka wil is juist het grijsblauwe matglas dat de
        // donkere stand al heeft: je ziet DAT er iets achter zit, niet WAT.
        //
        // Dus geen wissel. Eén materiaal, en het verschil tussen licht en
        // donker zit in wat er OP de plaat ligt, niet in de plaat zelf. Dat is
        // ook precies wat axe-look.css er al over zegt: "de demo keert alleen
        // de plaat om, niet wat erop ligt."
        let _ = window.set_theme(Some(tauri::Theme::Dark));
        let materiaal = NSVisualEffectMaterial::HudWindow;
        let _ = licht;

        apply_vibrancy(&window, materiaal, Some(NSVisualEffectState::Active), Some(18.0))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = licht;
    }
    Ok(())
}


/// De stand van de twee achtergronddiensten. Zie diensten.rs.
#[cfg(desktop)]
#[tauri::command]
fn diensten_stand() -> Vec<diensten::DienstStand> {
    diensten::stand()
}

#[cfg(desktop)]
#[tauri::command]
fn dienst_start(id: String) -> Result<String, String> {
    diensten::start_dienst(&id)
}

#[cfg(desktop)]
#[tauri::command]
fn dienst_stop(id: String) -> Result<String, String> {
    diensten::stop_dienst(&id)
}

#[cfg(desktop)]
#[tauri::command]
fn worker_dienst_stand(id: String) -> Result<launchd::LaunchdStand, String> {
    launchd::status(&id)
}

#[cfg(desktop)]
#[tauri::command]
fn worker_dienst_herstart(id: String) -> Result<String, String> {
    launchd::kickstart(&id)
}

/// Hoofdvenster tonen zonder de focus te pakken -- voor alles wat AXE uit
/// zichzelf doet (klap, wekwoord, een melding), niet voor een klik van Luka.
///
/// `show_main_window` hierboven doet `set_focus()`, en dat is in tao
/// `activateIgnoringOtherApps`: het toetsenbord springt naar AXE, waar je ook
/// zat. Op de Mac mini met het tweede scherm betekende dat: halverwege een
/// zin op dat scherm sta je ineens in AXE op het hoofdscherm (Luka, 6 nov).
/// Eerst opruimen wat stil kan; wie dan nog focus pakt, staat in focus.log.
#[cfg(desktop)]
#[tauri::command]
fn toon_hoofdvenster_stil(app: tauri::AppHandle) {
    toon_sneltoets_venster(&app);
}

/// Schrijft één regel naar ~/.axe/focus.log als een AXE-venster de focus
/// krijgt. Geen gedrag, alleen bewijs: "hij pakt steeds het hoofdscherm" is
/// op de Mac mini niet na te spelen vanaf de iMac, en met dit log staat er
/// zwart op wit welk venster het was en wanneer. Blijft onder de 256 kB.
#[cfg(desktop)]
fn log_focus(label: &str) {
    use std::io::Write;
    let Some(home) = std::env::var_os("HOME") else { return };
    let pad = PathBuf::from(home).join(".axe").join("focus.log");
    if fs::metadata(&pad).map(|m| m.len() > 256 * 1024).unwrap_or(false) {
        let _ = fs::rename(&pad, pad.with_extension("log.1"));
    }
    let nu = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&pad) {
        let _ = writeln!(f, "{nu} focus {label}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Eén generate_handler! kan niet half uit staan, en een tweede
    // .invoke_handler overschrijft de eerste in plaats van hem aan te vullen.
    // Dus twee lijsten achter een cfg: desktop kent de diensten en launchd,
    // een APK niet.
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        zet_plaat_materiaal,
        get_axe_look,
        write_vault_file,
        read_vault_file,
        vault_path_exists,
        ensure_vault_dir,
        list_vault_files,
        show_main_window,
        toon_hoofdvenster_stil,
        consume_overlay_open_route,
        platform_info,
            dock_notch_frame,
        diensten_stand,
        dienst_start,
        dienst_stop,
        worker_dienst_stand,
        worker_dienst_herstart,
        gesture_lock::gesture_lock_load,
        gesture_lock::gesture_lock_save,
        gesture_lock::gesture_lock_clear,
    ]);
    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        zet_plaat_materiaal,
        get_axe_look,
        write_vault_file,
        read_vault_file,
        vault_path_exists,
        ensure_vault_dir,
        list_vault_files,
        show_main_window,
        consume_overlay_open_route,
        platform_info,
            dock_notch_frame,
        gesture_lock::gesture_lock_load,
        gesture_lock::gesture_lock_save,
        gesture_lock::gesture_lock_clear,
    ]);

    // Systeemmeldingen. De bel in de app ziet alleen wie kijkt; een melding
    // van de bewaker of een cron die faalt moet ook binnenkomen als het venster
    // dicht of achter een ander programma zit. De webview beslist wat er
    // gemeld wordt (src/domain/systeemMelding.ts), deze plugin toont het.
    let builder = builder.plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if let WindowEvent::Focused(true) = event {
            log_focus(window.label());
        }
    });

    builder
        .plugin(gesture_lock::plugin())
        .setup(|app| {
            let handle = app.handle().clone();

            // ── Waarom de vervaging hier zit en niet in CSS ──────────────
            //
            // Het venster is doorzichtig (transparent: true). Zonder deze
            // regel kijk je SCHERP naar je bureaublad -- een gat, geen glas.
            // De vervaging komt van NSVisualEffectView, die buiten de webview
            // ligt, dus CSS kan er niet bij: `backdrop-filter` vervaagt alleen
            // wat binnen de pagina achter een element ligt, en het bureaublad
            // hoort daar niet bij.
            //
            // HudWindow, en niet UnderPageBackground.
            //
            // Dat laatste is het donkerste standaardmateriaal, en het leek dus
            // de manier om "zwarter maar even doorzichtig" te krijgen. Dat was
            // fout: het is donkerder OMDAT het bijna dicht is. Bij macOS-
            // materialen zijn donkerte en doorzichtigheid niet te scheiden --
            // geprobeerd, en het venster was meteen ondoorzichtig.
            //
            // Zwarter maken gaat dus via de tint in axe-look.css, niet hier.
            //
            // De tint erboven komt uit axe-look.css, zodat de twee standen
            // alleen in kleur verschillen.
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("main") {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                // State::Active en niet None.
                //
                // None betekent FollowsWindowActiveState: macOS zet de vervaging
                // uit zodra het venster niet meer voorop staat, en dan valt de
                // plaat terug op één effen kleur. Dat is precies wat je ziet als
                // je naast de app klikt -- het glas verdwijnt en komt terug bij
                // het aanklikken. Voor een venster dat ALTIJD glas hoort te zijn
                // is dat verkeerd; Active houdt de vervaging aan ongeacht focus.
                let _ = apply_vibrancy(
                    &win,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(18.0),
                );
            }

            // Tray en venster-verbergen bestaan alleen op desktop; op mobiel
            // is er geen tray en sluit je de app niet weg naar een balk.
            #[cfg(desktop)]
            {
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
            }

            // ── Option+Space, overal ────────────────────────────────────
            //
            // useKeyboardShortcuts.ts hoort alleen wat er in ONS venster
            // gebeurt. Staat Mail of Chrome voorop, dan krijgt de webview de
            // toets nooit te zien; alleen het besturingssysteem kan hem daar
            // afvangen, en dat is precies wat deze plugin doet.
            //
            // Wat hier NIET gebeurt is beslissen of de mic start of stopt. Dat
            // is een schakelaar, en alleen de frontend weet of er al een gesprek
            // loopt (sneltoetsActie in src/domain/voice/sneltoets.ts). Rust zet
            // het venster klaar en stuurt één event; de rest gebeurt daar.
            #[cfg(desktop)]
            {
                use tauri::Emitter;
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                // Option heet op Windows en Linux Alt, en in Tauri heet hij
                // overal Alt. Zelfde toets, andere naam op de kap.
                let mic_sneltoets = Shortcut::new(Some(Modifiers::ALT), Code::Space);

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            // Alleen bij indrukken. Zonder deze regel vuurt
                            // dezelfde sneltoets twee keer -- ook bij loslaten --
                            // en zet de schakelaar zichzelf meteen weer terug,
                            // zodat je van de mic nooit meer dan een tik hoort.
                            if shortcut != &mic_sneltoets
                                || event.state() != ShortcutState::Pressed
                            {
                                return;
                            }
                            toon_sneltoets_venster(app);
                            let _ = app.emit(SNELTOETS_EVENT, SNELTOETS_ACCELERATOR);
                        })
                        .build(),
                )?;

                // Een bezette sneltoets mag de app niet tegenhouden. Option+Space
                // is op sommige Macs al van Spotlight of een ander programma; dan
                // werkt alles behalve deze ene weg naar de mic, en dat is beter
                // dan een app die niet opstart.
                if let Err(err) = app.global_shortcut().register(mic_sneltoets) {
                    eprintln!(
                        "AXE global shortcut ({SNELTOETS_ACCELERATOR}) not registered: {err}"
                    );
                }
            }

            // De shell-server en de lokale API meteen aanzetten, tenzij er al
            // iets op hun poort luistert. Dat scheelt twee terminalvensters die
            // je anders zelf open moet houden -- en die je per ongeluk sluit.
            #[cfg(desktop)]
            diensten::start_bij_opstarten();

            // AXE CORE Native is one runtime contract: opening the canonical app
            // also makes sure its registered background workers are actually
            // alive. Healthy workers are left untouched so in-flight work is
            // never interrupted; labels that live on the other Mac are ignored.
            #[cfg(desktop)]
            for worker in ["computer-worker", "browser-agent"] {
                if let Err(err) = launchd::ensure_running(worker) {
                    eprintln!("AXE worker startup warning ({worker}): {err}");
                }
            }

            let _ = handle;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Alles wat wij startten weer neerhalen. Zonder dit blijven npm en
            // uvicorn draaien nadat je de app hebt afgesloten, en dan is de
            // volgende bouw "address already in use" van een proces waarvan je
            // niet meer weet dat het bestaat.
            #[cfg(desktop)]
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                diensten::stop_alles();
            }
            #[cfg(not(desktop))]
            let _ = event;
        });
}
