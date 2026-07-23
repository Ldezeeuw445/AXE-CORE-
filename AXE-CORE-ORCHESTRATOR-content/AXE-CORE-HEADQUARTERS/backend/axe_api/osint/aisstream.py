"""AISStream.io global vessel WebSocket client.

Connects to wss://stream.aisstream.io/v0/stream, subscribes globally to
PositionReport + ShipStaticData, and maintains an in-memory snapshot of the
latest known state per MMSI.

Designed to be Bloomberg-grade:
- Auto-reconnect with exponential backoff on disconnects / network errors
- Bounded in-memory cache (LRU-ish via timestamp eviction) to avoid leaks
- Fast lookups for the curated HIGH_IMPACT_VESSELS registry
- Zero PII / secret logging; API key is only loaded from env

Usage:
    from .aisstream import start_global_stream, get_global_snapshot
    asyncio.create_task(start_global_stream())
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
from typing import Any, Dict, Iterable, List, Optional

import websockets

from .registry_vessels import BY_MMSI, HIGH_IMPACT_VESSELS

LOG = logging.getLogger("axe.aisstream")
WS_URL = "wss://stream.aisstream.io/v0/stream"
MAX_CACHE = 60_000             # cap MMSIs we keep in memory
STALE_AFTER_S = 24 * 3600      # drop entries we haven't seen in 24h
BBOX_GLOBAL: List[List[List[float]]] = [[[-90.0, -180.0], [90.0, 180.0]]]

# ---------- shared state ----------
_LATEST: Dict[int, Dict[str, Any]] = {}
_REG_HITS: Dict[int, Dict[str, Any]] = {}  # MMSI -> latest record for registry-matched vessels
_LOCK = asyncio.Lock()
_RUNNING = False
_LAST_MSG_TS: float = 0.0
_CONNECT_COUNT: int = 0
_MSG_COUNT: int = 0


def stats() -> Dict[str, Any]:
    return {
        "running": _RUNNING,
        "vessels_tracked": len(_LATEST),
        "registry_live": len(_REG_HITS),
        "last_msg_age_s": (time.time() - _LAST_MSG_TS) if _LAST_MSG_TS else None,
        "connect_count": _CONNECT_COUNT,
        "msg_count": _MSG_COUNT,
    }


def get_global_snapshot(limit: int = 800, prefer_registry: bool = True) -> List[Dict[str, Any]]:
    """Return latest position records, prioritizing registry hits."""
    out: List[Dict[str, Any]] = []
    seen = set()
    if prefer_registry:
        for mmsi, rec in _REG_HITS.items():
            out.append(rec)
            seen.add(mmsi)
    # add non-registry recent items (most-recent first)
    items = sorted(
        (r for m, r in _LATEST.items() if m not in seen),
        key=lambda r: r.get("ts_epoch", 0),
        reverse=True,
    )
    for r in items:
        if len(out) >= limit:
            break
        out.append(r)
    return out


def get_registry_live() -> Dict[int, Dict[str, Any]]:
    """Return MMSI -> latest record for vessels in the high-impact registry."""
    return dict(_REG_HITS)


# ---------- parsing helpers ----------

def _now() -> float:
    return time.time()


def _record_from_position(meta: Dict[str, Any], msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Build a normalized vessel record from a PositionReport AIS msg."""
    try:
        mmsi = int(meta.get("MMSI") or meta.get("UserID") or msg.get("UserID"))
    except (TypeError, ValueError):
        return None
    if not mmsi:
        return None
    lat = msg.get("Latitude")
    lon = msg.get("Longitude")
    if lat is None or lon is None:
        return None
    # AISStream sends 0 lat/lon when unknown — drop nonsense fills
    if lat == 0 and lon == 0:
        return None
    sog = msg.get("Sog")
    cog = msg.get("Cog")
    heading = msg.get("TrueHeading")
    nav = msg.get("NavigationalStatus")
    name = (meta.get("ShipName") or "").strip() or None
    rec = {
        "id": f"vessel_ais_{mmsi}",
        "mmsi": mmsi,
        "source": "aisstream",
        "layer": "vessel",
        "lat": float(lat),
        "lon": float(lon),
        "sog": float(sog) if sog is not None else None,
        "cog": float(cog) if cog is not None else None,
        "heading": int(heading) if heading is not None and heading != 511 else None,
        "nav_status": nav,
        "name": name,
        "ts_epoch": _now(),
        "ts": meta.get("time_utc"),
    }
    reg = BY_MMSI.get(mmsi)
    if reg:
        rec.update({
            "is_registry_match": True,
            "impact_name": reg["name"],
            "impact_type": reg["type"],
            "operator": reg["operator"],
            "flag": reg.get("flag"),
            "sector": reg["sector"],
            "ticker": reg.get("ticker"),
            "notes": reg.get("notes"),
            "dwt": reg.get("dwt"),
            "teu": reg.get("teu"),
        })
    return rec


def _record_from_static(meta: Dict[str, Any], msg: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Augment a record with ShipStaticData info (name, ship type, dims)."""
    try:
        mmsi = int(meta.get("MMSI") or msg.get("UserID"))
    except (TypeError, ValueError):
        return None
    name = (msg.get("Name") or "").strip()
    ship_type = msg.get("Type")
    callsign = (msg.get("CallSign") or "").strip()
    destination = (msg.get("Destination") or "").strip()
    imo = msg.get("ImoNumber")
    a, b, c, d = msg.get("Dimension", {}).get("A"), msg.get("Dimension", {}).get("B"), msg.get("Dimension", {}).get("C"), msg.get("Dimension", {}).get("D")
    length = (a + b) if (a is not None and b is not None) else None
    width = (c + d) if (c is not None and d is not None) else None
    return {
        "mmsi": mmsi,
        "name": name or None,
        "callsign": callsign or None,
        "destination": destination or None,
        "imo": imo if imo else None,
        "ship_type": ship_type,
        "length": length,
        "width": width,
    }


async def _store(rec: Dict[str, Any]) -> None:
    if not rec:
        return
    global _LAST_MSG_TS, _MSG_COUNT
    _LAST_MSG_TS = _now()
    _MSG_COUNT += 1
    mmsi = rec["mmsi"]
    async with _LOCK:
        prior = _LATEST.get(mmsi)
        # If incoming is just static data (no lat/lon), merge onto existing record
        if "lat" not in rec and prior:
            prior.update({k: v for k, v in rec.items() if v is not None and k != "mmsi"})
            prior["ts_epoch"] = _now()
            if BY_MMSI.get(mmsi):
                _REG_HITS[mmsi] = prior
            return
        # Otherwise it's a position update — merge with any prior static fields
        if prior:
            merged = {**prior, **rec}
            _LATEST[mmsi] = merged
        else:
            _LATEST[mmsi] = rec
        if BY_MMSI.get(mmsi):
            _REG_HITS[mmsi] = _LATEST[mmsi]
        # Bound cache size by evicting oldest
        if len(_LATEST) > MAX_CACHE:
            _evict_oldest_unlocked(int(MAX_CACHE * 0.1))


def _evict_oldest_unlocked(count: int) -> None:
    """Evict ``count`` oldest non-registry entries (caller already holds lock)."""
    items = [(m, r.get("ts_epoch", 0)) for m, r in _LATEST.items() if not r.get("is_registry_match")]
    items.sort(key=lambda x: x[1])
    for m, _ in items[:count]:
        _LATEST.pop(m, None)


# ---------- main loop ----------

async def _subscribe(ws, api_key: str) -> None:
    payload = {
        "APIKey": api_key,
        "BoundingBoxes": BBOX_GLOBAL,
        "FilterMessageTypes": ["PositionReport", "ShipStaticData", "StandardClassBPositionReport"],
    }
    await ws.send(json.dumps(payload))


async def _consume(ws) -> None:
    async for raw in ws:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        mtype = data.get("MessageType")
        meta = data.get("MetaData") or {}
        msg_block = data.get("Message") or {}
        if mtype in ("PositionReport", "StandardClassBPositionReport"):
            inner = msg_block.get(mtype) or msg_block.get("PositionReport") or {}
            rec = _record_from_position(meta, inner)
            if rec:
                await _store(rec)
        elif mtype == "ShipStaticData":
            inner = msg_block.get("ShipStaticData") or {}
            rec = _record_from_static(meta, inner)
            if rec:
                await _store(rec)


async def start_global_stream(api_key: Optional[str] = None) -> None:
    """Run the WebSocket consumer with exponential backoff. Never raises."""
    global _RUNNING, _CONNECT_COUNT
    api_key = api_key or os.environ.get("AISSTREAM_API_KEY")
    if not api_key:
        LOG.warning("AISStream disabled: AISSTREAM_API_KEY not set")
        return
    _RUNNING = True
    backoff = 2.0
    while _RUNNING:
        try:
            _CONNECT_COUNT += 1
            LOG.info("AISStream connecting (attempt %d)", _CONNECT_COUNT)
            async with websockets.connect(
                WS_URL,
                ping_interval=20,
                ping_timeout=20,
                close_timeout=5,
                max_size=4 * 1024 * 1024,
            ) as ws:
                await _subscribe(ws, api_key)
                backoff = 2.0  # reset on success
                await _consume(ws)
        except asyncio.CancelledError:
            break
        except Exception as e:
            LOG.warning("AISStream disconnect: %s", str(e)[:200])
        # backoff and retry
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(min(backoff, 60))
        backoff = min(backoff * 1.7, 60)
    _RUNNING = False
