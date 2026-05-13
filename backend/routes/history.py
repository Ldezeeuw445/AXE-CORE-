"""Signal history — paginated replay of past correlations + sweep summaries."""
from typing import Optional
from fastapi import APIRouter, Depends, Request

from routes.auth import get_current_operator

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/correlations")
async def correlations_history(request: Request, limit: int = 30, skip: int = 0,
                               _: str = Depends(get_current_operator)):
    db = request.app.state.db
    rows = await db.correlations.find({}, {"_id": 0}).sort("created_at", -1).skip(skip).limit(min(limit, 100)).to_list(limit)
    total = await db.correlations.count_documents({})
    return {"total": total, "items": rows, "limit": limit, "skip": skip}


@router.get("/sweeps")
async def sweeps_history(request: Request, limit: int = 60, skip: int = 0,
                         _: str = Depends(get_current_operator)):
    db = request.app.state.db
    rows = await db.sweeps.find({}, {"_id": 0}).sort("started_at", -1).skip(skip).limit(min(limit, 200)).to_list(limit)
    return {"items": rows, "limit": limit, "skip": skip}


@router.get("/correlation/{sweep_id}")
async def correlation_for_sweep(sweep_id: str, request: Request, _: str = Depends(get_current_operator)):
    db = request.app.state.db
    row = await db.correlations.find_one({"sweep_id": sweep_id}, {"_id": 0})
    if not row:
        return {"found": False, "sweep_id": sweep_id}
    return {"found": True, **row}
