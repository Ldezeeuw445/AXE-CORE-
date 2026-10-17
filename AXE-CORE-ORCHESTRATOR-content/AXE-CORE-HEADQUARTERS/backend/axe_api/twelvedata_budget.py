"""Gedeelde Twelve Data-cache en dagbudget, voor beide API-workers.

Het gratis plan is 800 credits per dag. Gemeten 17 okt 2026: 1014 gebruikt.
De grootste kraan was het slotscherm: vier time_series-calls elke 300 s, twee
workers, 4 × 288 × 2 ≈ 2300 als de cache per proces leeg is. Daarna
/market/history (research, backtest-fallback), /marketdata/brief, en de
vectorbt/nautilus/kronos-engines die dezelfde sleutel uit .env lezen.

Dit bestand is de enige teller. Handel mag tot DAG_LIMIET. Overig (slotscherm,
toolbox) mag alleen het schijfje OVERIG_MAX, zodat er credits blijven voor
een trade. Een 429 zet de dag op uitgeput: geen nieuwe calls, wel cache.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

DAG_LIMIET = 600
OVERIG_MAX = 80
CACHE_TTL_S = 15 * 60


def _pad() -> str:
    gekozen = (os.environ.get("TWELVEDATA_BUDGET") or "").strip()
    if gekozen:
        return gekozen
    for p in ("/opt/axe-core-api/twelvedata-budget.json", "/tmp/axe-twelvedata-budget.json"):
        d = os.path.dirname(p)
        if os.path.isdir(d) and os.access(d, os.W_OK):
            return p
    return "/tmp/axe-twelvedata-budget.json"


def _vandaag() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _leeg() -> dict:
    return {"dag": _vandaag(), "used": 0, "uitgeput": False, "cache": {}}


def _lock_open(pad: str):
    os.makedirs(os.path.dirname(pad) or ".", exist_ok=True)
    return open(pad, "a+", encoding="utf-8")


def _lees(fh) -> dict:
    fh.seek(0)
    raw = fh.read()
    if not raw.strip():
        return _leeg()
    try:
        data = json.loads(raw)
    except ValueError:
        return _leeg()
    if not isinstance(data, dict) or data.get("dag") != _vandaag():
        return _leeg()
    data.setdefault("used", 0)
    data.setdefault("uitgeput", False)
    data.setdefault("cache", {})
    return data


def _schrijf(fh, data: dict) -> None:
    fh.seek(0)
    fh.truncate()
    json.dump(data, fh)
    fh.flush()


def _met_slot(fn):
    def wrap(*args, **kwargs):
        pad = _pad()
        try:
            import fcntl
        except ImportError:
            fcntl = None  # type: ignore[assignment]
        with _lock_open(pad) as fh:
            if fcntl:
                fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
            try:
                return fn(fh, *args, **kwargs)
            finally:
                if fcntl:
                    fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
    return wrap


def _cache_sleutel(symbol: str, interval: str, outputsize: int) -> str:
    return f"{symbol.strip().upper()}|{interval}|{int(outputsize)}"


@_met_slot
def mag(fh, prioriteit: str = "handel") -> bool:
    """True als deze prioriteit nog een credit mag gebruiken."""
    data = _lees(fh)
    if data.get("uitgeput"):
        return False
    used = int(data.get("used") or 0)
    if used >= DAG_LIMIET:
        return False
    if prioriteit != "handel" and used >= OVERIG_MAX:
        return False
    return True


@_met_slot
def boek(fh, n: int = 1) -> int:
    data = _lees(fh)
    data["used"] = int(data.get("used") or 0) + max(0, n)
    _schrijf(fh, data)
    return data["used"]


@_met_slot
def uitgeput(fh) -> None:
    """429 / 'run out of API credits' — rest van de dag geen nieuwe calls."""
    data = _lees(fh)
    data["uitgeput"] = True
    _schrijf(fh, data)


@_met_slot
def stand(fh) -> dict:
    data = _lees(fh)
    return {"dag": data["dag"], "used": int(data.get("used") or 0),
            "uitgeput": bool(data.get("uitgeput")), "limiet": DAG_LIMIET,
            "overig_max": OVERIG_MAX}


@_met_slot
def cache_get(fh, symbol: str, interval: str, outputsize: int, nu: float | None = None) -> Optional[dict]:
    data = _lees(fh)
    hit = (data.get("cache") or {}).get(_cache_sleutel(symbol, interval, outputsize))
    if not isinstance(hit, dict):
        return None
    at = float(hit.get("at") or 0)
    if (nu if nu is not None else time.time()) - at > CACHE_TTL_S:
        return None
    waarde = hit.get("value")
    return waarde if isinstance(waarde, dict) else None


@_met_slot
def cache_put(fh, symbol: str, interval: str, outputsize: int, value: dict, nu: float | None = None) -> None:
    if not value.get("ok"):
        return
    data = _lees(fh)
    cache = data.setdefault("cache", {})
    cache[_cache_sleutel(symbol, interval, outputsize)] = {
        "at": nu if nu is not None else time.time(),
        "value": value,
    }
    # Oude hits weg: het bestand blijft klein, twee workers lezen het elke call.
    grens = (nu if nu is not None else time.time()) - CACHE_TTL_S * 4
    data["cache"] = {k: v for k, v in cache.items() if float((v or {}).get("at") or 0) >= grens}
    _schrijf(fh, data)


def credits_op(fout: str) -> bool:
    s = (fout or "").lower()
    return "run out of api credits" in s or "429" in s or "limit 800" in s
