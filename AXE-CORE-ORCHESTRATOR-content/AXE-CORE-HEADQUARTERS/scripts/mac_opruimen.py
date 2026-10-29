#!/usr/bin/env python3
"""mac_opruimen — houdt de schijf van de Mac mini en de iMac leefbaar, vanzelf.

Waarom (29 okt 2026): via de tunnel gemeten stond de Mac mini op 90% en de
iMac op 91% schijf. Een Mac die bouwt (Tauri, Rust, npm, Xcode) stapelt
caches op die allemaal opnieuw te maken zijn; een volle schijf maakt hem traag
en laat de volgende build halverwege vallen. Luka: "kijken of het nodig is om
de mac mini op te ruimen en dat te willen doen".

Draait vanuit axe-autosync.sh, hooguit eens per 24 uur, of elke 3 uur zolang de
schijf boven de 90% zit. Weg gaat ALLEEN wat vanzelf terugkomt:

  - Xcode DerivedData en simulator-caches
  - de npm-, pip- en uv-cache, en oude Homebrew-downloads
  - Rust: incremental-mappen, de debug-build (na 3 dagen stil) en oude dmg's
  - AXE-logs boven 20 MB worden ingekort tot hun laatste 5 MB
  - pas boven 93% na dat alles: de hele src-tauri/target (de volgende build
    compileert dan alles opnieuw, langzamer maar hij past weer)

Nooit: Prullenmand, Downloads, documenten, node_modules, Ollama-modellen,
Docker, iPhone-backups, ~/.axe/werk (daar kan onafgemaakt agentwerk staan).
Die worden alleen gemeten en gemeld, zodat Luka zelf kiest.

Niets wordt verwijderd terwijl cargo/rustc of npm draait. Eén core_notifications-
rij per run zegt wat er vrij kwam. Uit: touch ~/.axe/opruimen-uit
Proef: python3 scripts/mac_opruimen.py --droog
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
HQ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAAT = os.path.join(HOME, ".axe", "opruimen.json")
UIT = os.path.join(HOME, ".axe", "opruimen-uit")
DAG_S = 24 * 3600
VOL_S = 3 * 3600
VOL_PCT = 90.0
NOOD_PCT = 93.0
LOG_MAX = 20 * 1024 * 1024
LOG_HOUD = 5 * 1024 * 1024
# Zelfde vaste plekken als vps_sync: launchd geeft alleen /usr/bin:/bin:/usr/sbin:/sbin.
MAC_BIN = ("/opt/homebrew/bin", "/usr/local/bin", os.path.join(HOME, ".local", "bin"),
           os.path.join(HOME, ".cargo", "bin"))


def pad(*delen: str) -> str:
    return os.path.join(HOME, *delen)


def tauri_target() -> str:
    return os.path.join(HQ, "src-tauri", "target")


def schijf(pad_: str | None = None) -> dict:
    # De home staat op het datavolume; dat is wat volloopt. "/" als vangnet.
    pad_ = pad_ or (HOME if os.path.isdir(HOME) else "/")
    t, gebruikt, vrij = shutil.disk_usage(pad_)
    return {"pct": round(100.0 * gebruikt / t, 1) if t else 0.0, "vrij_gb": round(vrij / 1e9, 1)}


def grootte(pad_: str, timeout: int = 300) -> int:
    """Bytes onder een pad (du -sk), 0 als het er niet is of du niet antwoordt."""
    if not os.path.exists(pad_):
        return 0
    try:
        p = subprocess.run(["du", "-sk", pad_], capture_output=True, text=True, timeout=timeout, check=False)
        return int((p.stdout.split() or ["0"])[0]) * 1024
    except (subprocess.TimeoutExpired, ValueError, OSError):
        return 0


#: Op een Mac heet npm in de proceslijst "node"; daarom op de volledige regel zoeken.
BEZIG = {
    "rust": r"(^|/)(cargo|rustc)( |$)",
    "npm": r"npm-cli\.js|(^|/)npm( |$)|(^|/)npx( |$)",
}


def draait(*soorten: str) -> bool:
    for s in soorten:
        if subprocess.run(["pgrep", "-f", BEZIG[s]], capture_output=True, check=False).returncode == 0:
            return True
    return False


def gereedschap(naam: str) -> str | None:
    gevonden = shutil.which(naam)
    if gevonden:
        return gevonden
    return next((os.path.join(d, naam) for d in MAC_BIN if os.access(os.path.join(d, naam), os.X_OK)), None)


def leeg_map(pad_: str) -> None:
    """De inhoud weg, de map zelf blijft (sommige tools verwachten hem)."""
    for naam in os.listdir(pad_):
        p = os.path.join(pad_, naam)
        if os.path.isdir(p) and not os.path.islink(p):
            shutil.rmtree(p, ignore_errors=True)
        else:
            try:
                os.remove(p)
            except OSError:
                pass


def stil_sinds(pad_: str) -> float:
    """Seconden sinds de laatste wijziging in de map (alleen het bovenste niveau)."""
    try:
        laatst = max([os.path.getmtime(pad_)] + [os.path.getmtime(os.path.join(pad_, n)) for n in os.listdir(pad_)])
    except OSError:
        return 0.0
    return time.time() - laatst


def kort_log_in(pad_: str, droog: bool) -> int:
    try:
        n = os.path.getsize(pad_)
    except OSError:
        return 0
    if n <= LOG_MAX:
        return 0
    if not droog:
        with open(pad_, "rb") as fh:
            fh.seek(n - LOG_HOUD)
            staart = fh.read()
        with open(pad_, "wb") as fh:
            fh.write(staart)
    return n - LOG_HOUD


def stappen() -> list[dict]:
    """Wat weg mag, in volgorde van 'kost niets' naar 'kost een langzamere build'."""
    t = tauri_target()
    uit = [
        {"naam": "Xcode DerivedData", "pad": pad("Library", "Developer", "Xcode", "DerivedData"), "soort": "leeg"},
        {"naam": "Simulator caches", "pad": pad("Library", "Developer", "CoreSimulator", "Caches"), "soort": "leeg"},
        {"naam": "npm cache", "pad": pad(".npm", "_cacache"), "soort": "weg", "niet_tijdens": ("npm",)},
        {"naam": "pip cache", "pad": pad("Library", "Caches", "pip"), "soort": "leeg"},
        {"naam": "uv cache (unused)", "pad": pad(".cache", "uv"), "soort": "uv"},
        {"naam": "Homebrew downloads", "pad": pad("Library", "Caches", "Homebrew"), "soort": "brew"},
        {"naam": "Old app dmg's", "pad": os.path.join(t, "release", "bundle", "dmg"), "soort": "leeg",
         "niet_tijdens": ("rust",)},
    ]
    for profiel in ("debug", "release"):
        uit.append({"naam": f"Rust {profiel} incremental", "pad": os.path.join(t, profiel, "incremental"),
                    "soort": "weg", "niet_tijdens": ("rust",)})
    uit.append({"naam": "Rust debug build (3 days unused)", "pad": os.path.join(t, "debug"), "soort": "weg",
                "stil_s": 3 * DAG_S, "niet_tijdens": ("rust",)})
    return uit


def nood() -> dict:
    return {"naam": "Whole Rust target (disk above 93%)", "pad": tauri_target(), "soort": "weg",
            "niet_tijdens": ("rust",)}


def melden() -> tuple:
    """Alleen meten. Hier kan iets van Luka zelf in zitten."""
    return (
        ("Trash", pad(".Trash")),
        ("Downloads", pad("Downloads")),
        ("Ollama models", pad(".ollama", "models")),
        ("Docker", pad("Library", "Containers", "com.docker.docker")),
        ("iPhone backups", pad("Library", "Application Support", "MobileSync", "Backup")),
        ("Agent work checkouts", pad(".axe", "werk")),
        ("Xcode archives", pad("Library", "Developer", "Xcode", "Archives")),
        ("iOS device support", pad("Library", "Developer", "Xcode", "iOS DeviceSupport")),
    )


def grootste(n: int = 6, timeout: int = 600) -> list[tuple[str, int]]:
    """De grootste mappen direct onder ~ en ~/Library, alleen gemeten.

    29 okt: de eerste ronde op de iMac maakte 0,1 GB vrij bij 91,8%. Wat de schijf
    vult zijn dus geen caches maar iets van Luka zelf; zonder te zeggen wat, kan hij
    niet kiezen. ~/Library telt als zijn delen, niet als één blok.
    """
    def niveau(basis: str) -> list[tuple[str, int]]:
        if not os.path.isdir(basis):
            return []
        try:
            p = subprocess.run(["du", "-k", "-d", "1", basis], capture_output=True, text=True,
                               timeout=timeout, check=False)
        except (subprocess.TimeoutExpired, OSError):
            return []
        uit = []
        for regel in (p.stdout or "").splitlines():
            kb, _, map_ = regel.partition("\t")
            if map_ and os.path.normpath(map_) != os.path.normpath(basis) and kb.strip().isdigit():
                uit.append((map_, int(kb) * 1024))
        return uit
    bib = pad("Library")
    rijen = [r for r in niveau(HOME) if os.path.normpath(r[0]) != os.path.normpath(bib)] + niveau(bib)
    rijen.sort(key=lambda r: -r[1])
    return [("~" + m[len(HOME):] if m.startswith(HOME) else m, b) for m, b in rijen[:n]]


def voer_uit(stap: dict, droog: bool) -> tuple[int, str]:
    """(vrijgekomen bytes, reden als hij is overgeslagen)."""
    p = stap["pad"]
    if not os.path.exists(p):
        return 0, "absent"
    if stap.get("niet_tijdens") and draait(*stap["niet_tijdens"]):
        return 0, "in use"
    if stap.get("stil_s") and stil_sinds(p) < stap["stil_s"]:
        return 0, "recently used"
    voor = grootte(p)
    if droog:
        return voor, ""
    soort = stap["soort"]
    if soort == "leeg":
        leeg_map(p)
    elif soort == "weg":
        shutil.rmtree(p, ignore_errors=True)
    elif soort == "uv":
        uv = gereedschap("uv")
        if not uv:
            return 0, "no uv"
        subprocess.run([uv, "cache", "prune"], capture_output=True, timeout=600, check=False)
    elif soort == "brew":
        brew = gereedschap("brew")
        if not brew:
            return 0, "no brew"
        subprocess.run([brew, "cleanup", "--prune=7"], capture_output=True, timeout=900, check=False,
                       env={**os.environ, "HOMEBREW_NO_AUTO_UPDATE": "1"})
    return max(0, voor - grootte(p)), ""


def lees_staat() -> dict:
    try:
        with open(STAAT) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def schrijf_staat(staat: dict) -> None:
    os.makedirs(os.path.dirname(STAAT), exist_ok=True)
    with open(STAAT, "w") as fh:
        json.dump(staat, fh, indent=1)


def gb(n: int) -> str:
    return f"{n / 1e9:.1f} GB"


def meld(uit: dict) -> None:
    url = os.environ.get("SUPABASE_URL", "")
    sleutel = os.environ.get("SUPABASE_SERVICE_ROLE") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not sleutel or uit.get("droog"):
        return
    gedaan = ", ".join(f"{s['naam']} {gb(s['vrij'])}" for s in uit["gedaan"] if s["vrij"] >= 50e6) or "nothing large"
    groot = ", ".join(f"{n} {gb(b)}" for n, b in uit["groot"] if b >= 1e9)
    tekst = (f"{uit['machine']} cleanup: disk {uit['voor']['pct']}% -> {uit['na']['pct']}% used, "
             f"{gb(uit['vrij'])} freed ({gedaan}). {uit['na']['vrij_gb']} GB free.")
    if groot:
        tekst += f" Left alone, yours to decide: {groot}."
    grootst = ", ".join(f"{m} {gb(b)}" for m, b in uit.get("grootst") or [] if b >= 1e9)
    if grootst:
        tekst += f" Biggest folders: {grootst}."
    soort = "warning" if uit["na"]["pct"] >= VOL_PCT else "info"
    import urllib.request
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/core_notifications", method="POST",
        data=json.dumps({"type": soort, "message": tekst[:1900]}).encode(),
        headers={"apikey": sleutel, "Authorization": f"Bearer {sleutel}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:  # noqa: BLE001
        print(f"melding niet verstuurd: {e}", file=sys.stderr)


def nodig(staat: dict, nu: float, pct: float) -> bool:
    laatst = float(staat.get("laatst") or 0)
    return nu - laatst >= (VOL_S if pct >= VOL_PCT else DAG_S)


def ruim_op(droog: bool = False, forceer: bool = False, nu: float | None = None) -> dict | None:
    nu = time.time() if nu is None else nu
    if os.path.exists(UIT):
        return None
    voor = schijf()
    staat = lees_staat()
    if not forceer and not nodig(staat, nu, voor["pct"]):
        return None
    gedaan = []
    for stap in stappen():
        vrij, waarom = voer_uit(stap, droog)
        gedaan.append({"naam": stap["naam"], "vrij": vrij, **({"overgeslagen": waarom} if waarom else {})})
    logs = pad("Library", "Logs")
    if os.path.isdir(logs):
        vrij = sum(kort_log_in(os.path.join(logs, n), droog) for n in os.listdir(logs)
                   if n.startswith("axe") and n.endswith(".log"))
        gedaan.append({"naam": "AXE logs trimmed", "vrij": vrij})
    if not droog and schijf()["pct"] >= NOOD_PCT:
        stap = nood()
        vrij, waarom = voer_uit(stap, droog)
        gedaan.append({"naam": stap["naam"], "vrij": vrij, **({"overgeslagen": waarom} if waarom else {})})
    na = voor if droog else schijf()
    uit = {
        "machine": os.uname().nodename.split(".")[0],
        "droog": droog,
        "voor": voor,
        "na": na,
        "vrij": sum(s["vrij"] for s in gedaan),
        "gedaan": gedaan,
        "groot": sorted(((n, grootte(p, timeout=60)) for n, p in melden()), key=lambda x: -x[1]),
        "grootst": grootste(),
        "op": datetime.fromtimestamp(nu, timezone.utc).isoformat(),
    }
    if not droog:
        schrijf_staat({"laatst": nu, "uit": uit})
    meld(uit)
    return uit


def main(argv: list[str]) -> int:
    uit = ruim_op(droog="--droog" in argv, forceer="--nu" in argv or "--droog" in argv)
    if uit is None:
        return 0
    print(json.dumps(uit, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
