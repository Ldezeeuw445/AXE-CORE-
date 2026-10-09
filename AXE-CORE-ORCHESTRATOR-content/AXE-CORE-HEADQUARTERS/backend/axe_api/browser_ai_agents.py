"""
Browser AI agents — DeepSeek chat, Browser Use automation, Camofox stealth.
"""
from __future__ import annotations

import os

import httpx
import llm_cascade
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


#: Zonder DeepSeek-sleutel antwoordt DeepSeek Coder V2 op AXE's eigen modelbox (Strato). Het IP met de
#: servernaam als SNI/Host, zodat het certificaat klopt zonder dat de VPS die naam naar zichzelf hoeft te laten wijzen.
MODELBOX_IP = os.getenv("DEEPSEEK_FALLBACK_IP", "217.160.135.111")
MODELBOX_NAAM = os.getenv("DEEPSEEK_FALLBACK_HOST", "ollama.axecompanion.com")
MODELBOX_MODEL = os.getenv("DEEPSEEK_FALLBACK_MODEL", "deepseek-coder-v2:16b")
_modelbox_cache: dict = {"t": 0.0, "ok": False}


async def _modelbox_chat(messages: list[dict], timeout: float = 120.0) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        res = await client.post(
            f"https://{MODELBOX_IP}/api/chat",
            headers={"Host": MODELBOX_NAAM},
            extensions={"sni_hostname": MODELBOX_NAAM},
            json={"model": MODELBOX_MODEL, "stream": False, "keep_alive": "30m", "messages": messages},
        )
    if res.status_code != 200:
        raise HTTPException(res.status_code, f"Model box error: {res.text[:200]}")
    return ((res.json().get("message") or {}).get("content") or "").strip()


async def _modelbox_bereikbaar() -> bool:
    """Is DeepSeek Coder V2 er? Eén lijstverzoek (geen model laden), een minuut onthouden."""
    import time
    if time.monotonic() - _modelbox_cache["t"] < 60:
        return bool(_modelbox_cache["ok"])
    ok = False
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            res = await client.get(f"https://{MODELBOX_IP}/api/tags", headers={"Host": MODELBOX_NAAM},
                                   extensions={"sni_hostname": MODELBOX_NAAM})
        ok = res.status_code == 200 and any(m.get("name", "").startswith("deepseek") for m in res.json().get("models", []))
    except (httpx.HTTPError, ValueError):
        ok = False
    _modelbox_cache.update(t=time.monotonic(), ok=ok)
    return ok


@router.post("/deepseek")
async def deepseek_chat(body: DeepSeekBody):
    """Chat with DeepSeek -- the cloud API when there is a key, otherwise DeepSeek Coder V2 on AXE's own server."""
    api_key = body.api_key or os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        if not await _modelbox_bereikbaar():
            raise HTTPException(
                503,
                "DeepSeek is not available: no DEEPSEEK_API_KEY on the VPS and the model box does not answer.",
            )
        persoon = "You are DeepSeek, a helpful AI assistant integrated into AXE Browser. Reply concisely in the user's language."
        tekst = await _modelbox_chat([
            {"role": "system", "content": persoon},
            {"role": "user", "content": body.message},
        ])
        diep = " DeepThink needs a DeepSeek API key, so this is the standard model." if body.mode == "deepthink" else ""
        return {
            "message": f"{tekst}\n\n— DeepSeek Coder V2, running on AXE's own server (no DeepSeek API key set).{diep}",
            "status": "ok",
        }

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


_health_cache: dict = {"t": 0.0, "llm": None}


@router.get("/health")
async def browser_ai_health():
    """Health check for all browser AI providers -- measured, not assumed.

    Browser Use and Camofox are "ready" only when at least one LLM behind them answers right now
    (llm_cascade.status): the lamp used to stay green with an empty OpenAI account while every task failed.
    """
    import time
    from camofox_client import camofox_health, CAMOFOX_BASE

    status: dict = {"deepseek": False, "browser_use": False, "camofox": False}
    if os.getenv("DEEPSEEK_API_KEY"):
        status["deepseek"] = True
        status["deepseek_note"] = "DeepSeek cloud"
    elif await _modelbox_bereikbaar():
        status["deepseek"] = True
        status["deepseek_note"] = "DeepSeek Coder V2 on AXE's own server (add DEEPSEEK_API_KEY for DeepThink)"
    else:
        status["deepseek_note"] = "DEEPSEEK_API_KEY is not set on the VPS and the model box does not answer"

    if time.monotonic() - _health_cache["t"] > 120 or _health_cache["llm"] is None:
        _health_cache.update(t=time.monotonic(), llm=await llm_cascade.status())
    llm = _health_cache["llm"]
    status["llm"] = llm["providers"]

    try:
        import browser_use  # noqa: F401
        status["browser_use"] = bool(llm["ok"])
        if os.getenv("BROWSER_USE_API_KEY"):
            status["browser_use_note"] = "browser-use cloud"
        elif llm["ok"]:
            status["browser_use_note"] = f"browser-use via {llm['using']}"
        else:
            status["browser_use_note"] = "no LLM answers right now: " + ", ".join(f"{k} {v}" for k, v in llm["providers"].items())
    except ImportError:
        status["browser_use_note"] = "browser-use not installed — using Playwright fallback"

    try:
        await camofox_health()
        status["camofox_url"] = CAMOFOX_BASE
        status["camofox"] = bool(llm["ok"])
        if not llm["ok"]:
            status["camofox_note"] = "Camofox is up, but no LLM answers right now: " + ", ".join(f"{k} {v}" for k, v in llm["providers"].items())
    except Exception as e:
        status["camofox_note"] = str(e)[:200]

    return status
