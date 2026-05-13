"""Routes for source sweep + adapter access (auth-protected)."""
from fastapi import APIRouter, Depends, HTTPException, Request

from routes.auth import get_current_operator
from services.sweep import run_sweep, get_last_snapshot, ADAPTERS

router = APIRouter(prefix="/api", tags=["sources"])


@router.post("/sources/sweep")
async def sources_sweep(_: str = Depends(get_current_operator)):
    snap = await run_sweep()
    return snap


@router.get("/sources/latest")
async def sources_latest(_: str = Depends(get_current_operator)):
    snap = get_last_snapshot()
    if not snap:
        snap = await run_sweep()
    return snap


@router.get("/adapters/{name}")
async def adapter_one(name: str, _: str = Depends(get_current_operator)):
    snap = get_last_snapshot()
    if not snap:
        snap = await run_sweep()
    if name not in snap["sources"]:
        raise HTTPException(status_code=404, detail=f"unknown adapter '{name}'")
    return snap["sources"][name]


@router.get("/adapters")
async def adapters_list(_: str = Depends(get_current_operator)):
    return {"adapters": list(ADAPTERS.keys())}
