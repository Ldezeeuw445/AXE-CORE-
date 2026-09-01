"""
Browser AI agents — DeepSeek chat, Browser Use automation, Camofox stealth.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/browser/ai", tags=["browser-ai"])

BROWSER_AGENT_BASE = os.getenv("BROWSER_AGENT_BASE", "http://127.0.0.1:8002")


class DeepSeekBody(BaseModel):
    message: str
    mode: str = "chat"
    api_key: str | None = None


class AgentTaskBody(BaseModel):
    task: str
    mode: str = "automate"


async def _start_browser_session(stealth: bool = False) -> str:
    """Create a Playwright session via the single-worker browser agent service."""
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(f"{BROWSER_AGENT_BASE}/browser/agent/session")
    if res.status_code != 200:
        raise HTTPException(503, f"Browser agent unavailable: {res.text[:200]}")
    data = res.json()
    return data["session_id"]


@router.post("/deepseek")
async def deepseek_chat(body: DeepSeekBody):
    """Chat with DeepSeek."""
    api_key = body.api_key or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise HTTPException(
            503,
            "DeepSeek API key not configured. Set DEEPSEEK_API_KEY on the VPS or pass api_key.",
        )

    model = "deepseek-reasoner" if body.mode == "deepthink" else "deepseek-chat"
    system = (
        "You are DeepSeek, a helpful AI assistant integrated into AXE Browser. "
        "Reply concisely in the user's language."
    )
    if body.mode == "search":
        system += " The user wants web-aware answers — mention when live browsing is needed."

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": body.message},
                ],
                "max_tokens": 2048,
            },
        )
    if res.status_code != 200:
        raise HTTPException(res.status_code, f"DeepSeek API error: {res.text[:300]}")
    content = res.json()["choices"][0]["message"]["content"]
    return {"message": content, "status": "ok"}


@router.post("/browser-use")
async def browser_use_task(body: AgentTaskBody):
    """Start a Browser Use automation session."""
    try:
        session_id = await _start_browser_session(stealth=False)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Could not start browser session: {e}") from e

    return {
        "message": f"Browser Use agent ready. Task: {body.task[:300]}",
        "sessionId": session_id,
        "status": "agent_started",
    }


@router.post("/camofox")
async def camofox_task(body: AgentTaskBody):
    """Camofox stealth browser — Playwright fallback until Camofox server is deployed."""
    camofox_url = os.getenv("CAMOFOX_SERVER_URL")
    try:
        session_id = await _start_browser_session(stealth=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"Could not start stealth session: {e}") from e

    note = (
        f"Camofox server at {camofox_url} will be wired in next."
        if camofox_url
        else "Using stealth Playwright session until Camofox server is deployed."
    )
    return {
        "message": f"Camofox session ready. {note} Task: {body.task[:300]}",
        "sessionId": session_id,
        "status": "agent_started",
    }
