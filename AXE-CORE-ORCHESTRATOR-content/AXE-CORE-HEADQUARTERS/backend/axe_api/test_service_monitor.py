import asyncio
import json

import httpx

from service_monitor import ServiceMonitor
from service_monitor_worker import deliver, probes, tick
from service_probes import http_health


def monitor(tmp_path):
    return ServiceMonitor(tmp_path / "monitor.sqlite")


def readings(m, *states):
    for index, state in enumerate(states):
        m.observe("ollama", state, f"2026-10-14T12:{index:02}:00+00:00")


def test_transient_failure_is_silent(tmp_path):
    m = monitor(tmp_path)
    readings(m, "online", "offline", "online")
    assert m.pending() == []


def test_two_failed_readings_emit_once_even_when_service_never_worked(tmp_path):
    m = monitor(tmp_path)
    readings(m, "offline", "offline", "offline", "offline")
    assert len(m.pending()) == 1
    assert m.pending()[0]["type"] == "error"
    assert "Impact:" in m.pending()[0]["message"]
    assert "First step:" in m.pending()[0]["message"]


def test_restart_does_not_repeat_known_incident(tmp_path):
    m = monitor(tmp_path)
    readings(m, "online", "offline", "offline")
    alert = m.pending()[0]
    m.delivered(alert["id"])
    m.db.close()
    restarted = monitor(tmp_path)
    readings(restarted, "offline", "offline")
    assert restarted.pending() == []


def test_recovery_is_confirmed_and_only_reported_for_a_reported_outage(tmp_path):
    m = monitor(tmp_path)
    readings(m, "online", "offline", "offline")
    m.delivered(m.pending()[0]["id"])
    m.observe("ollama", "online")
    assert m.pending() == []
    m.observe("ollama", "online")
    assert len(m.pending()) == 1 and m.pending()[0]["type"] == "success"
    m.observe("ollama", "online")
    assert len(m.pending()) == 1


def test_unknown_breaks_confirmation_and_does_not_create_an_outage(tmp_path):
    m = monitor(tmp_path)
    readings(m, "online", "offline", "unknown", "offline")
    assert m.pending() == []
    m.observe("ollama", "offline")
    assert len(m.pending()) == 1


def test_unconfigured_services_are_not_broken(tmp_path):
    m = monitor(tmp_path)
    readings(m, "unconfigured", "unconfigured")
    assert m.pending() == []
    assert m.snapshot()["services"][0]["confirmed"] is None


def test_superseded_unseen_outage_is_not_sent_after_database_recovery(tmp_path):
    m = monitor(tmp_path)
    readings(m, "online", "offline", "offline", "online", "online")
    assert m.pending() == []


def test_locally_reported_outage_still_gets_recovery(tmp_path):
    m = monitor(tmp_path)
    readings(m, "online", "offline", "offline")
    m.local_notified(m.pending()[0]["id"])
    m.observe("ollama", "online")
    m.observe("ollama", "online")
    assert [r["type"] for r in m.pending()] == ["success"]


def test_database_timeout_keeps_same_uuid_for_retry(tmp_path):
    m = monitor(tmp_path)
    readings(m, "offline", "offline")
    sent = []

    def handler(request):
        sent.append(json.loads(request.content))
        if len(sent) == 1:
            raise httpx.ReadTimeout("response lost after commit", request=request)
        return httpx.Response(201)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            try:
                await deliver(client, m, "https://project.supabase.co", "test-secret")
            except httpx.ReadTimeout:
                pass
            assert len(m.pending()) == 1
            await deliver(client, m, "https://project.supabase.co", "test-secret")
    asyncio.run(run())
    assert sent[0]["id"] == sent[1]["id"]
    assert m.pending() == []


def test_api_failure_does_not_fabricate_five_child_outages():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(503))) as client:
            results = await probes(client, "https://api.example", "", "https://project.supabase.co", "test-secret")
            assert results["axe_core_api"] == "offline"
            assert all(results[name] == "unknown" for name in ("ollama", "docker", "crewai", "openhands", "github"))
    asyncio.run(run())


def test_real_status_probe_and_notification_pipeline(tmp_path):
    m = monitor(tmp_path)
    delivered_rows = []

    def handler(request):
        if request.method == "POST":
            row = json.loads(request.content)
            if request.url.path.endswith("core_notifications"):
                delivered_rows.append(row)
            return httpx.Response(201)
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path.endswith("core_notifications"):
            return httpx.Response(200, json=[])
        return httpx.Response(200, json={name: {"configured": True, "reachable": name != "ollama"}
                                         for name in ("ollama", "docker", "crewai", "openhands", "github")})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            for _ in range(3):
                await tick(client, m, "https://api.example", "", "https://project.supabase.co", "test-secret")
    asyncio.run(run())
    assert len(delivered_rows) == 1 and "Ollama" in delivered_rows[0]["message"]
    assert delivered_rows[0]["recipient"] == "acff7a12-1111-481d-a7a9-cc07583b8069"


def test_404_401_and_semantic_errors_are_not_healthy():
    async def run():
        for status, body in ((404, {}), (401, {}), (200, {"status": "error"}), (200, {"ok": False})):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(status, json=body))) as client:
                assert not (await http_health(client, "http://service/health"))["reachable"]
    asyncio.run(run())


def test_ollama_needs_a_real_models_response():
    async def run():
        for body, expected in (({"models": []}, True), ({"unrelated": True}, False)):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body))) as client:
                assert (await http_health(client, "http://ollama/api/tags", models=True))["reachable"] == expected
    asyncio.run(run())


def test_every_product_has_its_own_heartbeat():
    """Docs/programma: vijf producten, elk een eigen meting. Trading OS gaf op 14 okt
    een 402 van de host; dat is uitval, ook al antwoordt de server."""
    from service_monitor import COMPONENTS
    from service_monitor_worker import product_probes

    def handler(request):
        if request.url.host == "tradingosapp.com":
            return httpx.Response(402, text="DEPLOYMENT_DISABLED")
        if request.url.path == "/health":
            return httpx.Response(200, json={"status": "ok", "version": "1.4.1"})
        return httpx.Response(200, text="<html></html>")

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await product_probes(client, env={})
    results = asyncio.run(run())
    assert set(results) == {"axe_core_web", "companion_web", "trading_os_web", "axon_web", "northsea_mcp", "northsea_db"}
    assert set(results) <= set(COMPONENTS)
    assert results["trading_os_web"] == "offline"
    assert results["axon_web"] == "online" and results["northsea_mcp"] == "online"
    # Zonder sleutel geen verzonnen uitval: eerlijk niet ingesteld.
    assert results["northsea_db"] == "unconfigured"


def test_northsea_db_counts_only_a_real_row_read():
    """Op 11 okt gaf AXE Commodities 522 aan de rand terwijl het platform gezond meldde."""
    from service_monitor_worker import product_probes
    env = {"NORTHSEA_SUPABASE_URL": "https://northsea.supabase.co", "NORTHSEA_SUPABASE_SERVICE_ROLE": "test-secret"}
    seen = []

    def make(db_response):
        def handler(request):
            if request.url.host == "northsea.supabase.co":
                seen.append(request)
                if isinstance(db_response, Exception):
                    raise db_response
                return db_response
            return httpx.Response(200, json={"status": "ok"})
        return handler

    async def run(db_response):
        async with httpx.AsyncClient(transport=httpx.MockTransport(make(db_response))) as client:
            return (await product_probes(client, env=env))["northsea_db"]

    assert asyncio.run(run(httpx.Response(200, json=[{"id": 1}]))) == "online"
    assert asyncio.run(run(httpx.Response(200, json=[]))) == "online"
    assert asyncio.run(run(httpx.Response(522, text="origin timeout"))) == "offline"
    assert asyncio.run(run(httpx.Response(200, json={"message": "not a list"}))) == "offline"
    assert asyncio.run(run(httpx.ReadTimeout("timeout"))) == "offline"
    assert seen[0].url.path == "/rest/v1/deal_automation_policy"
    assert seen[0].headers["apikey"] == "test-secret"
