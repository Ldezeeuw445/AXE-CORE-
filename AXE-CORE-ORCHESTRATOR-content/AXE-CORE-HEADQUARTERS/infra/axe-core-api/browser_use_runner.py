"""
Browser Use agent runner — wraps the browser-use Python library when installed,
falls back to the existing Playwright agent loop otherwise.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from typing import Any

from fastapi import HTTPException

# In-memory task store for async runs
_tasks: dict[str, dict[str, Any]] = {}


def get_task(task_id: str) -> dict[str, Any] | None:
    return _tasks.get(task_id)


def list_tasks() -> list[dict[str, Any]]:
    return [
        {"id": k, "status": v.get("status"), "message": v.get("message", "")[:200], "created_at": v.get("created_at")}
        for k, v in sorted(_tasks.items(), key=lambda x: x[1].get("created_at", 0), reverse=True)[:20]
    ]


async def _run_browser_use_native(task: str, max_steps: int = 25) -> str:
    """Run via browser-use library (pip install browser-use)."""
    try:
        from browser_use import Agent, ChatBrowserUse  # type: ignore
    except ImportError as e:
        raise RuntimeError("browser-use package not installed (pip install browser-use)") from e

    api_key = os.getenv("BROWSER_USE_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set BROWSER_USE_API_KEY or OPENAI_API_KEY for Browser Use")

    llm = ChatBrowserUse()
    agent = Agent(task=task, llm=llm)
    history = await agent.run(max_steps=max_steps)

    if hasattr(history, "final_result") and callable(history.final_result):
        result = history.final_result()
        if result:
            return str(result)
    if hasattr(history, "is_done") and history.is_done():
        return "Task completed successfully."
    return "Browser Use agent finished."


async def _run_playwright_fallback(task: str) -> str:
    """Fallback: use existing Playwright session + simple navigate."""
    import httpx

    base = os.getenv("BROWSER_AGENT_BASE", "http://127.0.0.1:8002")
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(f"{base}/browser/agent/session")
    if res.status_code != 200:
        raise RuntimeError(f"Playwright agent unavailable: {res.text[:200]}")
    session_id = res.json()["session_id"]

    # Extract URL from task if present
    url = None
    for word in task.split():
        if word.startswith("http://") or word.startswith("https://"):
            url = word.rstrip(".,)")
            break
    if url:
        async with httpx.AsyncClient(timeout=30) as client:
            nav = await client.post(
                f"{base}/browser/agent/{session_id}/navigate",
                json={"url": url},
            )
        if nav.status_code == 200:
            data = nav.json()
            return f"Navigated to {data.get('title', url)}. Session: {session_id}. Full agent loop available in Browser Agent panel."

    return f"Playwright session started ({session_id}). Open Browser Agent panel to continue: {task[:200]}"


async def run_browser_use_task(task: str, mode: str = "automate", background: bool = True) -> dict[str, Any]:
    task_id = f"bu_{uuid.uuid4().hex[:12]}"
    _tasks[task_id] = {
        "id": task_id,
        "provider": "browser-use",
        "status": "running",
        "message": f"Starting Browser Use: {task[:200]}",
        "sessionId": None,
        "created_at": time.time(),
        "task": task,
        "mode": mode,
    }

    async def _execute():
        try:
            try:
                result = await _run_browser_use_native(task, max_steps=30 if mode == "scrape" else 20)
                _tasks[task_id]["status"] = "ok"
                _tasks[task_id]["message"] = result
            except RuntimeError:
                result = await _run_playwright_fallback(task)
                _tasks[task_id]["status"] = "agent_started"
                _tasks[task_id]["message"] = result
                if "Session:" in result:
                    sid = result.split("Session:")[-1].strip().rstrip(".")
                    _tasks[task_id]["sessionId"] = sid.split()[0] if sid else None
        except Exception as e:
            _tasks[task_id]["status"] = "error"
            _tasks[task_id]["message"] = str(e)[:500]

    if background:
        asyncio.create_task(_execute())
        return {"taskId": task_id, "status": "running", "message": _tasks[task_id]["message"]}

    await _execute()
    t = _tasks[task_id]
    return {"taskId": task_id, "status": t["status"], "message": t["message"], "sessionId": t.get("sessionId")}
