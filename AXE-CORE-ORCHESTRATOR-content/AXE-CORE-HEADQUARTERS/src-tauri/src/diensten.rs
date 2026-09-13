//! De twee achtergronddiensten die AXE CORE zelf kan draaien.
//!
//! ## Waarom dit bestaat
//!
//! De shell-server (poort 4022) en de lokale API (poort 8001) draaien in de
//! VOORGROND van een terminalvenster. Je moest dus twee vensters openhouden
//! naast de app -- terwijl de app op dezelfde Mac draait en ze net zo goed
//! zelf kan starten. Sluit je zo'n venster per ongeluk, dan valt de dienst om
//! en krijg je een 404 of een terminal die niet verbindt, zonder dat iets zegt
//! waarom.
//!
//! ## Waarom via `zsh -lc` en niet rechtstreeks
//!
//! Dit is de valkuil die elke keer terugkomt: een GUI-app op macOS erft NIET
//! de PATH uit je .zshrc. Hij krijgt het kale `/usr/bin:/bin:/usr/sbin:/sbin`,
//! en daar staat geen `npm`, geen `node` uit nvm en geen homebrew. Een
//! rechtstreekse spawn van "npm" faalt dus met "No such file or directory" op
//! een machine waar npm aantoonbaar werkt -- en dat kost een uur zoeken.
//!
//! Een LOGIN-shell (-l) leest je profiel en heeft daarna dezelfde PATH als het
//! venster waarin je het anders zou typen.
//!
//! ## Wat het met opzet NIET doet
//!
//! Het stopt nooit iets dat wij niet zelf gestart zijn. Draait er al iets op
//! die poort -- jouw eigen terminalvenster bijvoorbeeld -- dan laten we het met
//! rust en melden we dat het al luistert. Een app die andermans processen
//! afschiet omdat ze op "zijn" poort zitten, is erger dan een app die niets
//! doet.

use std::collections::HashMap;
use std::net::{Shutdown, SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

/// Eén dienst die de app kan starten.
struct Bouwplan {
    id: &'static str,
    naam: &'static str,
    waarvoor: &'static str,
    poort: u16,
    /// Wat er in de login-shell komt te staan, relatief aan de repo.
    cmd: &'static str,
}

const PLANNEN: &[Bouwplan] = &[
    Bouwplan {
        id: "terminal",
        naam: "Shell-server",
        waarvoor: "De Terminals-tab praat hiermee. Zonder dit staat 'Deze Mac' op rood.",
        poort: 4022,
        cmd: "npm run terminal",
    },
    Bouwplan {
        id: "api",
        naam: "Lokale API",
        waarvoor: "Code Agent, commit & push, en de agent-motoren. Zonder dit: AXE API 404.",
        poort: 8001,
        cmd: "cd backend/axe_api && ./run-local.sh",
    },
];

#[derive(serde::Serialize)]
pub struct DienstStand {
    id: String,
    naam: String,
    waarvoor: String,
    poort: u16,
    /// Luistert er iets op die poort -- door ons gestart of niet.
    luistert: bool,
    /// Of WIJ het draaiende proces zijn. Zo niet, dan blijft stoppen geweigerd.
    van_ons: bool,
    /// Waar de uitvoer heen gaat, zodat een stille mislukking te lezen is.
    log: String,
    repo: String,
}

/// De repo waar deze app uit gebouwd is.
///
/// Ingebakken bij het bouwen: `CARGO_MANIFEST_DIR` is src-tauri, dus de map
/// erboven is de repo. Dat klopt zolang je bouwt waar je werkt, en dat is hier
/// het geval -- `npm run bijwerken` bouwt in de checkout zelf.
///
/// AXE_REPO overschrijft het, voor als de map ooit verhuist. Dan hoeft er geen
/// nieuwe bouw aan te pas te komen om het recht te zetten.
fn repo_pad() -> PathBuf {
    if let Ok(p) = std::env::var("AXE_REPO") {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn log_pad(id: &str) -> PathBuf {
    // In de repo en niet in Application Support: je wilt er met `tail -f` bij
    // kunnen zonder eerst een pad op te zoeken dat je niet uit je hoofd kent.
    let map = repo_pad().join(".axe-logs");
    let _ = std::fs::create_dir_all(&map);
    map.join(format!("{id}.log"))
}

/// Luistert er iets op 127.0.0.1:poort?
///
/// Verbinden en meteen weer ophangen. Dit is de enige eerlijke test: een
/// proces in onze eigen lijst kan allang gestorven zijn, en een dienst die JIJ
/// in een terminal startte staat niet in die lijst maar luistert wel.
fn luistert(poort: u16) -> bool {
    let adres = SocketAddr::from(([127, 0, 0, 1], poort));
    match TcpStream::connect_timeout(&adres, Duration::from_millis(250)) {
        Ok(s) => {
            let _ = s.shutdown(Shutdown::Both);
            true
        }
        Err(_) => false,
    }
}

/// De kinderen die wij gestart hebben, op id.
static KINDEREN: Mutex<Option<HashMap<String, Child>>> = Mutex::new(None);

fn met_kinderen<T>(f: impl FnOnce(&mut HashMap<String, Child>) -> T) -> T {
    let mut slot = KINDEREN.lock().unwrap_or_else(|e| e.into_inner());
    let map = slot.get_or_insert_with(HashMap::new);
    f(map)
}

fn plan(id: &str) -> Option<&'static Bouwplan> {
    PLANNEN.iter().find(|p| p.id == id)
}

/// Leeft het kind dat wij voor deze dienst startten nog?
///
/// `try_wait` ruimt een gestopt kind meteen op: een Child die je nooit oogst
/// blijft als zombie in de procestabel staan, en dan lijkt hij te leven.
fn van_ons(id: &str) -> bool {
    met_kinderen(|k| match k.get_mut(id) {
        Some(kind) => match kind.try_wait() {
            Ok(Some(_)) => {
                k.remove(id);
                false
            }
            Ok(None) => true,
            Err(_) => false,
        },
        None => false,
    })
}

pub fn start_dienst(id: &str) -> Result<String, String> {
    let p = plan(id).ok_or_else(|| format!("Onbekende dienst: {id}"))?;

    if luistert(p.poort) {
        return Ok(format!(
            "{} luisterde al op poort {} — niets gestart.",
            p.naam, p.poort
        ));
    }

    let repo = repo_pad();
    if !repo.join("package.json").exists() {
        return Err(format!(
            "Geen repo gevonden op {}. Zet AXE_REPO op het juiste pad.",
            repo.display()
        ));
    }

    let log = log_pad(p.id);
    let uit = std::fs::File::create(&log).map_err(|e| format!("log openen: {e}"))?;
    let fout = uit.try_clone().map_err(|e| format!("log klonen: {e}"))?;

    // -l is de kern: een login-shell leest je profiel, en pas dan bestaan npm
    // en node. Zie de uitleg bovenaan dit bestand.
    let kind = Command::new("/bin/zsh")
        .arg("-lc")
        .arg(p.cmd)
        .current_dir(&repo)
        .stdin(Stdio::null())
        .stdout(Stdio::from(uit))
        .stderr(Stdio::from(fout))
        .spawn()
        .map_err(|e| format!("starten van {}: {e}", p.naam))?;

    met_kinderen(|k| k.insert(p.id.to_string(), kind));
    onthoud_gestart(p.id);
    Ok(format!("{} gestart. Uitvoer: {}", p.naam, log.display()))
}

pub fn stop_dienst(id: &str) -> Result<String, String> {
    let p = plan(id).ok_or_else(|| format!("Onbekende dienst: {id}"))?;

    // Alleen wat wij startten. Draait jouw eigen terminalvenster op die poort,
    // dan is dat niet van ons om af te sluiten -- zie de uitleg bovenaan.
    let gedood = met_kinderen(|k| match k.remove(p.id) {
        Some(mut kind) => {
            let _ = kind.kill();
            let _ = kind.wait();
            true
        }
        None => false,
    });

    if gedood {
        // Bewust gestopt is geen storing: de bewaker mag hem niet meteen weer
        // aanzetten, want dan kun je hem nooit uit krijgen.
        vergeet_gestart(p.id);
        Ok(format!("{} gestopt.", p.naam))
    } else if luistert(p.poort) {
        Err(format!(
            "{} draait, maar niet vanuit AXE CORE. Sluit het venster waarin je hem startte.",
            p.naam
        ))
    } else {
        Ok(format!("{} draaide niet.", p.naam))
    }
}

fn vergeet_gestart(id: &str) {
    let mut slot = OOIT.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(v) = slot.as_mut() {
        v.retain(|x| x != id);
    }
}

pub fn stand() -> Vec<DienstStand> {
    let repo = repo_pad().display().to_string();
    PLANNEN
        .iter()
        .map(|p| DienstStand {
            id: p.id.to_string(),
            naam: p.naam.to_string(),
            waarvoor: p.waarvoor.to_string(),
            poort: p.poort,
            luistert: luistert(p.poort),
            van_ons: van_ons(p.id),
            log: log_pad(p.id).display().to_string(),
            repo: repo.clone(),
        })
        .collect()
}

/// Hoe vaak de bewaker kijkt of alles nog luistert.
///
/// Tien seconden. Vaker is zinloos -- een dienst die omvalt merk je niet in
/// vijf seconden meer dan in tien -- en het kost elke keer twee
/// verbindingspogingen. Minder vaak en je zit een minuut naar een dode
/// terminal te kijken zonder te weten waarom.
const BEWAAK_SECONDEN: u64 = 10;

/// Bij het opstarten allebei aanzetten, en daarna blijven kijken.
///
/// In een eigen thread: `luistert()` wacht tot 250ms per poort, en dat mag het
/// venster niet ophouden. Een app die een halve seconde later opent omdat hij
/// twee poorten aan het aftasten was, is een app die traag aanvoelt zonder dat
/// iemand kan zien waarom.
///
/// ## Waarom er een bewaker is
///
/// Een dienst kan omvallen: uvicorn stopt op een fout in de code, de
/// shell-server op een kapotte verbinding. Zonder bewaker merk je dat pas als
/// je iets probeert -- een terminal die niet verbindt, een Code Agent die 404
/// geeft -- en dan moet je eerst uitzoeken dát er iets weg is voordat je kunt
/// bedenken waarom.
///
/// Hij start alleen opnieuw wat WIJ startten en wat niet meer luistert. Draait
/// jouw eigen venster op die poort, dan is er niets aan de hand en blijft hij
/// ervan af.
pub fn start_bij_opstarten() {
    std::thread::spawn(|| {
        for p in PLANNEN {
            match start_dienst(p.id) {
                Ok(bericht) => eprintln!("[diensten] {bericht}"),
                Err(fout) => eprintln!("[diensten] {} kon niet starten: {fout}", p.naam),
            }
        }

        loop {
            std::thread::sleep(Duration::from_secs(BEWAAK_SECONDEN));
            for p in PLANNEN {
                if luistert(p.poort) {
                    continue;
                }
                // Niets aan de hand als we hem nooit gestart hebben: dan heeft
                // iemand hem bewust uit, of draait hij hier gewoon niet.
                if !van_ons(p.id) && !ooit_gestart(p.id) {
                    continue;
                }
                eprintln!("[diensten] {} luistert niet meer — opnieuw starten", p.naam);
                match start_dienst(p.id) {
                    Ok(bericht) => eprintln!("[diensten] {bericht}"),
                    Err(fout) => eprintln!("[diensten] {} kwam niet terug: {fout}", p.naam),
                }
            }
        }
    });
}

/// Hebben wij deze dienst ooit gestart in dit vensterleven?
///
/// Nodig omdat het kind dat we startten weg is zodra hij crasht: `van_ons`
/// zegt dan nee, en zonder dit geheugen zou de bewaker hem nooit meer
/// aanzetten. Precies de stille faalwijze die hij moest oplossen.
static OOIT: Mutex<Option<Vec<String>>> = Mutex::new(None);

fn ooit_gestart(id: &str) -> bool {
    let slot = OOIT.lock().unwrap_or_else(|e| e.into_inner());
    slot.as_ref().is_some_and(|v| v.iter().any(|x| x == id))
}

fn onthoud_gestart(id: &str) {
    let mut slot = OOIT.lock().unwrap_or_else(|e| e.into_inner());
    let lijst = slot.get_or_insert_with(Vec::new);
    if !lijst.iter().any(|x| x == id) {
        lijst.push(id.to_string());
    }
}

/// Alles wat wij startten weer neerhalen.
///
/// Zonder dit blijven npm en uvicorn draaien nadat je de app hebt afgesloten,
/// en dan is de volgende bouw "address already in use" van een proces waarvan
/// je niet meer weet dat het bestaat.
pub fn stop_alles() {
    met_kinderen(|k| {
        for (_, mut kind) in k.drain() {
            let _ = kind.kill();
            let _ = kind.wait();
        }
    });
}
