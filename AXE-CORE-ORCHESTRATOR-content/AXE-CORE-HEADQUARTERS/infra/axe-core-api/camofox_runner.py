"""
Camofox agent runner — drives the Camofox REST API with an LLM decision loop.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from typing import Any

import httpx
from fastapi import HTTPException

from camofox_client import (
    camofox_click,
    camofox_close_tab,
    camofox_create_tab,
    camofox_health,
    camofox_navigate,
    camofox_snapshot,
    camofox_type,
)

from browser_task_store import get_task, patch_task, put_task


def get_camofox_task(task_id: str) -> dict[str, Any] | None:
    task = get_task(task_id)
    if task and task.get("provider") not in (None, "camofox"):
        return None
    return task


async def _llm_decide(task: str, snapshot_text: str, history: list[dict]) -> dict:
    """Ask LLM what action to take next on the Camofox page."""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY") or os.getenv("BROWSER_USE_API_KEY")
    if not api_key:
        raise RuntimeError("No LLM API key for Camofox agent (OPENAI_API_KEY, DEEPSEEK_API_KEY, or BROWSER_USE_API_KEY)")

    model = os.getenv("CAMOFOX_LLM_MODEL", "gpt-4o-mini")
    endpoint = os.getenv("CAMOFOX_LLM_ENDPOINT", "https://api.openai.com/v1/chat/completions")

    system = """You control a stealth browser (Camofox). Reply ONLY with JSON:
{"reasoning":"brief","message":"user-facing update","action":{"type":"navigate"|"click"|"type"|"done","url":"...","ref":"e1","text":"...","submit":false}}
Use element refs (e1, e2...) from the snapshot. One action per turn."""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Task: {task}\n\nPage snapshot:\n{snapshot_text[:6000]}"},
    ]
    for h in history[-4:]:
        messages.append(h)

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            endpoint,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "max_tokens": 1024},
        )
    if res.status_code != 200:
        raise RuntimeError(f"LLM error: {res.text[:200]}")
    raw = res.json()["choices"][0]["message"]["content"]
    cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


async def _run_camofox_loop(task_id: str, task: str, mode: str) -> None:
    tab_id: str | None = None
    try:
        await camofox_health()
        # Camofox weigert about:blank. Begin op het adres uit de opdracht,
        # anders op een gewone https-pagina.
        start_url = "https://example.com"
        for word in task.split():
            if word.startswith(("http://", "https://")):
                start_url = word.rstrip(".,)")
                break
        tab_id = await camofox_create_tab(start_url)
        patch_task(task_id, sessionId=tab_id, message=f"Camofox tab created: {tab_id}")

        history: list[dict] = []
        max_steps = 15 if mode == "research" else 10

        for step in range(max_steps):
            snap = await camofox_snapshot(tab_id)
            snap_text = json.dumps(snap, ensure_ascii=False)[:8000]
            decision = await _llm_decide(task, snap_text, history)
            action = decision.get("action", {})
            msg = decision.get("message", "Working…")
            patch_task(task_id, message=msg)

            history.append({"role": "assistant", "content": json.dumps(decision)})

            atype = action.get("type", "done")
            if atype == "done":
                patch_task(task_id, status="ok", message=msg or "Task completed.")
                return
            if atype == "navigate" and action.get("url"):
                await camofox_navigate(tab_id, action["url"])
            elif atype == "click" and action.get("ref"):
                await camofox_click(tab_id, action["ref"])
            elif atype == "type" and action.get("ref"):
                await camofox_type(tab_id, action["ref"], action.get("text", ""), action.get("submit", False))
            else:
                patch_task(task_id, status="ok", message=msg)
                return

            await asyncio.sleep(0.5)

        patch_task(task_id, status="ok", message="Reached step limit — partial completion.")

    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        patch_task(task_id, status="error", message=detail)
    except Exception as e:
        patch_task(task_id, status="error", message=str(e)[:500])
    finally:
        if tab_id:
            try:
                await camofox_close_tab(tab_id)
            except Exception:
                pass


async def run_camofox_task(task: str, mode: str = "stealth") -> dict[str, Any]:
    task_id = f"cf_{uuid.uuid4().hex[:12]}"
    record = put_task({
        "id": task_id,
        "provider": "camofox",
        "status": "running",
        "message": f"Starting Camofox stealth agent: {task[:200]}",
        "sessionId": None,
        "created_at": time.time(),
        "task": task,
        "mode": mode,
    })
    asyncio.create_task(_run_camofox_loop(task_id, task, mode))
    return {"taskId": task_id, "status": "running", "message": record["message"]}
