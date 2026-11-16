"""De NorthSea-manager kijkt naar de deals die het dichtst bij een deal zijn.

## Waarom dit bestaat

16 nov, Luka: "ik heb elke keer je hebt 90 approvals wachten ... er is
volgensmij nog steeds geen deal terwijl er een paar wel dichtbij waren". De
manager telde de wachtrij (89, 90, 90...) en noemde de eerste drie onderwerpen,
die allemaal "Copper Cathode — supply qualification" heetten. Van de 947 open
matches zijn er 27 echt actief; daar zit het werk.

Hier: elke twee uur de actieve deals lezen (alleen lezen, via de gateway), ze
rangschikken op hoe ver ze zijn, en de drie bovenste met hun blokkade en
volgende stap aan de manager geven. `kies` is puur en testbaar.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable

VERVERS_NA = timedelta(hours=2)
MAX_DEALS = 30
TOP = 3

Ophaler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]

_cache: dict[str, Any] = {"op": None, "uit": []}


def _score(d: dict[str, Any]) -> float:
    deal = d.get("deal") or {}
    poorten = sum(1 for g in d.get("gates") or [] if g.get("passed"))
    gereed = float(deal.get("readiness_score") or 0)
    contact = 15 if int(d.get("communications_total") or 0) > 0 else 0
    fase = {"verifying": 10, "engaged": 15, "negotiating": 25, "contracting": 35}.get(str(deal.get("stage") or ""), 0)
    return poorten * 20 + gereed + contact + fase


def _volgende(d: dict[str, Any]) -> str:
    deal = d.get("deal") or {}
    if deal.get("next_action"):
        return str(deal["next_action"])
    for e in d.get("recent_events") or []:
        tekst = str(e.get("summary") or "")
        if e.get("event_type") == "engine_evaluation_changed" and "Next:" in tekst:
            return tekst.split("Next:", 1)[1].strip()
    return ""


def _blokkade(d: dict[str, Any]) -> str:
    deal = d.get("deal") or {}
    if deal.get("primary_blocker"):
        return str(deal["primary_blocker"])
    for e in d.get("recent_events") or []:
        tekst = str(e.get("summary") or "")
        if e.get("event_type") == "engine_evaluation_changed" and "Current blocker:" in tekst:
            return tekst.split("Current blocker:", 1)[1].split("Next:", 1)[0].strip().rstrip(".")
    return ""


def regel(d: dict[str, Any]) -> tuple[str, str]:
    """(titel, detail) in gewone taal."""
    deal = d.get("deal") or {}
    naam = deal.get("deal_code") or deal.get("deal") or str(deal.get("deal_id") or "")[:8]
    koper = (deal.get("buyer") or {}).get("name") or "koper onbekend"
    verkoper = (deal.get("supplier") or {}).get("name") or "verkoper onbekend"
    hoeveel = f" {deal['volume_mt']:g} MT" if isinstance(deal.get("volume_mt"), (int, float)) else ""
    poorten = sum(1 for g in d.get("gates") or [] if g.get("passed"))
    titel = f"Dichtst bij een deal: {naam}, {deal.get('product') or deal.get('commodity') or '?'}{hoeveel} ({verkoper} → {koper})"
    delen = [f"{poorten} van 9 stappen rond"]
    if (b := _blokkade(d)):
        delen.append(f"vast op: {b}")
    if (v := _volgende(d)):
        wie = "jij" if deal.get("action_owner") == "luka" else "ik"
        delen.append(f"volgende stap ({wie}): {v}")
    return titel, "; ".join(delen)


def kies(deals: list[dict[str, Any]], top: int = TOP) -> list[dict[str, Any]]:
    open_ = [d for d in deals if (d.get("deal") or {}).get("stage") not in ("won", "lost")]
    return sorted(open_, key=_score, reverse=True)[:top]


async def _lees(ophaler: Ophaler) -> list[dict[str, Any]]:
    samen = (await ophaler("get_pipeline_summary", {}) or {}).get("result") or {}
    actief = next((m.get("record_ids") or [] for m in samen.get("metrics") or [] if m.get("metric") == "active"), [])
    antwoorden = await asyncio.gather(*(ophaler("get_deal", {"deal": i}) for i in actief[:MAX_DEALS]),
                                      return_exceptions=True)
    return [(a or {}).get("result") or {} for a in antwoorden if isinstance(a, dict)]


def focus(nu: datetime, ophaler: Ophaler | None = None) -> list[tuple[str, str]]:
    """De top drie als (titel, detail); hooguit eens per twee uur echt gelezen."""
    if _cache["op"] is not None and nu - _cache["op"] < VERVERS_NA:
        return list(_cache["uit"])
    if ophaler is None:
        import northsea_gateway
        ophaler = northsea_gateway.call_action
    deals = asyncio.run(_lees(ophaler))
    uit = [regel(d) for d in kies(deals)]
    _cache.update(op=nu, uit=uit)
    return uit
