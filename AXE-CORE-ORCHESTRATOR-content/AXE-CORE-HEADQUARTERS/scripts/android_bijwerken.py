#!/usr/bin/env python3
"""android_bijwerken — de Device Manager op de telefoon bijwerken zodra hij aan deze Mac hangt.

Waarom (30 okt 2026): op de A17 stond een bundel van 4422452, een Cursor-branch
die al weg is. Er kwam niets nieuws vanzelf: de Android-CI start niet, en het
handwerk (clonen, bouwen, adb install) deed niemand. Een poging om het commando
op afstand in Terminal te typen landde in het verkeerde venster. Dit script doet
het zelf, vanuit axe-autosync, op de Mac waar de telefoon aan de kabel hangt.

Wanneer: er hangt een toestel aan adb dat USB-foutopsporing toestaat, de laatste
installatie van hier is niet van deze commit, deze commit is hier nog niet
mislukt, en Luka raakt de Mac al 5 minuten niet aan (of AXE_NU=1). Na een
geslaagde installatie hooguit eens per 6 uur een nieuwe.

Wat nooit gebeurt: de app verwijderen. Hij is het vergrendelscherm (Device Owner);
`adb install -r` of niets. Weigert de telefoon de nieuwe handtekening, dan blijft
de oude staan en komt er één melding.

Eén core_notifications-melding per uitkomst, en dezelfde fout niet twee keer.
Uit: touch ~/.axe/android-uit. Log: ~/Library/Logs/axe-android.log (via autosync).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
HQ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAAT = os.path.join(HOME, ".axe", "android.json")
UIT = os.path.join(HOME, ".axe", "android-uit")
REPO = os.environ.get("AXE_ANDROID_REPO") or os.path.join(HOME, "axe-core-android")
REMOTE = "https://github.com/Ldezeeuw445/axe-core-android"
PAKKET = "com.axecore.core"
STIL_S = 300
WACHT_S = 6 * 3600


def sdk() -> str:
    return os.environ.get("ANDROID_HOME") or os.path.join(HOME, "Library", "Android", "sdk")


def vind_adb(which=shutil.which) -> str | None:
    # build-web.sh installeert met dit pad; een adb elders zonder SDK kan niet bouwen.
    eigen = os.path.join(sdk(), "platform-tools", "adb")
    if os.path.exists(eigen):
        return eigen
    return which("adb")


def toestellen(uitvoer: str) -> tuple[list[str], list[str]]:
    """`adb devices` -> (klaar, nog-niet-toegestaan)."""
    klaar, geweigerd = [], []
    for regel in uitvoer.splitlines()[1:]:
        delen = regel.split()
        if len(delen) < 2:
            continue
        if delen[1] == "device":
            klaar.append(delen[0])
        elif delen[1] in ("unauthorized", "no-permissions"):
            geweigerd.append(delen[0])
    return klaar, geweigerd


def java_home() -> str | None:
    for kandidaat in (os.environ.get("JAVA_HOME"),
                      "/Applications/Android Studio.app/Contents/jbr/Contents/Home"):
        if kandidaat and os.path.exists(os.path.join(kandidaat, "bin", "java")):
            return kandidaat
    try:
        p = subprocess.run(["/usr/libexec/java_home"], capture_output=True, text=True, timeout=10, check=False)
        pad = p.stdout.strip()
        if p.returncode == 0 and pad and os.path.exists(os.path.join(pad, "bin", "java")):
            return pad
    except (OSError, subprocess.SubprocessError):
        pass
    return None


def stil_s() -> int:
    try:
        uit = subprocess.run(["ioreg", "-c", "IOHIDSystem"], capture_output=True, text=True, timeout=10, check=False).stdout
    except (OSError, subprocess.SubprocessError):
        return 0
    m = re.search(r'"HIDIdleTime" = (\d+)', uit)
    return int(m.group(1)) // 1_000_000_000 if m else 0


def besluit(staat: dict, commit: str, nu: float, stil: int, forceren: bool) -> tuple[bool, str]:
    if staat.get("geinstalleerd") == commit:
        return False, "phone already has this commit"
    if staat.get("mislukt") == commit:
        return False, "this commit already failed here"
    if not forceren and stil < STIL_S:
        return False, "Luka is using this Mac"
    if not forceren and staat.get("geinstalleerd") and nu - float(staat.get("laatst") or 0) < WACHT_S:
        return False, "updated less than 6 hours ago"
    return True, ""


def oorzaak(staart: str) -> str:
    """De bouwuitvoer in één zin die zegt wat er moet gebeuren."""
    if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in staart or "signatures do not match" in staart.lower():
        return ("the phone has the app signed with another key, so it refused the update. "
                "The old app was NOT removed (it is the lock screen). Ask Claude to sign with the phone's key.")
    if "SDK location not found" in staart or "ANDROID_HOME" in staart:
        return "the Android SDK is missing on this Mac (install Android Studio once)."
    if "Unable to locate a Java Runtime" in staart or "JAVA_HOME" in staart:
        return "no Java on this Mac (install Android Studio once; it brings its own)."
    if "no devices" in staart or "device offline" in staart or "unauthorized" in staart:
        return "the phone was not reachable over USB at install time (cable, or allow USB debugging)."
    regels = [r.strip() for r in staart.splitlines() if r.strip()]
    return (regels[-1] if regels else "no output")[:240]


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


def meld(staat: dict, soort: str, tekst: str) -> None:
    """Eén melding; dezelfde tekst niet nog eens."""
    if staat.get("gemeld") == tekst:
        return
    url = os.environ.get("SUPABASE_URL", "")
    sleutel = os.environ.get("SUPABASE_SERVICE_ROLE") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    print(tekst)
    if not url or not sleutel:
        return
    import urllib.request
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/core_notifications", method="POST",
        data=json.dumps({"type": soort, "message": tekst[:1900]}).encode(),
        headers={"apikey": sleutel, "Authorization": f"Bearer {sleutel}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        urllib.request.urlopen(req, timeout=15).read()
        staat["gemeld"] = tekst
    except Exception as e:  # noqa: BLE001
        print(f"melding niet verstuurd: {e}", file=sys.stderr)


def draai(args: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, check=False, **kw)


def machine() -> str:
    try:
        uit = draai(["scutil", "--get", "LocalHostName"], timeout=5).stdout.strip()
        if uit:
            return uit
    except (OSError, subprocess.SubprocessError):
        pass
    return socket.gethostname().split(".")[0]


def werk_bij(nu: float | None = None, forceren: bool | None = None) -> str:
    """Geeft terug wat er gebeurde, in een paar woorden (voor het log en de tests)."""
    nu = time.time() if nu is None else nu
    forceren = os.environ.get("AXE_NU") == "1" if forceren is None else forceren
    if os.path.exists(UIT):
        return "off"
    adb = vind_adb()
    if not adb:
        return "no adb on this Mac"
    try:
        klaar, geweigerd = toestellen(draai([adb, "devices"], timeout=15).stdout)
    except (OSError, subprocess.SubprocessError):
        return "adb did not answer"
    staat = lees_staat()
    host = machine()
    if not klaar:
        if geweigerd:
            meld(staat, "warning", f"A phone is connected to {host}, but USB debugging is not allowed yet. "
                 "Tap Allow on the phone (and 'Always allow from this computer'); AXE then updates it by itself.")
            schrijf_staat(staat)
            return "phone not authorized"
        return "no phone"

    commit = draai(["git", "-C", HQ, "rev-parse", "--short", "HEAD"], timeout=15).stdout.strip()
    if not commit:
        return "no commit"
    doen, waarom = besluit(staat, commit, nu, stil_s(), forceren)
    if not doen:
        return waarom

    jdk = java_home()
    if not jdk or not os.path.isdir(sdk()):
        staat["mislukt"] = commit
        meld(staat, "warning", f"Android Device Manager update on {host} waits: this Mac needs Android Studio "
             "(JDK + SDK) once to build the phone app. After that it updates by itself whenever the phone is plugged in.")
        schrijf_staat(staat)
        return "no Android Studio"

    if os.path.isdir(os.path.join(REPO, ".git")):
        bron = draai(["git", "-C", REPO, "pull", "-q", "--ff-only"], timeout=180)
    else:
        bron = draai(["git", "clone", "-q", REMOTE, REPO], timeout=600)
    if bron.returncode != 0:
        staat["mislukt"] = commit
        meld(staat, "warning", f"Android update on {host} could not fetch axe-core-android: {oorzaak(bron.stderr)}")
        schrijf_staat(staat)
        return "fetch failed"

    serieel = klaar[0]
    env = {**os.environ, "AXE_HQ": HQ, "JAVA_HOME": jdk, "ANDROID_HOME": sdk(), "ANDROID_SERIAL": serieel,
           "PATH": os.path.join(sdk(), "platform-tools") + os.pathsep + os.environ.get("PATH", "")}
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  building the phone app from {commit} for {serieel}")
    try:
        bouw = draai(["nice", "-n", "19", "bash", "build-web.sh", "--apk"], cwd=REPO, env=env, timeout=3600)
    except subprocess.TimeoutExpired:
        bouw = subprocess.CompletedProcess([], 124, "", "build took longer than an hour")
    print((bouw.stdout or "")[-4000:])
    print((bouw.stderr or "")[-2000:], file=sys.stderr)
    if bouw.returncode != 0:
        staat["mislukt"] = commit
        meld(staat, "warning", f"Android Device Manager update to {commit} on {host} failed: "
             f"{oorzaak((bouw.stdout or '')[-3000:] + (bouw.stderr or '')[-3000:])}")
        schrijf_staat(staat)
        return "build failed"

    draai([adb, "-s", serieel, "shell", "monkey", "-p", PAKKET, "-c", "android.intent.category.LAUNCHER", "1"], timeout=30)
    staat.update({"geinstalleerd": commit, "laatst": nu, "mislukt": None, "toestel": serieel})
    meld(staat, "success", f"Android Device Manager on the phone updated to {commit} (built on {host}).")
    schrijf_staat(staat)
    return "updated"


if __name__ == "__main__":
    print(f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {werk_bij()}")
