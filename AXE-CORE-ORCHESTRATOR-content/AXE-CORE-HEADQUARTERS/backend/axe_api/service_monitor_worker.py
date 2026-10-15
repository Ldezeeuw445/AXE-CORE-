"""Onafhankelijke bewaker; gestart via launchd op de Mac mini.

Leest VPS-diensten via de bestaande statusroute, meet de publieke API en
Supabase rechtstreeks. Houdt uitgaande meldingen lokaal vast bij database-uitval.
Geen agentruns, herstarts of modelcalls. Eén proces per host door een OS-slot.
"""
from __future__ import annotations

import asyncio
import fcntl
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv
from service_monitor import ServiceMonitor, STATUS_PATH, USER_ID, utc_now

log = logging.getLogger("axe-service-monitor")


async def http_probe(client, url: str, *, headers=None, params=None, rows: bool = False) -> tuple[str, object | None]:
    try:
        response = await client.get(url, headers=headers, params=params)
        if not response.is_success:
            return "offline", None
        data = response.json()
        if rows and not isinstance(data, list):
            return "offline", None
        if isinstance(data, dict) and (data.get("ok") is False or data.get("status") in ("error", "failed", "unhealthy")):
            return "offline", None
        return "online", data
    except (httpx.HTTPError, ValueError):
        return "offline", None


# Publieke voordeuren van de producten. Alleen de statuscode telt: een 402 van de
# host (Trading OS, 14 okt) of een 5xx is uitval, een redirect naar de app niet.
PRODUCT_PAGES = {
    "axe_core_web": "https://axeheadquarters.com/",
    "companion_web": "https://www.axecompanion.com/robots.txt",
    "trading_os_web": "https://tradingosapp.com/",
    "axon_web": "https://app.axon-memory.com/",
}
NORTHSEA_MCP_HEALTH = "https://mcp.northseacommodity.com/health"


async def page_probe(client, url: str) -> str:
    try:
        response = await client.get(url, follow_redirects=True)
        return "online" if response.is_success else "offline"
    except httpx.HTTPError:
        return "offline"


ENGINE_TICK_MAX_AGE = timedelta(minutes=45)  # elke 15 min een tick; drie gemist is geen ruis meer


async def engine_tick_probe(client, supabase_url: str, key: str, now: datetime | None = None) -> str:
    """Zonder eigen sleutel voor AXE Commodities: de laatste engine-tick in het gedeelde
    project. Die tick leest en schrijft de NorthSea-database echt; op 11 okt stond hij
    22 keer achter elkaar op fail (502) terwijl het platform ACTIVE_HEALTHY meldde.
    Gepauzeerd, verouderd of onleesbaar is onbekend, geen uitval."""
    if not supabase_url or not key:
        return "unconfigured"
    try:
        response = await client.get(supabase_url + "/rest/v1/core_schedules",
                                    headers={"apikey": key, "Authorization": f"Bearer {key}"},
                                    params={"select": "enabled,last_status,last_run_at", "job_key": "eq.northsea:engine"})
        rows = response.json() if response.is_success else None
    except (httpx.HTTPError, ValueError):
        return "unknown"
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict) or rows[0].get("enabled") is False:
        return "unknown"
    row = rows[0]
    if row.get("last_status") == "fail":
        return "offline"
    try:
        ran = datetime.fromisoformat(str(row.get("last_run_at")))
    except ValueError:
        return "unknown"
    fresh = (now or datetime.now(timezone.utc)) - ran <= ENGINE_TICK_MAX_AGE
    return "online" if row.get("last_status") == "ok" and fresh else "unknown"


async def product_probes(client, env=os.environ, *, supabase_url: str = "", key: str = "",
                         now: datetime | None = None) -> dict[str, str]:
    """De hartslag per product. AXE Commodities stond op 11 okt drie dagen stil
    terwijl het platform ACTIVE_HEALTHY meldde: alleen een gelezen rij telt."""
    names = list(PRODUCT_PAGES)
    pages = await asyncio.gather(*(page_probe(client, PRODUCT_PAGES[n]) for n in names))
    results = dict(zip(names, pages))
    results["northsea_mcp"] = (await http_probe(client, NORTHSEA_MCP_HEALTH))[0]
    ns_url = (env.get("NORTHSEA_SUPABASE_URL") or "").strip().rstrip("/")
    ns_key = (env.get("NORTHSEA_SUPABASE_SERVICE_ROLE") or "").strip()
    if ns_url and ns_key:
        results["northsea_db"] = (await http_probe(
            client, ns_url + "/rest/v1/deal_automation_policy", rows=True,
            headers={"apikey": ns_key, "Authorization": f"Bearer {ns_key}"}, params={"select": "id", "limit": "1"}))[0]
    else:
        results["northsea_db"] = await engine_tick_probe(client, supabase_url, key, now)
    return results


async def probes(client, api_url: str, local_url: str, supabase_url: str, key: str) -> dict[str, str]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    api, db, agents = await asyncio.gather(
        http_probe(client, api_url + "/health"),
        http_probe(client, supabase_url + "/rest/v1/core_notifications", headers=headers,
                   params={"select": "id", "limit": "1"}, rows=True),
        http_probe(client, api_url + "/status/vps-agents"),
    )
    results = {"axe_core_api": api[0], "supabase": db[0]}
    if local_url:
        local = await http_probe(client, local_url + "/health")
        results["local_api"] = local[0]
    for component in ("ollama", "docker", "openhands", "crewai", "github"):
        entry = (agents[1] or {}).get(component) if isinstance(agents[1], dict) else None
        if agents[0] != "online" or not isinstance(entry, dict):
            results[component] = "unknown"
        elif not entry.get("configured"):
            results[component] = "unconfigured"
        else:
            results[component] = "online" if entry.get("reachable") is True else "offline"
    results.update(await product_probes(client, supabase_url=supabase_url, key=key))
    return results


async def deliver(client, monitor: ServiceMonitor, supabase_url: str, key: str) -> int:
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "resolution=ignore-duplicates"}
    sent = 0
    for event in monitor.pending():
        # Het vaste UUID maakt een timeout NA de DB-commit veilig om opnieuw
        # te proberen: dezelfde melding kan nooit tweemaal in de bel komen.
        response = await client.post(supabase_url + "/rest/v1/core_notifications", headers=headers,
                                     params={"on_conflict": "id"}, json={
                                         "id": event["id"], "recipient": USER_ID, "type": event["type"],
                                         "message": event["message"], "created_at": utc_now(),
                                     })
        response.raise_for_status()
        monitor.delivered(event["id"])
        sent += 1
    return sent


async def notify_local(monitor) -> None:
    """Op macOS ook buiten de app melden, zelfs als Supabase onbereikbaar is.

    Tekst gaat als argv naar één vast AppleScript: quotes, backticks of URL's
    in een melding kunnen daardoor geen commando uitvoeren.
    """
    if sys.platform != "darwin":
        return
    script = 'on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv)\nend run'
    for event in monitor.local_pending():
        title, _, body = event["message"].partition("\n")
        process = await asyncio.create_subprocess_exec("/usr/bin/osascript", "-e", script, title[:80], body[:1000],
                                                       stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        try:
            await asyncio.wait_for(process.wait(), 5)
            if process.returncode == 0:
                monitor.local_notified(event["id"])
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()


async def tick(client, monitor, api_url, local_url, supabase_url, key):
    at = utc_now()
    results = await probes(client, api_url, local_url, supabase_url, key)
    for component, status in results.items():
        monitor.observe(component, status, at)
    try:
        await notify_local(monitor)
    except OSError:
        log.warning("Lokale melding mislukt; gedeelde aflevering wordt nog geprobeerd")
    try:
        await deliver(client, monitor, supabase_url, key)
        # Dezelfde pushzender kan hier draaien als de observer een eigen
        # VAPID-configuratie heeft. Dan blijft telefoon-push werken als de VPS
        # API/cron stilvalt. Zonder sleutel blijft de bestaande VPS-zender de
        # eigenaar; dat onderscheid komt eerlijk in het statusoverzicht.
        push_state = "vps_sender"
        if os.environ.get("AXE_PUSH_OWNER") == "observer" and os.environ.get("VAPID_PRIVATE_KEY", "").strip():
            try:
                from supabase import create_client
                from push_meldingen import stuur_meldingen
                result = await stuur_meldingen(lambda: create_client(supabase_url, key))
                push_state = "observer_sender" if not result.get("mislukt") else "delivery_failed"
            except Exception:
                push_state = "delivery_failed"
        snapshot = {**monitor.snapshot(at), "push_transport": push_state}
        response = await client.post(supabase_url + "/rest/v1/core_obsidian_notes",
                                    params={"on_conflict": "path"}, headers={
                                        "apikey": key, "Authorization": f"Bearer {key}",
                                        "Prefer": "resolution=merge-duplicates",
                                    }, json={
                                        "path": STATUS_PATH, "title": "AXE service monitoring",
                                        "content": "Measured service status. Two failed readings confirm an outage.",
                                        "tags": ["system", "monitoring"], "source": "system",
                                        "user_id": USER_ID, "metadata": snapshot, "updated_at": at,
                                    })
        response.raise_for_status()
    except httpx.HTTPError:
        # Geen ruwe exception loggen: httpx kan een URL met query of credentials
        # bevatten. De lijst blijft op schijf en wordt de volgende ronde herhaald.
        log.warning("Meldingen/status niet afgeleverd; duurzame uitgaande lijst blijft bewaard")


async def run():
    load_dotenv(os.environ.get("ENV_FILE", ".env.local"))
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE ontbreekt")
    state_dir = Path(os.environ.get("AXE_MONITOR_DIR", str(Path.home() / ".axe" / "monitoring")))
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state_dir / "worker.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        monitor = ServiceMonitor(state_dir / "incidents.sqlite")
        api = os.environ.get("AXE_MONITOR_API_URL", "https://api.axecompanion.com").rstrip("/")
        local = os.environ.get("AXE_MONITOR_LOCAL_URL", f"http://127.0.0.1:{os.environ.get('PORT', '8001')}").rstrip("/")
        async with httpx.AsyncClient(timeout=8.0) as client:
            while True:
                try:
                    await tick(client, monitor, api, local, url, key)
                except Exception as error:
                    log.warning("Meetronde mislukt (%s); bewaker blijft actief", type(error).__name__)
                await asyncio.sleep(60)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
