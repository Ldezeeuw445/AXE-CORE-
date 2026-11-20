//! Notch ronde 3 (Luka 20 nov): muziek en Mac-knoppen in de notch.
//!
//! Alles via osascript, met vaste scripts: de webview kiest alleen een woord
//! uit een korte lijst, nooit zelf AppleScript. Een muziek-app wordt nooit
//! opgestart om te kijken wat er speelt (`is running` eerst).

use std::process::Command;

fn osa(script: &str) -> Result<String, String> {
    let uit = Command::new("/usr/bin/osascript").args(["-e", script]).output().map_err(|e| e.to_string())?;
    if uit.status.success() {
        Ok(String::from_utf8_lossy(&uit.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&uit.stderr).trim().chars().take(200).collect())
    }
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Muziek {
    pub app: String,
    pub titel: String,
    pub artiest: String,
    pub speelt: bool,
}

const APPS: [&str; 2] = ["Spotify", "Music"];

/// Wat er speelt. Eerst de app die echt speelt, anders een gepauzeerde.
pub fn stand() -> Option<Muziek> {
    let mut gepauzeerd = None;
    for app in APPS {
        let script = format!(
            "if application \"{app}\" is running then\n\
             tell application \"{app}\"\n\
             if player state is stopped then return \"\"\n\
             return (player state as text) & \"\\t\" & (name of current track) & \"\\t\" & (artist of current track)\n\
             end tell\n\
             end if\n\
             return \"\""
        );
        let Ok(regel) = osa(&script) else { continue };
        if let Some(m) = lees(app, &regel) {
            if m.speelt {
                return Some(m);
            }
            gepauzeerd.get_or_insert(m);
        }
    }
    gepauzeerd
}

fn lees(app: &str, regel: &str) -> Option<Muziek> {
    let mut delen = regel.splitn(3, '\t');
    let toestand = delen.next()?.trim();
    let titel = delen.next()?.trim().to_string();
    if toestand.is_empty() || titel.is_empty() {
        return None;
    }
    Some(Muziek {
        app: app.to_string(),
        titel,
        artiest: delen.next().unwrap_or("").trim().to_string(),
        speelt: toestand == "playing",
    })
}

pub fn knop(app: &str, actie: &str) -> Result<(), String> {
    if !APPS.contains(&app) {
        return Err("onbekende app".into());
    }
    let opdracht = match actie {
        "playpause" => "playpause",
        "next" => "next track",
        "previous" => "previous track",
        _ => return Err("onbekende knop".into()),
    };
    osa(&format!("if application \"{app}\" is running then tell application \"{app}\" to {opdracht}")).map(|_| ())
}

#[derive(serde::Serialize, Debug)]
pub struct Geluid {
    pub volume: u8,
    pub stil: bool,
}

pub fn geluid() -> Result<Geluid, String> {
    let r = osa("set s to get volume settings\nreturn ((output volume of s) as text) & \",\" & ((output muted of s) as text)")?;
    let (v, m) = r.split_once(',').ok_or("onverwacht antwoord")?;
    Ok(Geluid { volume: v.trim().parse().unwrap_or(0), stil: m.trim() == "true" })
}

pub fn zet_volume(volume: u8) -> Result<Geluid, String> {
    osa(&format!("set volume output volume {} without output muted", volume.min(100)))?;
    geluid()
}

/// Mac-knoppen: alleen deze woorden.
pub fn mac(actie: &str) -> Result<(), String> {
    match actie {
        "mute" => osa("set volume output muted (not (output muted of (get volume settings)))").map(|_| ()),
        "scherm-uit" => Command::new("/usr/bin/pmset").arg("displaysleepnow").status().map(|_| ()).map_err(|e| e.to_string()),
        _ => Err("onbekende knop".into()),
    }
}


/* ── Schakelaars (20 nov): donker, bureaublad-iconen, wakker houden ──────
   Zelfde woorden en zelfde pid-bestand als infra/computer-worker/
   macSchakelaars.mjs, zodat de notch ziet wat de stem aanzette. */

#[derive(serde::Serialize, Debug)]
pub struct Schakelaars {
    pub donker: bool,
    pub iconen: bool,
    pub wakker: bool,
}

fn wakker_pid_pad() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".axe").join("wakker.pid"))
}

fn leeft(pid: u32) -> bool {
    Command::new("/bin/kill").args(["-0", &pid.to_string()]).status().map(|s| s.success()).unwrap_or(false)
}

fn wakker_pid() -> Option<u32> {
    let pid: u32 = std::fs::read_to_string(wakker_pid_pad()?).ok()?.trim().parse().ok()?;
    leeft(pid).then_some(pid)
}

fn lees_default(args: &[&str]) -> Option<String> {
    let uit = Command::new("/usr/bin/defaults").args(args).output().ok()?;
    uit.status.success().then(|| String::from_utf8_lossy(&uit.stdout).trim().to_string())
}

pub fn schakelaars() -> Schakelaars {
    Schakelaars {
        donker: lees_default(&["read", "-g", "AppleInterfaceStyle"]).as_deref() == Some("Dark"),
        iconen: !matches!(lees_default(&["read", "com.apple.finder", "CreateDesktop"]).as_deref(), Some("0") | Some("false")),
        wakker: wakker_pid().is_some(),
    }
}

pub fn schakel(woord: &str) -> Result<Schakelaars, String> {
    match woord {
        "donker" | "licht" => {
            osa(&format!(
                "tell application \"System Events\" to tell appearance preferences to set dark mode to {}",
                woord == "donker"
            ))?;
        }
        "iconen-weg" | "iconen-terug" => {
            let aan = if woord == "iconen-terug" { "true" } else { "false" };
            Command::new("/usr/bin/defaults")
                .args(["write", "com.apple.finder", "CreateDesktop", "-bool", aan])
                .status()
                .map_err(|e| e.to_string())?;
            let _ = Command::new("/usr/bin/killall").arg("Finder").status();
        }
        "wakker" => {
            if wakker_pid().is_none() {
                let kind = Command::new("/usr/bin/caffeinate")
                    .args(["-dis", "-t", "28800"])
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .map_err(|e| e.to_string())?;
                let pad = wakker_pid_pad().ok_or("HOME niet gezet")?;
                if let Some(map) = pad.parent() {
                    let _ = std::fs::create_dir_all(map);
                }
                std::fs::write(pad, kind.id().to_string()).map_err(|e| e.to_string())?;
            }
        }
        "slapen-mag" => {
            if let Some(pid) = wakker_pid() {
                let _ = Command::new("/bin/kill").arg(pid.to_string()).status();
            }
            if let Some(p) = wakker_pid_pad() {
                let _ = std::fs::remove_file(p);
            }
        }
        "scherm-uit" => mac("scherm-uit")?,
        _ => return Err("onbekende schakelaar".into()),
    }
    Ok(schakelaars())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leest_de_regel() {
        assert_eq!(
            lees("Spotify", "playing\tSong\tArtist"),
            Some(Muziek { app: "Spotify".into(), titel: "Song".into(), artiest: "Artist".into(), speelt: true })
        );
        assert_eq!(lees("Music", ""), None);
        assert!(!lees("Music", "paused\tX\t").unwrap().speelt);
    }

    #[test]
    fn alleen_bekende_woorden() {
        assert!(knop("Terminal", "playpause").is_err());
        assert!(knop("Music", "do shell script").is_err());
        assert!(mac("rm -rf").is_err());
        assert!(schakel("killall Dock").is_err());
    }
}
