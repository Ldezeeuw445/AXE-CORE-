"""
Browser AI agents — DeepSeek chat, Browser Use automation, Camofox stealth.
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from browser_use_runner import get_task, list_tasks, run_browser_use_task
from camofox_runner import get_camofox_task, run_camofox_task

router = APIRouter(prefix="/browser/ai", tags=["browser-ai"])


class DeepSeekBody(BaseModel):
    message: str
    mode: str = "chat"
    api_key: str | None = None


class AgentTaskBody(BaseModel):
    task: str
    mode: str = "automate"


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

    async with httpx.AsyncClient(timeout=90) as client:
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
    """Run a Browser Use automation task (async — poll /browser/ai/task/{id})."""
    result = await run_browser_use_task(body.task, body.mode, background=True)
    return {
        "message": result["message"],
        "taskId": result["taskId"],
        "sessionId": result.get("sessionId"),
        "status": result["status"],
    }


@router.post("/camofox")
async def camofox_task(body: AgentTaskBody):
    """Run a Camofox stealth browsing task (async — poll /browser/ai/task/{id})."""
    result = await run_camofox_task(body.task, body.mode)
    return {
        "message": result["message"],
        "taskId": result["taskId"],
        "sessionId": result.get("sessionId"),
        "status": result["status"],
    }


@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """Poll status of a Browser Use or Camofox background task."""
    task = get_task(task_id) or get_camofox_task(task_id)
    if not task:
        raise HTTPException(404, f"Task {task_id} not found")
    return {
        "taskId": task["id"],
        "provider": task.get("provider"),
        "status": task["status"],
        "message": task["message"],
        "sessionId": task.get("sessionId"),
    }


@router.get("/tasks")
async def list_recent_tasks():
    """List recent browser AI tasks."""
    return {"tasks": list_tasks()}


@router.get("/health")
async def browser_ai_health():
    """Health check for all browser AI providers."""
    from camofox_client import camofox_health, CAMOFOX_BASE

    status: dict = {"deepseek": bool(os.getenv("DEEPSEEK_API_KEY")), "browser_use": False, "camofox": False}
    try:
        import browser_use  # noqa: F401
        status["browser_use"] = True
        status["browser_use_note"] = "browser-use package installed"
    except ImportError:
        status["browser_use_note"] = "browser-use not installed — using Playwright fallback"

    try:
        await camofox_health()
        status["camofox"] = True
        status["camofox_url"] = CAMOFOX_BASE
    except Exception as e:
        status["camofox_note"] = str(e)[:200]

    return status
