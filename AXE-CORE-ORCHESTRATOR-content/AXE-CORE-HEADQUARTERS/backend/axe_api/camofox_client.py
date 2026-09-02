/**
 * HTTP client for the Camofox anti-detection browser server.
 * API docs: https://github.com/jo-inc/camofox-browser
 */
import os
import httpx
from fastapi import HTTPException

CAMOFOX_BASE = os.getenv("CAMOFOX_SERVER_URL", "http://127.0.0.1:9377").rstrip("/")
CAMOFOX_USER = os.getenv("CAMOFOX_USER_ID", "axe-core")
CAMOFOX_TIMEOUT = float(os.getenv("CAMOFOX_TIMEOUT", "30"))


async def camofox_health() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(f"{CAMOFOX_BASE}/health")
    if res.status_code != 200:
        raise HTTPException(503, f"Camofox server not reachable at {CAMOFOX_BASE}")
    return res.json()


async def camofox_ensure_started() -> None:
    """Start the Camofox engine if not already running."""
    try:
        await camofox_health()
        return
    except HTTPException:
        pass
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(f"{CAMOFOX_BASE}/start")
    if res.status_code not in (200, 409):
        raise HTTPException(503, f"Camofox /start failed: {res.text[:200]}")


async def camofox_create_tab(url: str = "about:blank") -> str:
    await camofox_ensure_started()
    async with httpx.AsyncClient(timeout=CAMOFOX_TIMEOUT) as client:
        res = await client.post(
            f"{CAMOFOX_BASE}/tabs",
            json={"url": url, "userId": CAMOFOX_USER},
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Camofox create tab failed: {res.text[:200]}")
    data = res.json()
    tab_id = data.get("tabId") or data.get("id") or data.get("tab_id")
    if not tab_id:
        raise HTTPException(502, f"Camofox returned no tab id: {data}")
    return str(tab_id)


async def camofox_navigate(tab_id: str, url: str) -> dict:
    async with httpx.AsyncClient(timeout=CAMOFOX_TIMEOUT) as client:
        res = await client.post(
            f"{CAMOFOX_BASE}/tabs/{tab_id}/navigate",
            json={"url": url, "userId": CAMOFOX_USER},
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Camofox navigate failed: {res.text[:200]}")
    return res.json()


async def camofox_snapshot(tab_id: str, include_screenshot: bool = False) -> dict:
    params = {"userId": CAMOFOX_USER}
    if include_screenshot:
        params["includeScreenshot"] = "true"
    async with httpx.AsyncClient(timeout=CAMOFOX_TIMEOUT) as client:
        res = await client.get(f"{CAMOFOX_BASE}/tabs/{tab_id}/snapshot", params=params)
    if res.status_code != 200:
        raise HTTPException(502, f"Camofox snapshot failed: {res.text[:200]}")
    return res.json()


async def camofox_click(tab_id: str, ref: str) -> dict:
    async with httpx.AsyncClient(timeout=CAMOFOX_TIMEOUT) as client:
        res = await client.post(
            f"{CAMOFOX_BASE}/tabs/{tab_id}/click",
            json={"ref": ref, "userId": CAMOFOX_USER},
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Camofox click failed: {res.text[:200]}")
    return res.json()


async def camofox_type(tab_id: str, ref: str, text: str, submit: bool = False) -> dict:
    async with httpx.AsyncClient(timeout=CAMOFOX_TIMEOUT) as client:
        res = await client.post(
            f"{CAMOFOX_BASE}/tabs/{tab_id}/type",
            json={"ref": ref, "text": text, "submit": submit, "userId": CAMOFOX_USER},
        )
    if res.status_code != 200:
        raise HTTPException(502, f"Camofox type failed: {res.text[:200]}")
    return res.json()


async def camofox_close_tab(tab_id: str) -> None:
    async with httpx.AsyncClient(timeout=10) as client:
        await client.delete(f"{CAMOFOX_BASE}/tabs/{tab_id}", params={"userId": CAMOFOX_USER})
