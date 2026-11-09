"""Wat de AXE CORE Manager (de baas) elke pulse naloopt over de andere managers.

## Waarom dit bestaat

Tot 9 november stuurde `run_axemanager` elke 10 minuten vijf berichten
"Pulse 07:20 UTC. Rapporteer blokkades; stuur niets" -- 720 per dag in het
managersgesprek dat Luka leest -- en keek verder nergens naar. Intussen:

* stond de vraag "NorthSea: er komt geen mail meer binnen" sinds 6 nov open,
  terwijl de northseamgr het allang niet meer meldde en er weer mail binnenkwam;
* zou niemand het merken als een manager zelf stil kwam te liggen.

## Grenzen

`beoordeel` en `opgeloste_vragen` zijn puur. De baas sluit alleen een
manager-vraag (kind manager_ask) die de manager die hem stelde zelf niet meer
meldt, in een rapport dat NA de vraag geschreven is. Een vraag over geld,
verzenden, deals of goedkeuringen raakt hij nooit aan: dat zijn geen
manager_ask-kaarten.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

STIL_NA = timedelta(minutes=60)      # een manager-pulse zo lang niet gedraaid = stil
FALEND_NA = 3
OPLOS_WACHT = timedelta(hours=1)     # een vraag is minstens zo oud voor hij dicht mag


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


def _norm(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def opgeloste_vragen(vragen: list[dict[str, Any]], rapporten: dict[str, dict[str, Any]],
                     nu: datetime) -> list[dict[str, Any]]:
    """Open manager-vragen die de vragende manager zelf niet meer meldt.

    `rapporten`: per manager zijn nieuwste rapport ({body, created_at}).
    """
    uit = []
    for v in vragen:
        if v.get("status") != "pending" or v.get("kind") != "manager_ask":
            continue
        gesteld = _tijd(v.get("created_at"))
        if not gesteld or nu - gesteld < OPLOS_WACHT:
            continue
        r = rapporten.get(str(v.get("requested_by") or ""))
        if not r:
            continue
        gemeld = _tijd(r.get("created_at"))
        if not gemeld or gemeld <= gesteld + OPLOS_WACHT:
            continue  # alleen een rapport dat ruim NA de vraag kwam telt
        if _norm(v.get("title")) and _norm(v.get("title")) not in _norm(r.get("body")):
            uit.append(v)
    return uit


def beoordeel(roosters: list[dict[str, Any]], managers: tuple[str, ...], nu: datetime) -> list[Bevinding]:
    """Liggen de manager-pulses zelf stil of falen ze? Dringendste eerst."""
    per = {str(r.get("job_key") or ""): r for r in roosters}
    stil, falend, weg = [], [], []
    for m in managers:
        r = per.get(f"axe_core:staande-{m}")
        if not r or not r.get("enabled"):
            weg.append(m)
            continue
        laatst = _tijd(r.get("last_run_at"))
        if not laatst or nu - laatst > STIL_NA:
            stil.append(f"{m} (laatst {laatst.strftime('%d-%m %H:%M') + ' UTC' if laatst else 'nooit'})")
        try:
            fouten = int(r.get("consecutive_failures") or 0)
        except (TypeError, ValueError):
            fouten = 0
        if fouten >= FALEND_NA:
            falend.append(f"{m}: {fouten}x")
    uit: list[Bevinding] = []
    if stil or weg:
        uit.append(Bevinding(
            # Vaste titel: _vraag_luka ontdubbelt op titel.
            "manager_stil", "luka", "Een manager draait niet meer",
            "; ".join(stil + [f"{m} (staat uit of ontbreekt)" for m in weg]) + ".",
        ))
    if falend:
        uit.append(Bevinding("manager_faalt", "luka", "Een manager faalt achter elkaar", "; ".join(falend) + "."))
    return uit
