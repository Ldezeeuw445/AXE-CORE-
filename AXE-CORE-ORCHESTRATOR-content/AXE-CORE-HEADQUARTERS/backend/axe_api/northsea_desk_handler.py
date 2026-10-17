"""NorthSea-desk taken: alleen drafts op 127.0.0.1:8040, nooit verzenden.

Cron-notices landden als capability `northsea_desk`. De VPS-worker kende die
niet en zette ze op failed (`no_handler`). Deze handler belt de bestaande
crew-service (engine tick) in dry_run. auto_send, verstuur en live orders
bestaan hier niet.
"""
from __future__ import annotations

import os
from typing import Any, Callable

import httpx

ENGINE_URL = os.environ.get("NORTHSEA_ENGINE_URL", "http://127.0.0.1:8040/internal/engine/tick")
TOKEN_ENV = "NORTHSEA_ENGINE_TOKEN"
VERBODEN = ("verstuur", "auto_send", "send_email", "place_order", "live_order")


class NorthSeaWeigering(ValueError):
    """Iets dat zou verzenden of geld verzetten. Nooit uitvoeren."""


def mag_niet_verzenden(task: dict[str, Any]) -> str | None:
    """None = drafts-only is ok. Anders de reden om te weigeren."""
    blob = " ".join([
        str(task.get("title") or ""),
        str(task.get("goal") or ""),
        str(task.get("execution_mode") or ""),
        str((task.get("payload") or {})),
        str((task.get("metadata") or {})),
    ]).lower()
    if task.get("execution_mode") == "execute" and "send" in blob:
        return "northsea_desk never sends"
    for woord in VERBODEN:
        if woord in blob and "dry_run" not in blob:
            # 'send' in een notice-tekst ("Copper PO sent") is geschiedenis, geen opdracht.
            if woord == "verstuur" or woord == "auto_send" or "send=true" in blob or '"send": true' in blob:
                return f"northsea_desk refused '{woord}'"
    if '"send": true' in blob or "'send': true" in blob or "auto_send" in blob:
        return "northsea_desk never sends"
    return None


def dry_run_tick(
    *,
    token: str | None = None,
    url: str | None = None,
    post: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Eén engine-tick, altijd dry_run=1. Geen send."""
    sleutel = (token if token is not None else os.environ.get(TOKEN_ENV, "")).strip()
    if not sleutel:
        raise RuntimeError(
            "NorthSea crew at 127.0.0.1:8040 has no token. Reconnect the NorthSea account."
        )
    doel = url or ENGINE_URL
    client = post
    if client is None:
        def client(u: str, **kw: Any) -> Any:
            with httpx.Client(timeout=60) as c:
                return c.post(u, **kw)

    r = client(doel, params={"dry_run": "1"}, headers={"Authorization": f"Bearer {sleutel}"})
    try:
        data = r.json()
    except Exception:  # noqa: BLE001
        data = {"raw": (getattr(r, "text", "") or "")[:500]}
    if getattr(r, "status_code", 0) >= 400:
        raise RuntimeError(
            f"NorthSea crew at 127.0.0.1:8040 answered HTTP {r.status_code}. Reconnect the desk."
        )
    if int(data.get("sent") or 0) != 0:
        raise NorthSeaWeigering("crew tick reported sent>0 in dry_run — aborting, nothing extra sent here")
    return data


async def northsea_desk_handler(task: dict[str, Any], context: Any) -> dict[str, Any]:
    reden = mag_niet_verzenden(task)
    if reden:
        raise NorthSeaWeigering(reden)
    await context.event("axe.progress", "NorthSea desk: drafting only, never sending.")
    data = dry_run_tick()
    notices = list(data.get("notices") or [])
    samenvatting = data.get("summary") or {}
    return {
        "summary": (
            f"NorthSea draft tick: {len(notices)} notice(s), sent 0, dry_run yes. "
            f"{samenvatting}"
        )[:800],
        "sent": 0,
        "dry_run": True,
        "notices": notices[:8],
        "http_ok": True,
    }
