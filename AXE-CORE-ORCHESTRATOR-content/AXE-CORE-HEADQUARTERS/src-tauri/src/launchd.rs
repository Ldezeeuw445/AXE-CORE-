//! Herstart de twee launchd-diensten die AXE's eigen workers zijn.
//!
//! ## Waarom dit apart staat van diensten.rs
//!
//! diensten.rs beheert twee dingen die de APP zelf als kind-proces start en
//! bij afsluiten weer stopt (shell-server, lokale API). `com.axe.computer-worker`
//! en `com.axe.browser-agent` zijn anders: het zijn launchd-agents die al
//! draaien voordat AXE CORE ooit geopend wordt, en die moeten blijven draaien
//! nadat de app weer dicht is. Ze zijn nooit een kind van dit proces, dus ze
//! horen niet in KINDEREN/start_dienst thuis -- dat zou hun levenscyclus aan
//! deze app knopen terwijl het hele punt van launchd is dat dat niet hoeft.
//!
//! ## Waarom een vaste lijst en geen vrij label
//!
//! `id` komt uit de tool-registry, die op haar beurt reageert op wat een taal-
//! model in de chat verzint. Een vrij `label`-veld zou betekenen dat een
//! promptinjectie via een core_tasks-payload `launchctl kickstart` tegen om het
//! even welke daemon op deze Mac kon richten. BEHEERD is de enige vertaling
//! van id naar label, dus zelfs een compromitteerde aanroeper kan nooit meer
//! bereiken dan deze twee, met elkaar al bekende, eigen workers herstarten.
//!
//! ## Waarom kickstart -k en geen eigen spawn
//!
//! `launchctl kickstart -k` is launchd's eigen "herstart dit label" -- het
//! bestaat al, beheert zijn eigen enkelvoudige proces, en kan dus nooit een
//! tweede exemplaar naast een hangend eerste zetten. Zelf `node worker.mjs &`
//! spawnen zou precies dat risico introduceren (het dubbel-proces-probleem
//! dat dit juist moet voorkomen) en zou bovendien de kroon van launchd's eigen
//! herstart-backoff/throttling wegnemen.

use std::process::Command;

/// (id zoals de frontend hem gebruikt, launchd-label)
const BEHEERD: &[(&str, &str)] = &[
    ("computer-worker", "com.axe.computer-worker"),
    ("browser-agent", "com.axe.browser-agent"),
];

fn label_voor(id: &str) -> Result<&'static str, String> {
    BEHEERD
        .iter()
        .find(|(known_id, _)| *known_id == id)
        .map(|(_, label)| *label)
        .ok_or_else(|| format!("Onbekende launchd-worker: {id}"))
}

#[derive(serde::Serialize)]
pub struct LaunchdStand {
    id: String,
    label: String,
    /// true als `launchctl print` een lopend proces meldt.
    running: bool,
    /// Ruwe uitvoer, afgekapt -- zodat een onverwachte staat leesbaar blijft
    /// zonder de hele plist-dump door te sturen.
    detail: String,
}

/// Draai een vaste, aan onze kant samengestelde shell-regel.
///
/// `$(id -u)` moet in een shell worden opgelost (macOS'
/// launchctl-domeinnotatie is `gui/<uid>/<label>`, en Rust heeft in std geen
/// getuid); `label` komt hier nooit van de aanroeper maar altijd uit BEHEERD
/// hierboven, dus er reist geen extern ingevoerde tekst de shell-string in.
fn run_voor_label(label: &'static str, actie: &str) -> Result<(String, bool), String> {
    let cmd = format!("launchctl {actie} gui/$(id -u)/{label}");
    let out = Command::new("/bin/zsh")
        .arg("-lc")
        .arg(&cmd)
        .output()
        .map_err(|e| format!("launchctl niet te starten: {e}"))?;
    let tekst = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    Ok((tekst, out.status.success()))
}

pub fn status(id: &str) -> Result<LaunchdStand, String> {
    let label = label_voor(id)?;
    let (tekst, ok) = run_voor_label(label, "print")?;
    // Geen exit 0 op "print" betekent meestal: dit label is nergens geladen op
    // deze Mac. Dat is geen fout van deze functie -- het is precies het geval
    // waarin de aanroeper hoort te concluderen "niet hier, kijk op de andere
    // machine" in plaats van "kapot".
    let running = ok && tekst.contains("state = running");
    Ok(LaunchdStand {
        id: id.to_string(),
        label: label.to_string(),
        running,
        detail: tekst.chars().take(600).collect(),
    })
}

pub fn kickstart(id: &str) -> Result<String, String> {
    let label = label_voor(id)?;
    let (tekst, ok) = run_voor_label(label, "kickstart -k")?;
    if ok {
        Ok(format!("{label} herstart via launchd."))
    } else {
        Err(format!(
            "launchctl kickstart voor {label} gaf een fout: {}",
            tekst.trim()
        ))
    }
}


/// Ensure one managed launchd agent is running without disrupting a healthy
/// in-flight worker. Returns Ok(false) when this Mac has no such registered
/// label (normal when a worker intentionally lives on the other Mac).
pub fn ensure_running(id: &str) -> Result<bool, String> {
    let label = label_voor(id)?;
    let (detail, loaded) = run_voor_label(label, "print")?;
    if !loaded {
        return Ok(false);
    }
    if detail.contains("state = running") {
        return Ok(true);
    }
    let (_kick, ok) = run_voor_label(label, "kickstart")?;
    if !ok {
        return Err(format!("kon {label} niet starten via launchd"));
    }
    let (after, after_ok) = run_voor_label(label, "print")?;
    Ok(after_ok && after.contains("state = running"))
}
