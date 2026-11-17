"""Wat de Companion Manager elke pulse naloopt in de vaste jobs (core_schedules).

## Waarom dit bestaat

Tot 8 november zei `run_companionmgr` elk kwartier "jobs 21, failing 1". Die
ochtend stond er:

* de NorthSea Communication Engine 12 keer achter elkaar op HTTP 502 en de
  Deal & Operations Crews 10 keer: een databasestoring van een uur, maar door
  de terugval van de planner (tot 6 uur rust) lag de motor tot 14:13 stil,
  ook toen de database al lang weer antwoordde;
* de DAX-wacht 6 keer mislukt, waardoor geen enkele DAX-bot werkte;
* de Review Desk 15 keer overgeslagen omdat hij op Luka's koppeling wacht.

"failing 1" telde alleen de axe_core-jobs en zei niets over wat er stilstond.

## Grenzen

`beoordeel` is puur. `herkansen` wijst alleen jobs aan die aan staan, na een
TIJDELIJKE fout (HTTP 5xx-gateway of time-out) in lange rust liggen, en die
het afgelopen uur niet al vroeg herkanst zijn. De job zelf blijft precies
wat hij was: dezelfde code, dezelfde grenzen (NorthSea verstuurt nog steeds
niets zonder goedkeuring). De manager haalt alleen de wachttijd naar voren.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from geheimen import verberg_geheimen

FALEND_NA = 3          # zoveel keer achter elkaar mislukt = een melding waard
LUKA_NA = 6            # en vanaf hier moet Luka het weten
ACHTER_NA = timedelta(minutes=30)   # next_run_at zo ver voorbij en niemand pakt hem
LANGE_RUST = timedelta(minutes=45)  # verder weg dan dit na een fout = terugval-rust
# Niet precies een uur: de manager pulst elke 20 minuten, en 8 nov om 18:40
# zat er 59:59.9 tussen (de herkans van 17:40:02 telde vanaf de schrijftijd),
# zodat de Engine een hele pulse langer stillag. 50 min = elk derde pulse.
HERKANS_ELKE = timedelta(minutes=50)

_TIJDELIJK = re.compile(r'"http"\s*:\s*50[234]\b|\btime ?out\b|timed out|upstream_error|ReadTimeout', re.I)


# Overgeslagen omdat hij aan het inhalen was -- niet omdat hij op Luka wacht.
_INHAAL = re.compile(r"time budget|still running|already running", re.I)


@dataclass(frozen=True)
class Bevinding:
    code: str
    voor: str  # "luka" of "info"
    titel: str
    detail: str


def _tijd(s: Any) -> datetime | None:
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    if not isinstance(s, str) or not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _fouten(r: dict[str, Any]) -> int:
    try:
        return int(r.get("consecutive_failures") or 0)
    except (TypeError, ValueError):
        return 0


def _naam(r: dict[str, Any]) -> str:
    return str(r.get("name") or r.get("job_key") or "?")[:60]


def _reden(r: dict[str, Any]) -> str:
    """Waarom faalde een shell-job? De laatste regel van zijn uitvoer, zonder sleutels.

    Alleen voor `exec`-jobs (`exit=<code>` + regeleinde + uitvoer). Tot 16 nov stond daar voor de Trading Team-cyclus
    alleen "exit=1"; sinds die dag zet het script er een geschoonde staart in. Dit blijft kort
    omdat het in een melding aan Luka komt.
    """
    tekst = str(r.get("last_result") or "")
    if not tekst.startswith("exit="):
        return ""
    regels = [ln.strip() for ln in tekst.splitlines()[1:] if ln.strip()]
    if not regels:
        return ""
    return " ".join(verberg_geheimen(regels[-1]).split())[:140]


def tijdelijk(r: dict[str, Any]) -> bool:
    """Was de laatste fout iets dat vanzelf overgaat (gateway, time-out)?"""
    return r.get("last_status") in ("fail", "timeout") and (
        r.get("last_status") == "timeout" or bool(_TIJDELIJK.search(str(r.get("last_result") or "")))
    )


def herkansen(rijen: list[dict[str, Any]], nu: datetime) -> list[dict[str, Any]]:
    """Jobs die na een tijdelijke fout in lange rust liggen: nu één keer opnieuw."""
    uit = []
    for r in rijen:
        # Ook: overgeslagen (tijdbudget op) met een oude foutenteller. Die kreeg
        # tot 8 nov ten onrechte de terugval-rust van die teller (planning.py).
        verkeerde_rust = (r.get("last_status") == "skipped" and _fouten(r) > 0
                          and bool(_INHAAL.search(str(r.get("last_result") or ""))))
        if not r.get("enabled") or not (tijdelijk(r) or verkeerde_rust):
            continue
        volgende = _tijd(r.get("next_run_at"))
        if not volgende or volgende - nu < LANGE_RUST:
            continue
        if r.get("lease_owner") and (_tijd(r.get("lease_until")) or nu) > nu:
            continue  # loopt nu
        vorige = _tijd(((r.get("metadata") or {}).get("vroeg_herkanst_op")))
        if vorige and nu - vorige < HERKANS_ELKE:
            continue
        uit.append(r)
    return uit


def beoordeel(rijen: list[dict[str, Any]], nu: datetime) -> list[Bevinding]:
    """Alle bevindingen, dringendste eerst. Puur: geen netwerk, geen klok."""
    aan = [r for r in rijen if r.get("enabled")]
    uit: list[Bevinding] = []

    falend = sorted((r for r in aan if r.get("last_status") in ("fail", "timeout") and _fouten(r) >= FALEND_NA),
                    key=_fouten, reverse=True)
    ernstig = [r for r in falend if _fouten(r) >= LUKA_NA]
    if ernstig:
        uit.append(Bevinding(
            # Vaste titel: _vraag_luka ontdubbelt op titel.
            "jobs_falen", "luka", "Vaste jobs falen achter elkaar",
            "; ".join(f"{_naam(r)}: {_fouten(r)}x" + (" (tijdelijke fout, ik herkans)" if tijdelijk(r) else "")
                      + (f" — {_reden(r)}" if _reden(r) else "")
                      for r in ernstig[:5]) + ".",
        ))
    licht = [r for r in falend if _fouten(r) < LUKA_NA]
    if licht:
        uit.append(Bevinding("jobs_haperen", "info", f"{len(licht)} jobs haperen",
                             "; ".join(f"{_naam(r)}: {_fouten(r)}x" for r in licht[:5]) + "."))

    achter = [r for r in aan
              if (_tijd(r.get("next_run_at")) or nu) < nu - ACHTER_NA
              and not (r.get("lease_owner") and (_tijd(r.get("lease_until")) or nu) > nu)]
    if achter:
        uit.append(Bevinding(
            "jobs_achter", "luka", "Vaste jobs worden niet opgepakt",
            f"{len(achter)} hadden al moeten draaien: "
            + "; ".join(f"{_naam(r)} (sinds {_tijd(r.get('next_run_at')).strftime('%d-%m %H:%M')} UTC)" for r in achter[:5])
            + ". De planner pakt ze niet op.",
        ))

    wacht = [r for r in aan if r.get("last_status") == "skipped" and "autorisatie" in str(r.get("last_result") or "").lower()]
    if wacht:
        uit.append(Bevinding("wacht_op_koppeling", "info", f"{len(wacht)} jobs wachten op een koppeling van jou",
                             "; ".join(_naam(r) for r in wacht[:5]) + "."))

    return sorted(uit, key=lambda b: 0 if b.voor == "luka" else 1)


# ── Trading Team: geen koersdata en een stille runner (17 nov 2026) ──────────
# Twee gaten die "Vaste jobs falen achter elkaar" niet dekt:
#
# * NO-DATA: zonder koersdata eindigt de cyclus als `completed` met exit 0, dus
#   de job staat op "ok" en telt nergens als fout. Hij analyseert en handelt
#   dan niets, ook niet als dat dagen zo blijft. De uitkomst staat wel per run
#   in core_trading_team_runs.verdict ("NO-DATA", decision.ts); die tellen we.
# * Stil: de job staat aan maar draait niet meer (Mac-uitvoerder weg, de
#   planner pakt hem niet). Bij 15 minuten rooster is 45 min = drie gemiste runs.
#
# Wat al bestond en hier dus NIET dubbel komt: falen in terugval-rust. De 5e
# mislukking op rij geeft al een error-melding (main._meld_run, planning.MAX_FAILS)
# en vanaf 6x komt "Vaste jobs falen achter elkaar" met de reden (PR #314).
# Een job met zoveel fouten ligt bewust stil; dat is geen stille runner.
#
# Zelfde regel als worker_wacht (Mac offline / DAX geblokkeerd / VPS-wacht):
# één warning op Home en telefoon, niet opnieuw zolang de vorige ongelezen is (24 u).

TRADING_JOB = "axe_core:trading-team-test-15m-mac"
NO_DATA_NA = 3                          # zoveel runs achter elkaar zonder koersdata
NO_DATA_VERS = timedelta(hours=2)       # oudere reeks = runner ligt stil, dat meldt de hartslag
TRADING_STIL_NA = timedelta(minutes=45)  # rooster elke 15 min: drie gemiste runs
TRADING_AFGEVOERD_NA = timedelta(days=7)
FAALT_AL_GEMELD_VANAF = 5               # = planning.MAX_FAILS: vanaf hier melden _meld_run en jobs_falen al
NO_DATA_KOP = "Trading geen koersdata"
TRADING_KOP = "Trading runner stil/faalt"


def _lokaal(t: datetime | None) -> str:
    if t is None:
        return "?"
    try:
        from zoneinfo import ZoneInfo
        return t.astimezone(ZoneInfo("Europe/Amsterdam")).strftime("%d-%m %H:%M")
    except Exception:  # noqa: BLE001
        return t.strftime("%d-%m %H:%M") + " UTC"


def no_data_reeks(runs: list[dict[str, Any]]) -> int:
    """Hoeveel afgeronde runs, nieuwste eerst, achter elkaar NO-DATA gaven. Puur.

    Een run die nog loopt (status running, nog geen verdict) telt niet mee en
    breekt de reeks niet; elke andere uitkomst (ook BLOCKED of een fout) wel."""
    n = 0
    for r in runs:
        if r.get("status") == "running" and not r.get("verdict"):
            continue
        if str(r.get("verdict") or "").upper() != "NO-DATA":
            break
        n += 1
    return n


def _no_data_code(run: dict[str, Any]) -> str:
    notes = ((run.get("decision") or {}) if isinstance(run.get("decision"), dict) else {}).get("notes") or []
    codes = [str(x) for x in notes if isinstance(x, str) and x != "no_data"]
    return " ".join(verberg_geheimen(codes[0]).split())[:80] if codes else ""


def trading_stil(schema: dict[str, Any] | None, nu: datetime) -> str | None:
    """De reden waarom de trading-runner stil is, of None. Puur.

    None als de job uit staat, nu loopt, nog nooit draaide, al een week weg is,
    of al in terugval-rust ligt na >= FAALT_AL_GEMELD_VANAF fouten (dat is gemeld)."""
    if not schema or not schema.get("enabled"):
        return None
    if schema.get("lease_owner") and (_tijd(schema.get("lease_until")) or nu) > nu:
        return None
    if _fouten(schema) >= FAALT_AL_GEMELD_VANAF:
        return None
    laatst = _tijd(schema.get("last_run_at"))
    if laatst is None:
        return None
    stil = nu - laatst
    if not (TRADING_STIL_NA < stil <= TRADING_AFGEVOERD_NA):
        return None
    status = schema.get("last_status") or "?"
    fouten = _fouten(schema)
    volgende = _tijd(schema.get("next_run_at"))
    reden = (f"Trading Team draaide niet meer sinds {_lokaal(laatst)} ({int(stil.total_seconds()) // 60} min); "
             f"laatste status {status}" + (f", {fouten}x mislukt op rij" if fouten else ""))
    if volgende is not None:
        reden += (f", gepland voor {_lokaal(volgende)} maar niet opgepakt" if volgende < nu
                  else f", volgende run {_lokaal(volgende)}")
    if _reden(schema):
        reden += f" — {_reden(schema)}"
    return reden + ". Check of de Mac-uitvoerder draait (launchctl list | grep -i axe)."


def trading_ronde(db: Any, rijen: list[dict[str, Any]], nu: datetime) -> dict[str, Any]:
    """Eén controle in de Companion Manager-pulse. Hooguit twee warnings; slikt fouten."""
    from goedkeuring_melding import LUKA_USER_ID
    from worker_wacht import _al_gemeld

    schema = next((r for r in rijen if r.get("job_key") == TRADING_JOB), None)
    if not schema or not schema.get("enabled"):
        return {"enabled": False, "no_data": 0, "notified": []}
    gemeld: list[str] = []

    def _meld(voor: str, tekst: str, code: str) -> None:
        if _al_gemeld(db, {}, nu, voor):
            return
        try:
            db.table("core_notifications").insert({
                "recipient": LUKA_USER_ID, "type": "warning", "message": f"{voor}{tekst}"[:1900],
            }).execute()
            gemeld.append(code)
        except Exception:  # noqa: BLE001
            pass

    uit_fout = ""
    try:
        runs = (db.table("core_trading_team_runs").select("created_at,status,verdict,decision")
                .eq("mode", "test").order("created_at", desc=True).limit(10).execute().data) or []
    except Exception as exc:  # noqa: BLE001 — de hartslag hieronder moet nog steeds kunnen
        runs, uit_fout = [], str(exc)[:200]
    reeks = no_data_reeks(runs)
    nieuwste = next((r for r in runs if str(r.get("verdict") or "").upper() == "NO-DATA"), None)
    vers = nieuwste is not None and (nu - (_tijd(nieuwste.get("created_at")) or nu - NO_DATA_VERS * 2)) <= NO_DATA_VERS
    if reeks >= NO_DATA_NA and vers:
        code = _no_data_code(nieuwste)
        _meld(f"{NO_DATA_KOP}: ",
              f"de laatste {reeks} Trading Team-runs hadden geen koersdata (NO-DATA"
              + (f", {code}" if code else "") + f", laatste {_lokaal(_tijd(nieuwste.get('created_at')))}). "
              "De job staat op ok, maar er is niets geanalyseerd en niets gehandeld. "
              "Check de databronnen (EODHD/MetaAPI-koersen).", "no_data")

    stil = trading_stil(schema, nu)
    if stil:
        _meld(f"{TRADING_KOP}: ", stil, "stil")
    uit: dict[str, Any] = {"enabled": True, "no_data": reeks, "stil": bool(stil), "notified": gemeld}
    if uit_fout:
        uit["error"] = uit_fout
    return uit
