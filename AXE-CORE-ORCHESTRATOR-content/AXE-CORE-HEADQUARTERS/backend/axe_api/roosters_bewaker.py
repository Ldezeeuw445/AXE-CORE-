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
