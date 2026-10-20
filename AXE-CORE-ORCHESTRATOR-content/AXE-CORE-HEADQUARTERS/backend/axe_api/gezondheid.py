"""Wat /health meet naast "het proces leeft" (CORE-HEALTH-1, docs/programma).

/health zei altijd "ok" zolang uvicorn antwoordde. Op 11 okt stond AXE Commodities
drie dagen stil en zei de API "ok"; een /cron/tick die niet meer binnenkomt of een
task worker die stilligt zag je er ook niet aan. Hier staan de afhankelijkheden
die de API zelf goedkoop kan meten:

  supabase       één rij lezen uit het gedeelde project
  cron_tick      hoe lang geleden /cron/tick binnenkwam (de crontab tikt elke minuut)
  task_worker    `systemctl is-active axe-task-worker`, alleen waar systemd is
  northsea_mcp   de /health van de MCP op 127.0.0.1:8040
  ollama_box     /api/tags van de modelbox (ollama.axecompanion.com)

De modelbox laat deze VPS op IP door en een browser alleen met een sleutel per
apparaat. De zijbalk mat hem vanuit de browser: geen sleutel op dat apparaat
gaf een 401 zonder CORS-header, en dat leest een browser als "unreachable".
Zo stond de box op 20 okt op beide apparaten OFFLINE terwijl hij met 12
modellen antwoordde. Hier meet de VPS hem, en de zijbalk leest dit.

Elke meting heeft een korte timeout en gooit nooit; samen hooguit eens per CACHE_S.
`status` blijft "ok" zolang de API zelf leeft, zodat de bewaker en de uptimecheck
het proces blijven meten en niet de buren. Wat er mis is staat in `degraded`.
"""
from __future__ import annotations

import asyncio
import shutil
import time
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

import httpx

CACHE_S = 20.0
TIMEOUT_S = 2.0
# De crontab tikt elke 60 s; drie gemiste tikken is geen ruis meer.
TICK_MAX_S = 180.0
NORTHSEA_MCP_HEALTH = "http://127.0.0.1:8040/health"
OLLAMA_BOX_TAGS = "https://ollama.axecompanion.com/api/tags"

_laatste_tick: Optional[float] = None
_cache: dict = {}


def tick_ontvangen(nu: Optional[float] = None) -> None:
    """Aanroepen bij elke geldige /cron/tick."""
    global _laatste_tick
    _laatste_tick = time.time() if nu is None else nu


def beoordeel_tick(laatste: Optional[float], nu: float) -> dict:
    if laatste is None:
        return {"state": "unknown", "detail": "no tick since this process started"}
    leeftijd = round(nu - laatste)
    state = "ok" if leeftijd <= TICK_MAX_S else "fail"
    return {"state": state, "age_s": leeftijd}


async def _supabase(client: httpx.AsyncClient, url: str, key: str) -> dict:
    if not url or not key:
        return {"state": "unknown", "detail": "not configured"}
    r = await client.get(url.rstrip("/") + "/rest/v1/core_schedules",
                         headers={"apikey": key, "Authorization": f"Bearer {key}"},
                         params={"select": "id", "limit": "1"})
    return {"state": "ok"} if r.is_success else {"state": "fail", "detail": f"HTTP {r.status_code}"}


async def _northsea(client: httpx.AsyncClient, url: str) -> dict:
    r = await client.get(url)
    data = r.json() if r.is_success else None
    if isinstance(data, dict) and data.get("status") == "ok":
        return {"state": "ok", "version": data.get("version")}
    return {"state": "fail", "detail": f"HTTP {r.status_code}"}


async def _ollama_box(client: httpx.AsyncClient, url: str) -> dict:
    r = await client.get(url)
    modellen = (r.json() if r.is_success else {}).get("models")
    if isinstance(modellen, list) and modellen:
        return {"state": "ok", "models": len(modellen)}
    return {"state": "fail", "detail": f"HTTP {r.status_code}" if not r.is_success else "no models"}


async def _task_worker(systemctl: Optional[str]) -> dict:
    if not systemctl:
        return {"state": "unknown", "detail": "no systemd on this host"}
    proc = await asyncio.create_subprocess_exec(systemctl, "is-active", "axe-task-worker",
                                                stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.DEVNULL)
    try:
        uit, _ = await asyncio.wait_for(proc.communicate(), TIMEOUT_S)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"state": "unknown", "detail": "systemctl timed out"}
    tekst = uit.decode(errors="replace").strip()
    return {"state": "ok" if tekst == "active" else "fail", "detail": tekst}


async def _veilig(meting: Callable[[], Awaitable[dict]]) -> dict:
    try:
        return await asyncio.wait_for(meting(), TIMEOUT_S + 0.5)
    except asyncio.TimeoutError:
        return {"state": "fail", "detail": "timeout"}
    except (httpx.HTTPError, ValueError, OSError) as e:
        return {"state": "fail", "detail": type(e).__name__}


async def controles(supabase_url: str, supabase_key: str, *, client: Optional[httpx.AsyncClient] = None,
                    systemctl: Optional[str] = None, northsea_url: str = NORTHSEA_MCP_HEALTH,
                    ollama_url: str = OLLAMA_BOX_TAGS,
                    nu: Optional[float] = None, cache: bool = True) -> dict:
    """{"checks": {...}, "degraded": [...], "checked_at": ...}; hooguit eens per CACHE_S."""
    t = time.time() if nu is None else nu
    if cache and _cache.get("tot", 0) > t:
        return _cache["uit"]
    systemctl = systemctl if systemctl is not None else (shutil.which("systemctl") or "")
    eigen = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_S)
    try:
        sb, ns, tw, ob = await asyncio.gather(
            _veilig(lambda: _supabase(client, supabase_url, supabase_key)),
            _veilig(lambda: _northsea(client, northsea_url)),
            _veilig(lambda: _task_worker(systemctl)),
            _veilig(lambda: _ollama_box(client, ollama_url)),
        )
    finally:
        if eigen:
            await client.aclose()
    checks = {"supabase": sb, "cron_tick": beoordeel_tick(_laatste_tick, t), "task_worker": tw, "northsea_mcp": ns,
              "ollama_box": ob}
    uit = {
        "checks": checks,
        "degraded": sorted(k for k, v in checks.items() if v.get("state") == "fail"),
        "checked_at": datetime.fromtimestamp(t, timezone.utc).isoformat(),
    }
    if cache:
        _cache.update(tot=t + CACHE_S, uit=uit)
    return uit
