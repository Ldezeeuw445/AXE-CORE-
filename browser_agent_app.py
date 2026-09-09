"""
browser_agent_app — the browser agent as its own single-worker process.

WHY THIS EXISTS, AND IT IS THE WHOLE POINT

browser_agent.py keeps its sessions in a module-level dict, one live Chromium
context per session_id. That is the only way to hold a real browser: a Playwright
page is a live object with an open connection, not something you can serialise
into Postgres and pick up somewhere else.

The main API runs uvicorn with --workers 12. Twelve processes, twelve separate
copies of that dict. So `POST /session` created a session in whichever worker
answered, and the very next call — navigate, click, screenshot — landed on a
different worker that had never heard of it. Measured 2026-08-22 against the
live box: create returned bs_1787356939_1, and navigate, read and screenshot all
answered "Browser agent session not found or expired — start a new one".

Eleven times in twelve, by arithmetic. Which is why the browser tab has been
throwing errors at Luka for weeks while every individual piece tested fine.

Sticky routing cannot fix this (uvicorn workers are not addressable), and a
shared store cannot either (the thing being shared is a socket to a browser).
The fix is to stop having twelve of them: one process, one worker, one dict,
and the main API proxies to it. Chromium is the memory cost here, not the web
server, so a single worker is also the honest shape — twelve idle Chromium
launchers were never wanted.

Runs on 127.0.0.1:8002. Never exposed directly; main.py forwards
/browser/agent/* here and keeps the auth in front of it.
"""
from fastapi import FastAPI

from browser_agent import router as browser_agent_router

app = FastAPI(title="AXE browser agent", docs_url=None, redoc_url=None)
app.include_router(browser_agent_router, prefix="/browser/agent", tags=["browser-agent"])


@app.get("/health")
async def health() -> dict:
    """Liveness only. A browser session is not started here — asking this
    endpoint to prove Chromium works would launch one on every poll."""
    return {"ok": True, "service": "browser-agent", "workers": 1}
