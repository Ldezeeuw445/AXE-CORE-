"""Watchlists — operator-defined filters persisted to Mongo.

Each watchlist:
  - id, name, layer ('air'|'vessel'|'crypto'|'macro'|...)
  - filters: arbitrary JSON dict {tail?, mmsi?, ticker?, sector?, type?, ...}
"""
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from routes.auth import get_current_operator

router = APIRouter(prefix="/api/watchlists", tags=["watchlists"])


class WatchlistIn(BaseModel):
    name: str
    layer: str
    filters: Dict[str, Any] = Field(default_factory=dict)
    pinned: bool = False


class Watchlist(WatchlistIn):
    id: str
    email: str
    created_at: str
    updated_at: str


def _serialize(row):
    if not row: return None
    out = dict(row)
    out.pop("_id", None)
    return out


@router.get("", response_model=List[Watchlist])
async def list_watchlists(request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    rows = await db.watchlists.find({"email": email}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return rows


@router.post("", response_model=Watchlist)
async def create_watchlist(payload: WatchlistIn, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": uuid.uuid4().hex,
        "email": email,
        "name": payload.name,
        "layer": payload.layer,
        "filters": payload.filters,
        "pinned": payload.pinned,
        "created_at": now,
        "updated_at": now,
    }
    await db.watchlists.insert_one(row)
    return _serialize(row)


@router.put("/{wid}", response_model=Watchlist)
async def update_watchlist(wid: str, payload: WatchlistIn, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    existing = await db.watchlists.find_one({"id": wid, "email": email})
    if not existing:
        raise HTTPException(status_code=404, detail="watchlist not found")
    now = datetime.now(timezone.utc).isoformat()
    update = {"name": payload.name, "layer": payload.layer, "filters": payload.filters,
              "pinned": payload.pinned, "updated_at": now}
    await db.watchlists.update_one({"id": wid, "email": email}, {"$set": update})
    row = await db.watchlists.find_one({"id": wid, "email": email}, {"_id": 0})
    return row


@router.delete("/{wid}")
async def delete_watchlist(wid: str, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    res = await db.watchlists.delete_one({"id": wid, "email": email})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="watchlist not found")
    return {"deleted": True, "id": wid}
