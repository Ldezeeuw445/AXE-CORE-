"""Dagkoersen voor de NorthSea-desk: koper, Brent en de dollarindex (24 nov).

De desk haalde ze via fetchMarketSnapshot: koper en DXY via stooq (in de browser
CORS-geblokkeerd, en stooq zet sinds kort een bot-controle voor elke aanvraag),
Brent via een bron die 100,31 toonde terwijl de Brent-future op 86,60 stond.
Hier: Yahoo's openbare grafiek-API, server-side, zonder sleutel. Alleen deze drie
desk-symbolen -- dit is geen trading-feed en geeft nooit een verzonnen prijs.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

DESK_SYMBOLEN = {
    "XCUUSD": ("HG=F", "Copper (COMEX HG, USD/lb)"),
    "BCOUSD": ("BZ=F", "Brent crude (ICE, USD/bbl)"),
    "DXY": ("DX-Y.NYB", "US Dollar Index"),
}


def dag_balken(payload: Any) -> list[dict[str, Any]]:
    """Yahoo v8 chart -> [{t (ms), o, h, l, c}], gaten (None) eruit."""
    try:
        blok = payload["chart"]["result"][0]
        ts = blok.get("timestamp") or []
        q = blok["indicators"]["quote"][0]
    except (KeyError, IndexError, TypeError):
        return []
    uit = []
    for i, t in enumerate(ts):
        try:
            c = q["close"][i]
            if c is None:
                continue
            o, h, low = (q.get(k, [None] * len(ts))[i] for k in ("open", "high", "low"))
            uit.append({"t": int(t) * 1000, "o": float(o if o is not None else c),
                        "h": float(h if h is not None else c), "l": float(low if low is not None else c),
                        "c": float(c)})
        except (IndexError, TypeError, ValueError):
            continue
    return uit


def samenvatting(symbool: str, balken: list[dict[str, Any]], nu: datetime | None = None) -> dict[str, Any]:
    """{ok, symbol, source, label, last, changePct (vs vorige dagslot), bars}. ok=False zonder balken."""
    label = DESK_SYMBOLEN.get(symbool, ("", symbool))[1]
    if not balken:
        return {"ok": False, "symbol": symbool, "label": label, "error": "no data from source"}
    last = balken[-1]["c"]
    vorige = balken[-2]["c"] if len(balken) > 1 else None
    return {
        "ok": True, "symbol": symbool, "label": label, "source": "yahoo",
        "last": last,
        "changePct": ((last - vorige) / vorige * 100) if vorige else None,
        "bars": balken[-60:],
        "fetchedAt": (nu or datetime.now(timezone.utc)).isoformat(),
    }
