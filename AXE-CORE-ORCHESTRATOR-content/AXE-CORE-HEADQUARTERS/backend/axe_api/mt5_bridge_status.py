"""Status van de MT5-bridge-server (Strato, 24 nov): verbonden en werkt.

Luka: "de nieuwe vps moet overal te zien zijn in de UI met of hij wel verbonden
is en werkt". Gemeten 24 nov vanaf de iMac: alleen poort 22 staat open, de bridge
heeft (nog) geen health-adres naar buiten. Dus twee eerlijke vragen:

- verbonden: antwoordt de machine (TCP op MT5_BRIDGE_PORT, standaard 22) -- gemeten
  vanaf de API-VPS, met latency;
- werkt: alleen als MT5_BRIDGE_HEALTH_URL gezet is en 2xx geeft. Zonder dat adres
  is het "unmeasured", nooit groen op aanname.

Alleen lezen. Dit raakt MT5 of trading zelf niet. /status/vps-agents is open
(geen sleutel), dus het IP-adres gaat niet mee in het antwoord.
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

STANDAARD_HOST = "31.70.196.19"


def stand(verbonden: bool, bridge: str) -> str:
    """works | connected | bridge_down | offline -- wat de UI als één woord toont."""
    if not verbonden:
        return "offline"
    if bridge == "ok":
        return "works"
    if bridge == "down":
        return "bridge_down"
    return "connected"


async def tcp_open(host: str, poort: int, timeout: float = 4.0) -> tuple[bool, int | None]:
    t0 = time.monotonic()
    try:
        _r, w = await asyncio.wait_for(asyncio.open_connection(host, poort), timeout)
        w.close()
        try:
            await w.wait_closed()
        except Exception:  # noqa: BLE001
            pass
        return True, int((time.monotonic() - t0) * 1000)
    except (OSError, asyncio.TimeoutError):
        return False, None


async def meet(client: Any = None, env: dict | None = None) -> dict[str, Any]:
    env = os.environ if env is None else env
    host = (env.get("MT5_BRIDGE_HOST") or STANDAARD_HOST).strip()
    poort = int(env.get("MT5_BRIDGE_PORT") or 22)
    health = (env.get("MT5_BRIDGE_HEALTH_URL") or "").strip()
    verbonden, ms = await tcp_open(host, poort)
    bridge = "unmeasured"
    detail = "bridge has no health URL yet (set MT5_BRIDGE_HEALTH_URL on the API VPS)"
    if health and verbonden and client is not None:
        try:
            r = await client.get(health, timeout=5)
            bridge = "ok" if r.is_success else "down"
            detail = f"bridge health HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            bridge, detail = "down", f"bridge health unreachable: {type(e).__name__}"
    if not verbonden:
        detail = "server does not answer"
    return {
        "configured": True,
        "reachable": verbonden,
        "latency_ms": ms,
        "bridge": bridge,
        "stand": stand(verbonden, bridge),
        "detail": detail,
        "label": "MT5 bridge (Strato)",
    }
