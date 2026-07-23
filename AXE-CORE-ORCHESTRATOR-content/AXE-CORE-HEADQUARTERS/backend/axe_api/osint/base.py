from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ok(items, extra=None):
    return {"status": "ok", "fetched_at": now_iso(), "count": len(items), "items": items, **(extra or {})}


def err(msg):
    return {"status": "error", "fetched_at": now_iso(), "count": 0, "items": [], "error": str(msg)[:300]}


def stale(prev):
    """Mark a cached response as STALE while still returning items."""
    if not prev:
        return None
    out = dict(prev)
    out["status"] = "stale"
    return out
