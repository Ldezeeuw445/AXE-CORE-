"""Sweep service: fan-out fetch over all adapters with caching + health."""
import asyncio
import time
from datetime import datetime, timezone

from services.cache import cache
from adapters import news, air, vessel, space, macro, crypto, heatmap, intel

ADAPTERS = {
    "news": (news.fetch, news.TTL),
    "air": (air.fetch, air.TTL),
    "vessel": (vessel.fetch, vessel.TTL),
    "space": (space.fetch, space.TTL),
    "macro": (macro.fetch, macro.TTL),
    "crypto": (crypto.fetch, crypto.TTL),
    "heatmap": (heatmap.fetch, heatmap.TTL),
    "intel": (intel.fetch, intel.TTL),
}

_last_snapshot: dict | None = None
_last_snapshot_ts: float = 0.0


async def _fetch_with_cache(name: str, fetch_fn, ttl: int):
    key = f"adapter:{name}"
    cached = cache.get(key, ttl)
    if cached is not None:
        return cached
    lock = cache.lock_for(key)
    async with lock:
        # re-check inside lock
        cached = cache.get(key, ttl)
        if cached is not None:
            return cached
        try:
            result = await fetch_fn()
        except Exception as e:
            result = {"status": "error", "count": 0, "items": [], "error": str(e)[:200]}
        # If error, fall back to last-good cached value (mark stale)
        if result.get("status") == "error":
            stale = cache.get(key, ttl=10_000_000)
            if stale and stale.get("items"):
                result = {**stale, "status": "stale", "error": result.get("error")}
        cache.set(key, result)
        return result


async def run_sweep() -> dict:
    global _last_snapshot, _last_snapshot_ts
    started = time.time()
    coros = [_fetch_with_cache(name, fn, ttl) for name, (fn, ttl) in ADAPTERS.items()]
    results = await asyncio.gather(*coros, return_exceptions=True)
    sources = {}
    events_total = 0
    for (name, _), res in zip(ADAPTERS.items(), results):
        if isinstance(res, Exception):
            sources[name] = {"status": "error", "count": 0, "items": [], "error": str(res)[:200]}
        else:
            sources[name] = res
            events_total += res.get("count", 0)
    snapshot = {
        "sweep_id": f"sweep_{int(started)}",
        "started_at": datetime.fromtimestamp(started, tz=timezone.utc).isoformat(),
        "duration_s": round(time.time() - started, 2),
        "sources": sources,
        "events_total": events_total,
        "healthy_sources": sum(1 for v in sources.values() if v.get("status") == "ok"),
        "total_sources": len(sources),
    }
    _last_snapshot = snapshot
    _last_snapshot_ts = started
    return snapshot


def get_last_snapshot():
    return _last_snapshot


async def scheduled_sweep_loop(db):
    """Background loop: refresh sweep every 30s."""
    while True:
        try:
            snap = await run_sweep()
            # persist a lean version to mongo
            try:
                lean = {
                    "sweep_id": snap["sweep_id"],
                    "started_at": snap["started_at"],
                    "duration_s": snap["duration_s"],
                    "events_total": snap["events_total"],
                    "healthy_sources": snap["healthy_sources"],
                    "total_sources": snap["total_sources"],
                    "health": {k: {"status": v.get("status"), "count": v.get("count")} for k, v in snap["sources"].items()},
                }
                await db.sweeps.insert_one(lean)
                # cap collection size
                count = await db.sweeps.count_documents({})
                if count > 500:
                    oldest = await db.sweeps.find().sort("started_at", 1).limit(count - 500).to_list(length=count - 500)
                    if oldest:
                        await db.sweeps.delete_many({"_id": {"$in": [o["_id"] for o in oldest]}})
            except Exception:
                pass
        except Exception:
            pass
        await asyncio.sleep(30)
