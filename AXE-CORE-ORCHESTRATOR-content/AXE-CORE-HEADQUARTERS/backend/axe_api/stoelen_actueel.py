"""Alleen de stoelen van de Macs zoals ze NU heten.

20 nov gemeten: core_coding_seats had 9 machinenamen voor 2 Macs (imac,
imac-1, imac-2, imac-3, main-imac-luka, mac-mini-van-luka-5/-6, mini-van-luka-5/-6)
-- macOS hangt er na een naamconflict een nummer aan, en de hartslag schrijft
dan een nieuwe rij. De oude rijen bleven meetellen: e-mailadressen en
"ingelogd" van weken geleden in Settings, dezelfde stoel twee keer in een menu.

Regel: per Mac (iMac / Mac mini) telt alleen de machinenaam die zich het laatst
meldde. Een Mac die uit staat blijft dus zichtbaar (met oude tijd = offline),
maar zijn spooknamen niet. Andere rijen (bv. xai van de VPS) blijven staan.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any


def mac_label(machine: Any) -> str | None:
    s = str(machine or "").strip().lower()
    if "imac" in s:
        return "iMac"
    if "mini" in s:
        return "Mac mini"
    return None


def _tijd(s: Any) -> float:
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
    except Exception:  # noqa: BLE001
        return 0.0


def actuele_stoelen(rijen: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nieuwste: dict[str, tuple[float, str]] = {}
    for r in rijen:
        label = mac_label(r.get("machine"))
        if not label:
            continue
        t = _tijd(r.get("last_seen_at"))
        if label not in nieuwste or t > nieuwste[label][0]:
            nieuwste[label] = (t, str(r.get("machine")))
    houd = {m for _t, m in nieuwste.values()}
    return [r for r in rijen if mac_label(r.get("machine")) is None or str(r.get("machine")) in houd]
