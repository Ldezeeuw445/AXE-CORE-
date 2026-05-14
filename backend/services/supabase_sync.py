"""Supabase mirror for AXE Intel snapshots.

Pushes the canonical TradingOS snapshot (see services.tradingos.build_snapshot)
into Supabase table `axe_intel` after every sweep cycle. Trading OS can then
read the latest snapshot from Supabase even if the AXE backend is offline.

Design notes:
- Uses raw httpx (no new dependency) against Supabase REST.
- Upserts on sweep_id (so duplicates from retries don't pile up).
- Best-effort: failures are logged at WARNING level but never raise to the
  caller; the sweep loop must remain robust.
- Pruning is left to a scheduled function in Supabase (axe_intel_prune()).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from services.http import get_client

LOG = logging.getLogger("axe.supabase_sync")


def _enabled() -> bool:
    return bool(
        os.environ.get("TRADINGOS_SUPABASE_URL")
        and os.environ.get("TRADINGOS_SUPABASE_ANON_KEY")
    )


async def push_snapshot(snapshot: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Upsert one snapshot row into Supabase.axe_intel.

    Returns the Supabase response JSON on success, None on any failure.
    """
    if not _enabled():
        return None
    if not snapshot or not snapshot.get("sweep_id"):
        return None

    url = (
        os.environ["TRADINGOS_SUPABASE_URL"].rstrip("/")
        + "/rest/v1/axe_intel?on_conflict=sweep_id"
    )
    key = os.environ["TRADINGOS_SUPABASE_ANON_KEY"]
    row = {
        "sweep_id": snapshot["sweep_id"],
        "sweep_started_at": snapshot.get("sweep_started_at"),
        "agent_status": snapshot.get("agent_status") or {},
        "market_impact": snapshot.get("market_impact") or {},
        "correlation": snapshot.get("correlation"),
        "intel_digest": snapshot.get("intel_digest") or {},
        "source_health": snapshot.get("source_health") or {},
        "raw_counts": snapshot.get("raw_counts") or {},
        "payload": snapshot,
    }
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        # Upsert + return minimal payload
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    try:
        c = get_client()
        r = await c.post(url, json=row, headers=headers, timeout=8.0)
        if r.status_code >= 400:
            LOG.warning(
                "Supabase mirror failed: %s %s", r.status_code, (r.text or "")[:200]
            )
            return None
        return {"status": "ok", "sweep_id": snapshot["sweep_id"]}
    except Exception as e:
        LOG.warning("Supabase mirror error: %s", str(e)[:200])
        return None
