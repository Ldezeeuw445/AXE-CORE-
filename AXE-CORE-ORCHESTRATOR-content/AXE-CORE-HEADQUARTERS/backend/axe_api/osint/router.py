"""OSINT HTTP surface: GET /osint/all and GET /osint/{adapter}.

On-demand fetch with a per-adapter TTL cache and stale fallback — no
permanent background sweep, so the 8GB box only pays for what the maps
actually ask for. If a fetch fails and a previous result exists, the
previous result is returned with status="stale" instead of an error, so the
map keeps showing data through transient upstream hiccups (same contract
the original Intelligence Terminal used).
"""
import asyncio
import os
import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from . import air, base, crypto, heatmap, intel, macro, news, space, vessel

ADAPTERS = {
    "air": air,
    "vessel": vessel,
    "space": space,
    "heatmap": heatmap,
    "news": news,
    "crypto": crypto,
    "macro": macro,
    "intel": intel,
}

router = APIRouter()

_cache: Dict[str, dict] = {}
_cache_ts: Dict[str, float] = {}
_locks: Dict[str, asyncio.Lock] = {}
_ais_started = False


def _ttl(name: str) -> int:
    return int(getattr(ADAPTERS[name], "TTL", 60))


async def _ensure_aisstream() -> None:
    """Start the AISStream websocket collector once, only if keyed."""
    global _ais_started
    if _ais_started or not os.environ.get("AISSTREAM_API_KEY"):
        return
    _ais_started = True
    from . import aisstream
    asyncio.create_task(aisstream.start_global_stream())


async def _get(name: str) -> dict:
    if name not in ADAPTERS:
        raise HTTPException(404, f"Unknown OSINT adapter '{name}'. Known: {', '.join(sorted(ADAPTERS))}")
    if name == "vessel":
        await _ensure_aisstream()
    now = time.monotonic()
    if name in _cache and now - _cache_ts.get(name, 0) < _ttl(name):
        return _cache[name]
    lock = _locks.setdefault(name, asyncio.Lock())
    async with lock:
        # Re-check after acquiring: another request may have refreshed it.
        if name in _cache and time.monotonic() - _cache_ts.get(name, 0) < _ttl(name):
            return _cache[name]
        try:
            result = await ADAPTERS[name].fetch()
        except Exception as e:  # noqa: BLE001 — adapters are best-effort by contract
            result = base.err(e)
        if result.get("status") == "error" and name in _cache:
            stale = base.stale(_cache[name])
            if stale:
                return stale
        _cache[name] = result
        _cache_ts[name] = time.monotonic()
        return result


@router.get("/all")
async def osint_all() -> Dict[str, Any]:
    results = await asyncio.gather(*[_get(n) for n in ADAPTERS])
    return {name: result for name, result in zip(ADAPTERS, results)}


@router.get("/{name}")
async def osint_one(name: str) -> dict:
    return await _get(name)
