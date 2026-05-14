"""TradingOS snapshot builder.

Produces a clean, Bloomberg-grade JSON envelope from the raw AXE sweep +
correlation output. The Trading OS Intel tab consumes this single endpoint;
fields are stable so any downstream consumer (Supabase, SDK, agent) can rely
on them.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services import aisstream
from services.sweep import get_last_snapshot

SNAPSHOT_VERSION = "1.0"


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


def _top(items: List[Dict[str, Any]], key, limit: int = 10, reverse: bool = True) -> List[Dict[str, Any]]:
    try:
        return sorted(items, key=key, reverse=reverse)[:limit]
    except Exception:
        return items[:limit]


def _digest(sources: Dict[str, Any]) -> Dict[str, Any]:
    """Build a curated 'top of mind' digest from the raw sweep."""
    news = (sources.get("news") or {}).get("items") or []
    intel = (sources.get("intel") or {}).get("items") or []
    air = (sources.get("air") or {}).get("items") or []
    vessel = (sources.get("vessel") or {}).get("items") or []
    heatmap = (sources.get("heatmap") or {}).get("items") or []
    macro = (sources.get("macro") or {}).get("items") or []
    crypto = (sources.get("crypto") or {}).get("items") or []
    space = (sources.get("space") or {}).get("items") or []

    jets = [a for a in air if a.get("is_registry_match") or a.get("is_corporate")]
    vessels_hi = [v for v in vessel if v.get("is_registry_match")]
    quakes = [i for i in intel if i.get("category") == "earthquake"]
    cyber = [i for i in intel if i.get("category") in ("cyber-vuln", "cyber")]

    return {
        "top_news": [
            {
                "id": n.get("id"),
                "title": n.get("title"),
                "source": n.get("source"),
                "country": n.get("country"),
                "url": n.get("url"),
                "ts": n.get("ts"),
            }
            for n in (news or [])[:15]
        ],
        "top_jets": [
            {
                "id": j.get("id"),
                "callsign": j.get("callsign"),
                "registration": j.get("registration") or j.get("icao24"),
                "owner": j.get("owner"),
                "sector": j.get("sector"),
                "ticker": j.get("ticker"),
                "altitude_ft": j.get("altitude_ft"),
                "lat": j.get("lat"),
                "lon": j.get("lon"),
                "is_registry_match": bool(j.get("is_registry_match")),
            }
            for j in jets[:20]
        ],
        "top_vessels": [
            {
                "id": v.get("id"),
                "mmsi": v.get("mmsi"),
                "name": v.get("impact_name") or v.get("name"),
                "operator": v.get("operator"),
                "sector": v.get("sector"),
                "ticker": v.get("ticker"),
                "flag": v.get("flag"),
                "lat": v.get("lat"),
                "lon": v.get("lon"),
                "source": v.get("source"),
            }
            for v in vessels_hi[:20]
        ],
        "top_thermal": _top(
            heatmap,
            key=lambda x: x.get("frp_num") or 0,
            limit=10,
        ),
        "top_quakes": _top(
            quakes,
            key=lambda x: x.get("magnitude") or 0,
            limit=10,
        ),
        "top_cyber": [
            {
                "id": c.get("id"),
                "title": c.get("title"),
                "cve_id": c.get("cve_id"),
                "cvss": c.get("cvss"),
                "vendor": c.get("vendor"),
                "product": c.get("product"),
            }
            for c in cyber[:10]
        ],
        "top_macro": [
            {
                "id": m.get("id"),
                "title": m.get("title"),
                "value": m.get("value"),
                "unit": m.get("unit"),
                "source": m.get("source"),
            }
            for m in (macro or [])[:12]
        ],
        "top_crypto": [
            {
                "id": c.get("id"),
                "symbol": c.get("symbol"),
                "price_usd": c.get("price_usd"),
                "change_24h_pct": c.get("change_24h_pct"),
            }
            for c in (crypto or [])[:12]
        ],
        "top_space": [
            {
                "id": s.get("id"),
                "title": s.get("title"),
                "norad_id": s.get("norad_id"),
                "altitude_km": s.get("altitude_km"),
                "lat": s.get("lat"),
                "lon": s.get("lon"),
            }
            for s in (space or [])[:6]
        ],
    }


def _market_impact(correlation: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not correlation:
        return {
            "headline_risk": "AWAITING CORRELATION",
            "alert_level": "BASELINE",
            "regions_active": [],
            "top_themes": [],
        }
    signals = correlation.get("signals") or []
    themes = []
    for s in signals[:5]:
        themes.append({
            "id": s.get("id"),
            "title": s.get("title"),
            "confidence": s.get("confidence"),
            "sources_involved": s.get("sources_involved") or [],
        })
    return {
        "headline_risk": correlation.get("headline_risk") or "",
        "alert_level": correlation.get("alert_level") or "BASELINE",
        "regions_active": correlation.get("regions_active") or [],
        "top_themes": themes,
    }


def _agent_status(snap: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    ais = aisstream.stats()
    started_at = snap.get("started_at") if snap else None
    sweep_age = None
    if started_at:
        try:
            sweep_age = int(time.time() - datetime.fromisoformat(started_at.replace("Z", "+00:00")).timestamp())
        except Exception:
            sweep_age = None
    return {
        "running": bool(snap),
        "sweep_id": snap.get("sweep_id") if snap else None,
        "last_sweep_at": started_at,
        "sweep_age_s": sweep_age,
        "healthy_sources": (snap or {}).get("healthy_sources", 0),
        "total_sources": (snap or {}).get("total_sources", 0),
        "events_total": (snap or {}).get("events_total", 0),
        "aisstream": {
            "running": ais.get("running"),
            "vessels_tracked": ais.get("vessels_tracked"),
            "msg_count": ais.get("msg_count"),
            "last_msg_age_s": ais.get("last_msg_age_s"),
        },
    }


def _source_health(snap: Optional[Dict[str, Any]]) -> Dict[str, str]:
    if not snap:
        return {}
    return {k: (v.get("status") or "unknown") for k, v in (snap.get("sources") or {}).items()}


def _raw_counts(snap: Optional[Dict[str, Any]]) -> Dict[str, int]:
    if not snap:
        return {}
    return {k: int(v.get("count") or 0) for k, v in (snap.get("sources") or {}).items()}


def build_snapshot(correlation: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return the canonical TradingOS snapshot envelope.

    Callers pass the *latest correlation result* (already cached in /api/ai/
    correlate/latest). If unavailable, the snapshot still returns with
    correlation: null and alert_level: BASELINE.
    """
    snap = get_last_snapshot()
    sources = (snap or {}).get("sources") or {}
    return {
        "version": SNAPSHOT_VERSION,
        "ts": _ts(),
        "sweep_id": (snap or {}).get("sweep_id"),
        "sweep_started_at": (snap or {}).get("started_at"),
        "agent_status": _agent_status(snap),
        "market_impact": _market_impact(correlation),
        "correlation": correlation,
        "intel_digest": _digest(sources),
        "source_health": _source_health(snap),
        "raw_counts": _raw_counts(snap),
    }
