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

from browser_task_store import get_task, list_tasks, patch_task, put_task


def _browser_use_llm():
    """Cloud-sleutel als die er is, anders het OpenAI-model dat de VPS al heeft.

    ChatBrowserUse() negeert OPENAI_API_KEY en eist BROWSER_USE_API_KEY.
    Die staat niet op de box, dus de agent stopte vóór de Playwright-terugval
    (de fout is geen RuntimeError).
    """
    try:
        from browser_use import Agent, ChatBrowserUse  # type: ignore
    except ImportError as e:
        raise RuntimeError("browser-use package not installed (pip install browser-use)") from e

    cloud = os.getenv("BROWSER_USE_API_KEY")
    if cloud:
        return Agent, ChatBrowserUse(api_key=cloud)

    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise RuntimeError("Set BROWSER_USE_API_KEY or OPENAI_API_KEY for Browser Use")
    from browser_use.llm.openai.chat import ChatOpenAI  # type: ignore
    model = os.getenv("BROWSER_USE_MODEL", "gpt-4o-mini")
    return Agent, ChatOpenAI(model=model, api_key=openai_key)


def _chromium_executable() -> str | None:
    """De VPS heeft geen systeem-Chrome. Playwrights headless shell wel,
    en die draait al voor de browser-agent. Zonder dit pad start browser-use
    een Chrome die meteen sterft."""
    explicit = os.getenv("BROWSER_USE_CHROMIUM")
    if explicit and os.path.isfile(explicit):
        return explicit
    roots = [
        os.getenv("PLAYWRIGHT_BROWSERS_PATH", ""),
        os.path.expanduser("~/.cache/ms-playwright"),
    ]
    found: list[str] = []
    for root in roots:
        if not root or not os.path.isdir(root):
            continue
        for dirpath, _, filenames in os.walk(root):
            for name in filenames:
                if name in ("chrome-headless-shell", "chrome", "chromium"):
                    found.append(os.path.join(dirpath, name))
    found.sort(key=lambda path: (0 if "headless" in path else 1, path))
    return found[0] if found else None


async def _run_browser_use_native(task: str, max_steps: int = 25) -> str:
    """Run via browser-use library (pip install browser-use)."""
    Agent, llm = _browser_use_llm()
    kwargs: dict[str, Any] = {}
    exe = _chromium_executable()
    if exe:
        from browser_use.browser.profile import BrowserProfile  # type: ignore
        kwargs["browser_profile"] = BrowserProfile(executable_path=exe, headless=True)
    agent = Agent(task=task, llm=llm, **kwargs)
    history = await agent.run(max_steps=max_steps)

    if hasattr(history, "final_result") and callable(history.final_result):
        result = history.final_result()
        if result:
            return str(result)
    if hasattr(history, "is_done") and history.is_done():
        return "Task completed successfully."
    return "Browser Use agent finished."


async def _decide_playwright(task: str, page: dict, elements: list, history: list[dict]) -> dict:
    """Eén stap op de browser-agent die al draait. Eigen Chrome van browser-use
    start op deze VPS niet; deze agent wel."""
    import json as _json

    import httpx

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY ontbreekt, de browser-agent kan niet beslissen")
    system = (
        "You control a browser. Reply ONLY with JSON: "
        '{"message":"user-facing update","action":{"type":"navigate"|"click"|"type"|"done",'
        '"url":"https://...","x":0,"y":0,"text":"","submit":false}}. '
        "Use x/y from the element list to click. One action. "
        "When the page already answers the task, type done and put the answer in message."
    )
    brief = {
        "url": page.get("url"),
        "title": page.get("title"),
        "text": str(page.get("text") or "")[:2500],
        "elements": elements[:30],
    }
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Task: {task}\n\nPage:\n{_json.dumps(brief, ensure_ascii=False)[:6000]}"},
        *history[-4:],
    ]
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": os.getenv("BROWSER_USE_MODEL", "gpt-4o-mini"), "messages": messages, "max_tokens": 500},
        )
    if res.status_code != 200:
        raise RuntimeError(f"LLM error: {res.text[:200]}")
    raw = res.json()["choices"][0]["message"]["content"]
    cleaned = raw.strip().replace("```json", "").replace("```", "").strip()
    return _json.loads(cleaned)


async def _run_playwright_fallback(task: str) -> str:
    """De werkende Playwright-agent op :8002, met een echte beslis-lus.

    browser-use wil een eigen Chrome starten. Die sterft op deze VPS vóór
    CDP beschikbaar is. De agent die de browser-tab al gebruikt blijft staan.
    """
    import json as _json

    import httpx

    base = os.getenv("BROWSER_AGENT_BASE", "http://127.0.0.1:8002")
    async with httpx.AsyncClient(timeout=40) as client:
        res = await client.post(f"{base}/browser/agent/session")
        if res.status_code != 200:
            raise RuntimeError(f"Playwright agent unavailable: {res.text[:200]}")
        session_id = res.json()["session_id"]
        try:
            for word in task.split():
                if word.startswith(("http://", "https://")):
                    await client.post(
                        f"{base}/browser/agent/{session_id}/navigate",
                        json={"url": word.rstrip(".,)")},
                    )
                    break
            history: list[dict] = []
            last = "Browser agent started."
            for _ in range(6):
                read = await client.get(f"{base}/browser/agent/{session_id}/read")
                els = await client.get(f"{base}/browser/agent/{session_id}/elements")
                page = read.json() if read.status_code == 200 else {}
                elements = els.json().get("elements", []) if els.status_code == 200 else []
                decision = await _decide_playwright(task, page, elements, history)
                action = decision.get("action") or {}
                last = decision.get("message") or last
                history.append({"role": "assistant", "content": _json.dumps(decision)})
                kind = action.get("type", "done")
                if kind == "done":
                    return last
                if kind == "navigate" and action.get("url"):
                    await client.post(
                        f"{base}/browser/agent/{session_id}/navigate",
                        json={"url": action["url"]},
                    )
                elif kind == "click":
                    await client.post(
                        f"{base}/browser/agent/{session_id}/click",
                        json={"x": action.get("x"), "y": action.get("y")},
                    )
                elif kind == "type":
                    await client.post(
                        f"{base}/browser/agent/{session_id}/type",
                        json={"text": action.get("text", ""), "submit": bool(action.get("submit"))},
                    )
                else:
                    return last
            return last or "Reached step limit."
        finally:
            await client.post(f"{base}/browser/agent/{session_id}/close")


async def run_browser_use_task(task: str, mode: str = "automate", background: bool = True) -> dict[str, Any]:
    task_id = f"bu_{uuid.uuid4().hex[:12]}"
    record = put_task({
        "id": task_id,
        "provider": "browser-use",
        "status": "running",
        "message": f"Starting Browser Use: {task[:200]}",
        "sessionId": None,
        "created_at": time.time(),
        "task": task,
        "mode": mode,
    })

    async def _execute():
        try:
            try:
                result = await _run_browser_use_native(task, max_steps=30 if mode == "scrape" else 20)
                patch_task(task_id, status="ok", message=result)
            except RuntimeError:
                result = await _run_playwright_fallback(task)
                patch_task(task_id, status="ok", message=result)
        except Exception as e:
            patch_task(task_id, status="error", message=str(e)[:500])

    if background:
        asyncio.create_task(_execute())
        return {"taskId": task_id, "status": "running", "message": record["message"]}

    await _execute()
    done = get_task(task_id) or record
    return {"taskId": task_id, "status": done["status"], "message": done["message"], "sessionId": done.get("sessionId")}
