#!/usr/bin/env python3
"""Live smoketest van de OS3-kern tegen de ECHTE VPS.

Waarom dit bestaat: de unit-tests bewijzen dat de functies kloppen, niet dat de
VPS ze draait. Val 2 uit AGENTS.md -- code die bestaat is geen bewijs dat iemand
hem aanroept. Dit script zet vier onschuldige taken uit en kijkt wat er echt
gebeurt.

Wat het meet:
  T1  leest schijfruimte en uptime op de VPS                 (read-only)
  T2  vraagt de Mac mini welke app vooraan staat             (run_on_device)
  T3  wil systemctl draaien -> MOET om toestemming vragen    (en wordt geweigerd)
  T4  telt langzaam tot 40 -> wordt halverwege geannuleerd

En daarmee de vier dingen die W1/W2/W3 beloven:
  - T1, T2 en T4 worden binnen hetzelfde venster geclaimd (ze lopen dus PARALLEL,
    niet achter elkaar zoals voorheen)
  - T1 en T2 eindigen met een echte samenvatting
  - T2 heeft een kind-rij computer_use op de juiste Mac
  - T4 staat na het annuleren op cancelled en doet geen stap meer

Alleen de standaardbibliotheek, net als cli/axe. De sleutel wordt nooit geprint;
public_config in cli/axe_laag/run.py doet hetzelfde.

Draaien:  python3 scripts/os3_smoke.py
Klaar:    exit 0 = alles bewezen, exit 1 = iets faalde, exit 2 = geblokkeerd
          (bijvoorbeeld: de Mac mini-worker staat uit -- dat is GEEN pass)
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_API = "https://api.axecompanion.com"
MAC_MINI_DEVICE = "mac-mini-van-luka-5"
BRON = "os3_smoke"

# Hoe lang we maximaal op een taak wachten. T4 telt met sleep 5, dus die moet
# lang genoeg leven om halverwege geannuleerd te kunnen worden.
WACHT_MAX_S = 240
POLL_S = 3


# ── configuratie, in dezelfde volgorde als cli/axe_laag/run.py ───────────────

def laad_config() -> dict[str, Any]:
    bestand: dict[str, Any] = {}
    kandidaten = []
    if os.environ.get("AXE_CONFIG"):
        kandidaten.append(Path(os.environ["AXE_CONFIG"]))
    kandidaten += [
        Path.home() / ".config" / "axe" / "config.json",
        Path.home() / ".axe.json",
        Path.cwd() / ".axe.json",
    ]
    for p in kandidaten:
        if p.is_file():
            try:
                bestand = json.loads(p.read_text())
            except Exception:
                bestand = {}
            break

    def pak(env: str, sleutel: str, standaard: Any) -> Any:
        if os.environ.get(env):
            return os.environ[env]
        if bestand.get(sleutel):
            return bestand[sleutel]
        return standaard

    sleutel = str(pak("AXE_API_KEY", "apiKey", ""))

    # De CLI kijkt alleen naar AXE_API_KEY en de configbestanden, en die zijn op
    # deze Mac geen van beide gevuld. De sleutel staat er wél, op twee andere
    # plekken, en zonder deze twee regels zou dit script "GEBLOKKEERD" roepen
    # terwijl alles gewoon aanwezig is:
    #   ~/.axe/axe-api.key            -- wat de lokale API zelf leest
    #   AXE_CORE_API_KEY in de kluis  -- zie SLEUTELS.md en [[axe-key-vault]]
    if not sleutel:
        pad = Path.home() / ".axe" / "axe-api.key"
        if pad.is_file():
            sleutel = pad.read_text().strip()
    if not sleutel:
        sleutel = os.environ.get("AXE_CORE_API_KEY", "")
    if not sleutel:
        kluis = Path("/Volumes/EagetSSD/AXE-VAULT/secrets.env")
        if kluis.is_file():
            for regel in kluis.read_text().splitlines():
                if regel.startswith("AXE_CORE_API_KEY="):
                    sleutel = regel.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    return {
        "api_url": str(pak("AXE_API_URL", "apiUrl", DEFAULT_API)).rstrip("/"),
        "api_key": sleutel,
    }


# ── HTTP ─────────────────────────────────────────────────────────────────────

class ApiFout(Exception):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status
        self.body = body


def api(cfg: dict[str, Any], methode: str, pad: str, data: Any = None) -> Any:
    url = f"{cfg['api_url']}{pad}"
    lichaam = None if data is None else json.dumps(data).encode()
    verzoek = urllib.request.Request(url, data=lichaam, method=methode)
    verzoek.add_header("Content-Type", "application/json")
    if cfg["api_key"]:
        verzoek.add_header("Authorization", f"Bearer {cfg['api_key']}")
    try:
        with urllib.request.urlopen(verzoek, timeout=30) as antwoord:
            tekst = antwoord.read().decode()
            return json.loads(tekst) if tekst else None
    except urllib.error.HTTPError as e:
        raise ApiFout(e.code, e.read().decode(errors="replace")) from None


# ── taken ────────────────────────────────────────────────────────────────────

def maak_taak(cfg, titel: str, verzoek: str, *, device: str | None = None,
              execution_mode: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"agent": "apps"}
    if device:
        payload["device"] = device
    if execution_mode:
        payload["execution_mode"] = execution_mode
    lichaam = {
        "title": titel,
        "capability": "agentic",
        "request": verzoek,
        "payload": payload,
        "metadata": {"conversation_source": BRON, "device": device},
    }
    antwoord = api(cfg, "POST", "/tasks", lichaam)
    return antwoord["task"] if isinstance(antwoord, dict) and "task" in antwoord else antwoord


def haal_taak(cfg, taak_id: str) -> dict[str, Any]:
    antwoord = api(cfg, "GET", f"/tasks/{taak_id}")
    return antwoord["task"] if isinstance(antwoord, dict) and "task" in antwoord else antwoord


def haal_gebeurtenissen(cfg, taak_id: str) -> list[dict[str, Any]]:
    try:
        antwoord = api(cfg, "GET", f"/tasks/{taak_id}/events")
    except ApiFout:
        return []
    if isinstance(antwoord, dict):
        return antwoord.get("events") or []
    return antwoord or []


TERMINAAL = {"completed", "failed", "cancelled", "rejected", "verified"}


def wacht_tot(cfg, taak_id: str, voorwaarde, grens_s: int = WACHT_MAX_S):
    """Poll tot `voorwaarde(taak)` waar is of de tijd op is. Geeft de taak terug."""
    begin = time.time()
    taak = haal_taak(cfg, taak_id)
    while time.time() - begin < grens_s:
        if voorwaarde(taak):
            return taak
        time.sleep(POLL_S)
        taak = haal_taak(cfg, taak_id)
    return taak


# ── de vier proeven ──────────────────────────────────────────────────────────

def claim_moment(cfg, taak_id: str) -> float | None:
    """Wanneer een worker deze taak oppakte, uit het gebeurtenissenlogboek."""
    for g in haal_gebeurtenissen(cfg, taak_id):
        if g.get("event_type") == "task.claimed":
            t = g.get("created_at") or g.get("occurred_at")
            if t:
                try:
                    from datetime import datetime
                    return datetime.fromisoformat(str(t).replace("Z", "+00:00")).timestamp()
                except Exception:
                    return None
    return None


def main() -> int:
    cfg = laad_config()
    if not cfg["api_key"]:
        print("GEBLOKKEERD: AXE_API_KEY ontbreekt (env of configbestand). Zie os3/SETUP.md.")
        return 2

    print(f"API: {cfg['api_url']}   (sleutel: {'gezet' if cfg['api_key'] else 'ONTBREEKT'})")
    print("Vier onschuldige taken uitzetten...\n")

    fouten: list[str] = []
    geblokkeerd: list[str] = []
    verslag: list[tuple[str, str, str, str]] = []  # naam, id, status, duur

    t0 = time.time()
    try:
        t1 = maak_taak(cfg, "OS3 smoke: schijf en uptime",
                       "Report free disk space on / and uptime.",
                       execution_mode="read")
        t2 = maak_taak(cfg, "OS3 smoke: app vooraan op de Mac mini",
                       f"On Luka's Mac mini (device {MAC_MINI_DEVICE}), report which app is "
                       f"frontmost. Use run_on_device app.frontmost.",
                       device="mac-mini")
        t3 = maak_taak(cfg, "OS3 smoke: systemctl vraagt toestemming",
                       "Run systemctl status axe-core-api and report whether it is active.")
        t4 = maak_taak(cfg, "OS3 smoke: lang en annuleerbaar",
                       "Count from 1 to 40, running sleep 5; echo N for each number, then "
                       "report the total.")
    except ApiFout as e:
        print(f"GEBLOKKEERD: taken aanmaken lukte niet -- {e}")
        return 2

    ids = {"T1": t1["id"], "T2": t2["id"], "T3": t3["id"], "T4": t4["id"]}
    for naam, tid in ids.items():
        print(f"  {naam} = {tid}")
    print()

    # ── parallellisme: T1, T2 en T4 horen binnen ~10 s allemaal geclaimd te zijn.
    # Voor W1 draaiden ze achter elkaar; dan ligt de derde claim minuten later.
    print("Wachten tot de workers ze oppakken (parallellisme-meting)...")
    time.sleep(15)
    claims = {n: claim_moment(cfg, ids[n]) for n in ("T1", "T2", "T4")}
    bekend = {n: c for n, c in claims.items() if c}
    if len(bekend) < 2:
        geblokkeerd.append(
            "Kon het claim-moment van minder dan twee taken lezen -- /tasks/{id}/events gaf "
            "niets bruikbaars. Parallellisme NIET bewezen (ook niet weerlegd)."
        )
    else:
        spreiding = max(bekend.values()) - min(bekend.values())
        if spreiding > 10:
            fouten.append(
                f"Taken werden NIET tegelijk geclaimd: {spreiding:.0f}s tussen de eerste en de "
                f"laatste. Dat is het seriële gedrag dat W1 juist moest oplossen."
            )
        else:
            print(f"  parallel: alle claims binnen {spreiding:.1f}s\n")

    # ── T3: moet om toestemming vragen, en wij WEIGEREN. Nooit goedkeuren hier.
    print("T3: wachten op de toestemmingsvraag...")
    taak3 = wacht_tot(cfg, ids["T3"],
                      lambda t: t.get("status") in TERMINAAL or t.get("status") == "waiting_approval",
                      grens_s=120)
    if taak3.get("status") == "waiting_approval":
        try:
            openstaand = api(cfg, "GET", f"/tasks/{ids['T3']}/approvals") or {}
            lijst = openstaand.get("approvals") if isinstance(openstaand, dict) else openstaand
            wachtend = [a for a in (lijst or []) if a.get("status") == "pending"]
            if not wachtend:
                fouten.append("T3 stond op waiting_approval maar had geen openstaande approval.")
            else:
                aid = wachtend[0]["id"]
                api(cfg, "POST", f"/tasks/{ids['T3']}/approvals/{aid}/decision",
                    {"approved": False, "decided_by": BRON, "reason": "smoketest weigert altijd"})
                taak3 = wacht_tot(cfg, ids["T3"], lambda t: t.get("status") in TERMINAAL, grens_s=90)
                if taak3.get("status") != "rejected":
                    fouten.append(f"T3 eindigde op {taak3.get('status')}, verwacht was rejected.")
                else:
                    print("  T3: toestemming gevraagd, geweigerd, geen uitvoering. Goed.\n")
        except ApiFout as e:
            fouten.append(f"T3: beslissen over de approval lukte niet -- {e}")
    else:
        fouten.append(
            f"T3 vroeg GEEN toestemming (status {taak3.get('status')}). systemctl staat in "
            f"_NEEDS_APPROVAL, dus dit had moeten wachten."
        )

    # ── T4: halverwege annuleren, en daarna moet hij echt stil zijn.
    print("T4: wachten op twee voortgangsstappen, dan annuleren...")
    begin4 = time.time()
    stappen = 0
    while time.time() - begin4 < 120:
        stappen = sum(1 for g in haal_gebeurtenissen(cfg, ids["T4"])
                      if "progress" in str(g.get("event_type", "")))
        if stappen >= 2:
            break
        time.sleep(POLL_S)

    if stappen < 2:
        geblokkeerd.append("T4 kwam niet aan twee voortgangsstappen; annuleren niet getoetst.")
    else:
        try:
            api(cfg, "POST", f"/tasks/{ids['T4']}/cancel", {"reason": "smoketest"})
        except ApiFout as e:
            fouten.append(f"T4: /tasks/{{id}}/cancel faalde -- {e}")
        else:
            voor = sum(1 for g in haal_gebeurtenissen(cfg, ids["T4"])
                       if "progress" in str(g.get("event_type", "")))
            time.sleep(20)
            na = sum(1 for g in haal_gebeurtenissen(cfg, ids["T4"])
                     if "progress" in str(g.get("event_type", "")))
            taak4 = haal_taak(cfg, ids["T4"])
            # Eén stap speling: de lus mag de stap afmaken waar hij in zat.
            if na > voor + 1:
                fouten.append(f"T4 liep DOOR na het annuleren ({voor} -> {na} stappen).")
            if taak4.get("status") != "cancelled":
                fouten.append(f"T4 staat op {taak4.get('status')}, verwacht was cancelled.")
            if na <= voor + 1 and taak4.get("status") == "cancelled":
                print("  T4: gestopt en gestopt gebleven. Goed.\n")

    # ── T1 en T2: moeten gewoon af, met een echte samenvatting.
    print("T1 en T2: wachten tot ze klaar zijn...")
    taak1 = wacht_tot(cfg, ids["T1"], lambda t: t.get("status") in TERMINAAL)
    taak2 = wacht_tot(cfg, ids["T2"], lambda t: t.get("status") in TERMINAAL)

    for naam, taak in (("T1", taak1), ("T2", taak2)):
        samenvatting = ((taak.get("result") or {}).get("summary") or "").strip()
        if taak.get("status") not in ("completed", "verified"):
            fouten.append(f"{naam} eindigde op {taak.get('status')}, verwacht was completed.")
        elif not samenvatting:
            fouten.append(f"{naam} is klaar maar heeft een lege result.summary.")

    # T2 hoort een kind-rij op de Mac mini te hebben. Staat de worker daar uit,
    # dan is dat GEBLOKKEERD en geen pass -- anders vieren we iets dat niet draaide.
    try:
        kinderen = api(cfg, "GET", f"/tasks?parent_task_id={ids['T2']}") or {}
        rijen = kinderen.get("tasks") if isinstance(kinderen, dict) else kinderen
        op_mac = [r for r in (rijen or []) if r.get("target_device") == MAC_MINI_DEVICE]
        if not op_mac:
            geblokkeerd.append(
                f"T2 heeft geen kind-rij met target_device={MAC_MINI_DEVICE}. Draait de "
                f"computer-worker op de Mac mini wel? Dit telt NIET als geslaagd."
            )
        elif not any(r.get("status") in ("completed", "verified") for r in op_mac):
            geblokkeerd.append(
                f"De computer_use-rij op de Mac mini is niet afgerond "
                f"(status {[r.get('status') for r in op_mac]}). Worker offline of geen rechten?"
            )
        else:
            print("  T2: de Mac mini heeft het echt uitgevoerd. Goed.\n")
    except ApiFout as e:
        geblokkeerd.append(f"Kind-rijen van T2 niet op te vragen -- {e}")

    # ── verslag ──────────────────────────────────────────────────────────────
    for naam, tid in ids.items():
        taak = haal_taak(cfg, tid)
        verslag.append((naam, tid, str(taak.get("status")), ""))

    print("=" * 68)
    print(f"OS3 smoketest -- {time.time() - t0:.0f}s")
    print("=" * 68)
    for naam, tid, status, _ in verslag:
        print(f"  {naam}  {status:<18} {tid}")
    print()

    if geblokkeerd:
        print("GEBLOKKEERD (niet bewezen, niet afgekeurd):")
        for g in geblokkeerd:
            print(f"  - {g}")
        print()
    if fouten:
        print("GEFAALD:")
        for f in fouten:
            print(f"  - {f}")
        print()
        return 1
    if geblokkeerd:
        print("Geen fouten, maar niet alles kon bewezen worden. Zie hierboven.")
        return 2
    print("Alles bewezen.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAfgebroken.")
        sys.exit(130)
