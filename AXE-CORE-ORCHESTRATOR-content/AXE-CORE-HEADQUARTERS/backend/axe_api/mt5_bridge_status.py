"""Status van de MT5-bridge-server (Strato, 24 nov): verbonden en werkt.

Luka: "de nieuwe vps moet overal te zien zijn in de UI met of hij wel verbonden
is en werkt". Gemeten 24 nov vanaf de iMac: alleen poort 22 staat open, de bridge
heeft (nog) geen health-adres naar buiten. Dus twee eerlijke vragen:

- verbonden: antwoordt de machine (TCP op MT5_BRIDGE_PORT, standaard 22) -- gemeten
  vanaf de API-VPS, met latency;
- werkt: het health-adres van de bridge geeft 2xx met "ok": true (de terminal is
  met de broker verbonden). Sinds 25 nov is dat https://mt5-bridge.axecompanion.com/health
  (Cloudflare-tunnel, geen sleutel, alleen ok en trading); MT5_BRIDGE_HEALTH_URL
  overschrijft het, "off" zet het uit. Zonder adres is het "unmeasured", nooit
  groen op aanname.

26 nov: zonder health-adres bleef het paneel op "bridge not measured" staan, ook
toen de bridge die ochtend uren niet antwoordde (Cloudflare 502). Poort 22 stond
open, dus "verbonden" -- precies het verschil tussen "de server staat aan" en
"de bridge werkt".

Alleen lezen. Dit raakt MT5 of trading zelf niet. /status/vps-agents is open
(geen sleutel), dus het IP-adres gaat niet mee in het antwoord.
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

STANDAARD_HOST = "31.70.196.19"
STANDAARD_HEALTH = "https://mt5-bridge.axecompanion.com/health"


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


def _json(r: Any) -> dict[str, Any]:
    try:
        body = r.json()
    except Exception:  # noqa: BLE001
        return {}
    return body if isinstance(body, dict) else {}


async def meet(client: Any = None, env: dict | None = None) -> dict[str, Any]:
    env = os.environ if env is None else env
    host = (env.get("MT5_BRIDGE_HOST") or STANDAARD_HOST).strip()
    poort = int(env.get("MT5_BRIDGE_PORT") or 22)
    health = (env.get("MT5_BRIDGE_HEALTH_URL") or STANDAARD_HEALTH).strip()
    if health.lower() == "off":
        health = ""
    verbonden, ms = await tcp_open(host, poort)
    bridge = "unmeasured"
    detail = "bridge has no health URL (MT5_BRIDGE_HEALTH_URL is off)"
    if health and client is not None:
        try:
            t0 = time.monotonic()
            r = await client.get(health, timeout=5)
            if ms is None:
                ms = int((time.monotonic() - t0) * 1000)
            if not r.is_success:
                bridge, detail = "down", f"bridge health HTTP {r.status_code}"
            else:
                body = _json(r)
                if body.get("ok") is True:
                    bridge = "ok"
                    detail = "bridge healthy · trading on" if body.get("trading") is True else "bridge healthy · trading off"
                else:
                    # The bridge answers, but its terminal is not logged in at the broker.
                    bridge, detail = "down", "bridge answers, MT5 not connected to the broker"
        except Exception as e:  # noqa: BLE001
            bridge, detail = "down", f"bridge health unreachable: {type(e).__name__}"
    # The tunnel answering proves the box is up, also when port 22 is filtered.
    if bridge == "ok":
        verbonden = True
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
