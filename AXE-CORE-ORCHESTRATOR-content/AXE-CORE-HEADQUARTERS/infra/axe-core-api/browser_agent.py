"""
Real browser automation for AXE's browser agent.
==================================================
Navigate / click / type / read / screenshot against a genuine headless
Chromium (Playwright), not a static HTML fetch — this is what lets AXE
actually act on a page instead of only reading it.

Requires `playwright` (see requirements.txt) AND `playwright install
chromium` run once on the VPS. If either is missing, every endpoint here
returns a real 503 explaining that, never a fabricated result.

Sessions live in memory, one Chromium context per session_id, and are
reaped after SESSION_IDLE_TIMEOUT seconds of inactivity.
"""
from __future__ import annotations

import time
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter()

SESSION_IDLE_TIMEOUT = 600  # seconds


class _Session:
    def __init__(self, context, page):
        self.context = context
        self.page = page
        self.last_used = time.time()


_playwright = None
_browser = None
_sessions: Dict[str, _Session] = {}
_next_id = 0


async def _ensure_browser() -> None:
    global _playwright, _browser
    if _browser is not None:
        return
    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        raise RuntimeError("playwright is not installed (pip install playwright)") from e
    _playwright = await async_playwright().start()
    try:
        _browser = await _playwright.chromium.launch(headless=True)
    except Exception as e:
        raise RuntimeError(
            f"Chromium not available — run `playwright install chromium` on this VPS: {e}"
        ) from e


async def _reap_idle() -> None:
    now = time.time()
    for sid, s in list(_sessions.items()):
        if now - s.last_used > SESSION_IDLE_TIMEOUT:
            await s.context.close()
            del _sessions[sid]


async def _get_session(session_id: str) -> _Session:
    s = _sessions.get(session_id)
    if not s:
        raise HTTPException(404, "Browser agent session not found or expired — start a new one")
    s.last_used = time.time()
    return s


class NavigateBody(BaseModel):
    url: str


class ClickBody(BaseModel):
    selector: str


class TypeBody(BaseModel):
    selector: str
    text: str
    submit: bool = False


@router.post("/session")
async def start_session():
    try:
        await _ensure_browser()
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    await _reap_idle()
    global _next_id
    context = await _browser.new_context(viewport={"width": 1280, "height": 800})
    page = await context.new_page()
    _next_id += 1
    session_id = f"bs_{int(time.time())}_{_next_id}"
    _sessions[session_id] = _Session(context, page)
    return {"session_id": session_id}


@router.post("/{session_id}/navigate")
async def navigate(session_id: str, body: NavigateBody):
    s = await _get_session(session_id)
    try:
        await s.page.goto(body.url, wait_until="domcontentloaded", timeout=20_000)
    except Exception as e:
        raise HTTPException(502, f"Navigate to '{body.url}' failed: {e}")
    return {"url": s.page.url, "title": await s.page.title()}


@router.post("/{session_id}/click")
async def click(session_id: str, body: ClickBody):
    s = await _get_session(session_id)
    try:
        await s.page.click(body.selector, timeout=8_000)
    except Exception as e:
        raise HTTPException(502, f"Click on '{body.selector}' failed: {e}")
    return {"url": s.page.url, "title": await s.page.title()}


@router.post("/{session_id}/type")
async def type_text(session_id: str, body: TypeBody):
    s = await _get_session(session_id)
    try:
        await s.page.fill(body.selector, body.text, timeout=8_000)
        if body.submit:
            await s.page.press(body.selector, "Enter")
    except Exception as e:
        raise HTTPException(502, f"Type into '{body.selector}' failed: {e}")
    return {"url": s.page.url, "title": await s.page.title()}


@router.get("/{session_id}/read")
async def read(session_id: str):
    s = await _get_session(session_id)
    try:
        title = await s.page.title()
        text = await s.page.inner_text("body")
    except Exception as e:
        raise HTTPException(502, f"Read failed: {e}")
    return {"url": s.page.url, "title": title, "text": text[:8_000]}


@router.get("/{session_id}/screenshot")
async def screenshot(session_id: str):
    s = await _get_session(session_id)
    try:
        png = await s.page.screenshot(type="png")
    except Exception as e:
        raise HTTPException(502, f"Screenshot failed: {e}")
    return Response(content=png, media_type="image/png")


@router.post("/{session_id}/close")
async def close_session(session_id: str):
    s = _sessions.pop(session_id, None)
    if s:
        await s.context.close()
    return {"closed": True}
