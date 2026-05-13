"""System routes — health + meta."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from routes.auth import get_current_operator
from services.sweep import get_last_snapshot

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
async def health():
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


@router.get("/meta")
async def meta(_: str = Depends(get_current_operator)):
    snap = get_last_snapshot()
    return {
        "last_sweep_id": snap.get("sweep_id") if snap else None,
        "last_sweep_at": snap.get("started_at") if snap else None,
        "healthy_sources": snap.get("healthy_sources") if snap else 0,
        "total_sources": snap.get("total_sources") if snap else 8,
        "adapters": ["news", "air", "vessel", "space", "macro", "crypto", "heatmap", "intel"],
    }
