"""AXE Browser routes — in-app browser control endpoints."""
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from routes.auth import get_current_operator
from services.browser import (
    fetch_page,
    search_web,
    analyze_page,
    get_session_info,
    close_browser_session,
)

router = APIRouter(prefix="/api/browser", tags=["browser"])


class FetchRequest(BaseModel):
    url: str
    wait_for: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    num_results: int = 5


class AnalyzeRequest(BaseModel):
    url: str


@router.post("/fetch")
async def browser_fetch(
    req: FetchRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Fetch a web page and return its content."""
    session_id = f"browser-{email}"
    result = await fetch_page(req.url, session_id, req.wait_for)
    return result


@router.post("/search")
async def browser_search(
    req: SearchRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Search the web."""
    session_id = f"browser-{email}"
    result = await search_web(req.query, session_id, req.num_results)
    return result


@router.post("/analyze")
async def browser_analyze(
    req: AnalyzeRequest,
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Analyze a web page and extract key information."""
    session_id = f"browser-{email}"
    result = await analyze_page(req.url, session_id)
    return result


@router.get("/session")
async def browser_session(
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Get current browser session info."""
    session_id = f"browser-{email}"
    return await get_session_info(session_id)


@router.delete("/session")
async def browser_session_close(
    request: Request,
    email: str = Depends(get_current_operator)
):
    """Close the browser session."""
    session_id = f"browser-{email}"
    close_browser_session(session_id)
    return {"status": "ok", "message": "Browser session closed"}


@router.get("/health")
async def browser_health(_: str = Depends(get_current_operator)):
    """Check browser service health."""
    return {
        "status": "ok",
        "note": "Browser service uses aiohttp for web fetching. For JS-rendered sites, consider adding playwright/puppeteer.",
        "capabilities": [
            "HTML page fetching",
            "Link extraction",
            "Meta tag parsing",
            "Page structure analysis",
            "Session history tracking",
        ],
    }
