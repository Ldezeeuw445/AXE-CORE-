"""Wat de Projects Manager elke pulse naloopt in de takenlijst.

## Waarom dit bestaat

Tot 8 november telde `run_projectsmgr` alleen rijen ("31 open rows, 0
unassigned") en zei dat elk kwartier tegen de baas. Die dag stond er:

* een DAX-bouwtaak al drie dagen in de wachtrij zonder dat een worker hem pakte;
* "PWA-manifest-scope corrigeren" zeven keer open, "Yes needed" voor dezelfde
  koperdeal drie keer, en de NorthSea-mailkaart twee keer bij Luka;
* zeventien voorstellen van de planner die al meer dan een maand stillagen.

Niets daarvan was te zien aan "31 open rows". Deze module kijkt naar wat er
echt stilstaat, en de manager ruimt op wat hij zelf mag opruimen.

## Grenzen

`beoordeel` is puur: rijen erin, bevindingen eruit. `dubbele_voorstellen`
wijst alleen `pending`-voorstellen aan (nog door niemand opgepakt), nooit iets
dat loopt, op Luka wacht of klaar is; de nieuwste van elke groep blijft.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

WACHTRIJ_VAST_NA = timedelta(hours=2)
ACTIEF_VAST_NA = timedelta(hours=2)
VOORSTEL_OUD_NA = timedelta(days=30)
LUKA_WACHT_LANG_NA = timedelta(days=1)
MAX_OPRUIMEN_PER_PULSE = 20

WACHTRIJ = ("queued", "retrying")
ACTIEF = ("planning", "running", "in_progress", "verifying")


@dataclass(frozen=True)
class Bevinding:
    code: str
    voor: str  # "luka" = hij moet iets doen; "info" = alleen in het overzicht
    titel: str
    detail: str


def _tijd(s: Any) -> datetime | None:
    if not isinstance(s, str) or not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _leeftijd(rij: dict[str, Any], nu: datetime) -> timedelta:
    t = _tijd(rij.get("updated_at")) or _tijd(rij.get("created_at"))
    return nu - t if t else timedelta(0)


def _duur(d: timedelta) -> str:
    if d >= timedelta(days=2):
        return f"{d.days} dagen"
    uren = int(d.total_seconds() // 3600)
    return f"{uren} uur" if uren >= 1 else f"{int(d.total_seconds() // 60)} minuten"


def _sleutel(rij: dict[str, Any]) -> tuple[str, str]:
    """Zelfde voorstel = zelfde eigenaar en zelfde titel, los van leestekens.

    "PWA‑manifest‑scope corrigeren in axe‑companion" (met een niet-brekend
    streepje) en "...in axe-companion" zijn hetzelfde werk.
    """
    titel = re.sub(r"[\W_]+", " ", str(rij.get("title") or "").lower()).strip()
    return str(rij.get("assignee") or ""), titel


def dubbele_voorstellen(rijen: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """De `pending`-rijen die een nieuwere tweeling hebben. Nieuwste blijft."""
    groepen: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for r in rijen:
        if r.get("status") == "pending" and _sleutel(r)[1]:
            groepen[_sleutel(r)].append(r)
    weg: list[dict[str, Any]] = []
    for groep in groepen.values():
        if len(groep) < 2:
            continue
        groep.sort(key=lambda r: str(r.get("updated_at") or r.get("created_at") or ""), reverse=True)
        weg += groep[1:]
    return weg


def _titels(rijen: list[dict[str, Any]], n: int = 3) -> str:
    return "; ".join(str(r.get("title") or "")[:70] for r in rijen[:n])


def beoordeel(rijen: list[dict[str, Any]], nu: datetime) -> list[Bevinding]:
    """Alle bevindingen, dringendste eerst. Puur: geen netwerk, geen klok."""
    uit: list[Bevinding] = []

    vast = sorted((r for r in rijen if r.get("status") in WACHTRIJ and _leeftijd(r, nu) >= WACHTRIJ_VAST_NA),
                  key=lambda r: _leeftijd(r, nu), reverse=True)
    if vast:
        oudste = vast[0]
        uit.append(Bevinding(
            # Vaste titel: _vraag_luka ontdubbelt op titel, een getal erin
            # zou bij elke nieuwe telling een tweede kaart geven.
            "wachtrij_vast", "luka", "Taken staan vast in de wachtrij",
            f"{len(vast)} in de wachtrij. Oudste: \"{str(oudste.get('title') or '')[:80]}\" ({oudste.get('assignee') or 'zonder eigenaar'}) "
            f"wacht al {_duur(_leeftijd(oudste, nu))}; geen worker pakt hem op.",
        ))

    hangt = sorted((r for r in rijen if r.get("status") in ACTIEF and _leeftijd(r, nu) >= ACTIEF_VAST_NA),
                   key=lambda r: _leeftijd(r, nu), reverse=True)
    if hangt:
        uit.append(Bevinding(
            "actief_vast", "luka", "Taken hangen halverwege",
            f"{len(hangt)} zonder beweging, de oudste al {_duur(_leeftijd(hangt[0], nu))}: {_titels(hangt)}.",
        ))

    dubbel = dubbele_voorstellen(rijen)
    if dubbel:
        uit.append(Bevinding(
            "dubbel", "info", f"{len(dubbel)} dubbele voorstellen",
            f"Zelfde werk meer dan eens open: {_titels(dubbel)}.",
        ))

    wacht = [r for r in rijen if r.get("status") == "waiting_approval" and _leeftijd(r, nu) >= LUKA_WACHT_LANG_NA]
    if wacht:
        uit.append(Bevinding(
            "wacht_op_luka", "info", f"{len(wacht)} wachten al meer dan een dag op jouw ja",
            _titels(wacht) + ".",
        ))

    oud = [r for r in rijen if r.get("status") == "pending" and _leeftijd(r, nu) >= VOORSTEL_OUD_NA]
    if oud:
        uit.append(Bevinding(
            "oude_voorstellen", "info", f"{len(oud)} voorstellen liggen al meer dan een maand stil",
            "Niemand pakt ze op; schrappen of inplannen. Eerst: " + _titels(oud) + ".",
        ))

    return sorted(uit, key=lambda b: 0 if b.voor == "luka" else 1)
