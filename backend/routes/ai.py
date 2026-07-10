"""AXE AI routes: correlation + chat (auth-protected)."""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.ai import correlate, chat_message
from services.sweep import get_last_snapshot, run_sweep

router = APIRouter(prefix="/api/ai", tags=["ai"])


class CorrelateResponse(BaseModel):
    status: str
    result: Optional[dict] = None
    error: Optional[str] = None
    sweep_id: Optional[str] = None
    cached: Optional[bool] = None


async def _refresh_correlation_bg(db, snap):
    """Run correlation in background and persist result."""
    try:
        out = await correlate(snap)
        if out.get("status") == "ok":
            await db.correlations.insert_one({
                "sweep_id": snap.get("sweep_id"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "result": out.get("result"),
            })
    except Exception:
        pass


@router.post("/correlate", response_model=CorrelateResponse)
async def ai_correlate(request: Request, _: str = Depends(get_current_operator)):
    db = request.app.state.db
    snap = get_last_snapshot()
    if not snap:
        snap = await run_sweep()
    # If we have a recent cached correlation (<5 min), return immediately and refresh in background
    cached = await db.correlations.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    if cached:
        try:
            created = datetime.fromisoformat(cached["created_at"].replace("Z", "+00:00"))
            age = (datetime.now(timezone.utc) - created).total_seconds()
        except Exception:
            age = 1e9
        if age < 300:
            # spawn background refresh, return cached now
            asyncio.create_task(_refresh_correlation_bg(db, snap))
            return CorrelateResponse(status="ok", result=cached.get("result"),
                                     sweep_id=cached.get("sweep_id"), cached=True)
    # Otherwise compute synchronously (first-time path)
    out = await correlate(snap)
    out["sweep_id"] = snap.get("sweep_id")
    try:
        if out.get("status") == "ok":
            await db.correlations.insert_one({
                "sweep_id": snap.get("sweep_id"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "result": out.get("result"),
            })
    except Exception:
        pass
    return out


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(req: ChatRequest, request: Request, email: str = Depends(get_current_operator)):
    db = request.app.state.db
    session_id = req.session_id or f"chat-{email}-{uuid.uuid4().hex[:10]}"
    snap = get_last_snapshot()
    # Pass email and db to enable RAG + feedback adaptation
    reply = await chat_message(session_id, req.message, snapshot=snap, email=email, db=db)
    try:
        await db.chats.insert_one({
            "session_id": session_id,
            "email": email,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "user": req.message,
            "axe": reply,
        })
    except Exception:
        pass
    return ChatResponse(response=reply, session_id=session_id)


@router.get("/chat/history")
async def ai_chat_history(session_id: str, request: Request, _: str = Depends(get_current_operator)):
    db = request.app.state.db
    rows = await db.chats.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return {"session_id": session_id, "messages": rows}


class LatestCorrelationResponse(BaseModel):
    status: str
    result: Optional[dict] = None
    created_at: Optional[str] = None
    sweep_id: Optional[str] = None


@router.get("/correlate/latest", response_model=LatestCorrelationResponse)
async def ai_correlate_latest(request: Request, _: str = Depends(get_current_operator)):
    db = request.app.state.db
    row = await db.correlations.find_one({}, {"_id": 0}, sort=[("created_at", -1)])
    if not row:
        return LatestCorrelationResponse(status="none")
    return LatestCorrelationResponse(
        status="ok", result=row.get("result"),
        created_at=row.get("created_at"), sweep_id=row.get("sweep_id"),
    )
