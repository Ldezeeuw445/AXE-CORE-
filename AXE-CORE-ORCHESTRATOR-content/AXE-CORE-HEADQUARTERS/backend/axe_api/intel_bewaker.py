"""Wat de Trading OS Manager elke pulse naloopt: hoe vers zijn de marktfeeds.

## Waarom dit bestaat

Tot 8 november zei `run_tradingos` elk kwartier "bias=bearish. orders=0" en
de Intel-watch hetzelfde. Die bias kwam van 7 juni: de query sorteerde niet en
pakte zomaar drie rijen. De nieuwste meting was van 31 augustus, en elke feed
in intel_sync_log (Finnhub, SEC, ADS-B, AIS, EIA, ...) stond sinds 14 augustus
stil. Wie het managersgesprek las, dacht dat er een actueel signaal was.

## Grenzen

Puur en alleen lezen. Trading OS draait niet live; een stilgevallen feed is
dus iets voor het dagoverzicht, geen kaart die Luka nu moet beantwoorden.
Nooit een order, nooit een advies: de manager zegt alleen hoe oud de data is.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

FEED_STIL_NA = timedelta(hours=24)
SIGNAAL_OUD_NA = timedelta(hours=24)
NOOIT = datetime(2001, 1, 1, tzinfo=timezone.utc)  # 2000-01-01 = placeholder "nooit gedraaid"


@dataclass(frozen=True)
class Bevinding:
    code: str
    voor: str
    titel: str
    detail: str


def _tijd(s: Any) -> datetime | None:
    if not isinstance(s, str) or not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _dagen(d: timedelta) -> str:
    return f"{d.days} dagen" if d.days >= 2 else f"{int(d.total_seconds() // 3600)} uur"


def signaal(tide: dict[str, Any] | None, nu: datetime) -> dict[str, Any]:
    """De nieuwste bias met haar leeftijd; oud = niet als actueel melden."""
    t = _tijd((tide or {}).get("snapshot_time"))
    oud = t is None or nu - t >= SIGNAAL_OUD_NA
    return {"bias": None if oud else (tide or {}).get("bias"), "at": t.isoformat() if t else None,
            "laatst_gezien": (tide or {}).get("bias"), "vers": not oud}


def beoordeel(feeds: list[dict[str, Any]], tide: dict[str, Any] | None, nu: datetime) -> list[Bevinding]:
    uit: list[Bevinding] = []
    stil, nooit = [], []
    for f in feeds:
        t = _tijd(f.get("last_sync_at"))
        if t is None or t < NOOIT:
            nooit.append(f)
        elif nu - t >= FEED_STIL_NA:
            stil.append((f, nu - t))
    if stil:
        stil.sort(key=lambda x: x[1])
        jongste = stil[0][1]
        uit.append(Bevinding(
            "feeds_stil", "info", f"{len(stil)} marktfeeds staan stil",
            f"De jongste is al {_dagen(jongste)} niet bijgewerkt: "
            + ", ".join(f"{f.get('feed_id')} ({f.get('source') or '?'})" for f, _ in stil[:6])
            + ". Trading OS werkt op oude data.",
        ))
    if nooit:
        uit.append(Bevinding("feeds_nooit", "info", f"{len(nooit)} feeds hebben nog nooit gedraaid",
                             ", ".join(str(f.get("feed_id")) for f in nooit) + "."))
    s = signaal(tide, nu)
    if not s["vers"]:
        t = _tijd(s["at"])
        uit.append(Bevinding("signaal_oud", "info", "Geen actueel marktsignaal",
                             f"De nieuwste meting is van {t.strftime('%d-%m-%Y') if t else 'nooit'}; "
                             "die bias meld ik niet als actueel."))
    return uit
