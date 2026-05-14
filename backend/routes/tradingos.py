"""TradingOS integration routes.

A single GET endpoint that returns a Bloomberg-grade snapshot for the
Trading OS Intel tab and the AXE Intel Agent.
"""
from __future__ import annotations

from fastapi import APIRouter, Request

from services import tradingos

router = APIRouter(prefix="/api/tradingos", tags=["tradingos"])


@router.get("/snapshot")
async def get_snapshot(request: Request):
    """Return the canonical AXE Intel snapshot envelope.

    No auth required (public read for Trading OS Intel tab). The data is
    already aggregated, normalized, and (where relevant) curated to top-N
    so no raw noisy data is exposed.
    """
    db = request.app.state.db
    latest_corr = None
    try:
        row = await db.correlations.find_one(sort=[("created_at", -1)])
        if row:
            latest_corr = row.get("result")
    except Exception:
        latest_corr = None
    return tradingos.build_snapshot(latest_corr)


@router.get("/health")
async def health():
    """Lightweight liveness probe for monitoring from Trading OS."""
    from services.sweep import get_last_snapshot
    snap = get_last_snapshot()
    return {
        "status": "ok" if snap else "warming",
        "sweep_id": (snap or {}).get("sweep_id"),
        "healthy_sources": (snap or {}).get("healthy_sources", 0),
        "total_sources": (snap or {}).get("total_sources", 0),
        "version": tradingos.SNAPSHOT_VERSION,
    }
