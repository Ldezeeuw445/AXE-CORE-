import asyncio
import stat

import httpx

import gezondheid as gz

SB = "https://project.supabase.co"


def client(supabase_ok=True, northsea_ok=True, ollama_ok=True):
    def handler(request: httpx.Request):
        if request.url.host == "ollama.axecompanion.com":
            if ollama_ok:
                return httpx.Response(200, json={"models": [{"name": "hermes3:8b"}, {"name": "qwen2.5-coder:7b"}]})
            return httpx.Response(401, text="<html>401 Authorization Required</html>")
        if request.url.host == "project.supabase.co":
            return httpx.Response(200 if supabase_ok else 503, json=[{"id": "x"}] if supabase_ok else {})
        if request.url.host == "127.0.0.1":
            if northsea_ok:
                return httpx.Response(200, json={"status": "ok", "version": "1.4.1"})
            return httpx.Response(502)
        return httpx.Response(404)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def nep_systemctl(tmp_path, antwoord: str) -> str:
    pad = tmp_path / "systemctl"
    pad.write_text(f"#!/bin/sh\necho {antwoord}\n")
    pad.chmod(pad.stat().st_mode | stat.S_IEXEC)
    return str(pad)


def meet(**kw):
    async def run():
        async with kw.pop("c") as c:
            return await gz.controles(SB, "secret", client=c, cache=False, **kw)
    return asyncio.run(run())


def test_alles_gezond(tmp_path):
    gz.tick_ontvangen(1_000.0)
    uit = meet(c=client(), systemctl=nep_systemctl(tmp_path, "active"), nu=1_030.0)
    assert uit["degraded"] == []
    assert uit["checks"]["northsea_mcp"] == {"state": "ok", "version": "1.4.1"}
    assert uit["checks"]["cron_tick"] == {"state": "ok", "age_s": 30}
    assert uit["checks"]["task_worker"]["state"] == "ok"
    assert uit["checks"]["ollama_box"] == {"state": "ok", "models": 2}
    assert uit["checks"]["memory_cap"]["state"] == "ok"
    assert uit["warnings"] == []


def test_elke_kapotte_afhankelijkheid_staat_in_degraded(tmp_path):
    gz.tick_ontvangen(1_000.0)
    uit = meet(c=client(supabase_ok=False, northsea_ok=False, ollama_ok=False),
               systemctl=nep_systemctl(tmp_path, "inactive"), nu=1_000.0 + gz.TICK_MAX_S + 1)
    assert uit["degraded"] == ["cron_tick", "northsea_mcp", "ollama_box", "supabase", "task_worker"]
    assert uit["checks"]["ollama_box"] == {"state": "fail", "detail": "HTTP 401"}


def test_zonder_systemd_is_de_worker_onbekend_en_niet_kapot():
    gz.tick_ontvangen(1_000.0)
    uit = meet(c=client(), systemctl="", nu=1_010.0)
    assert uit["checks"]["task_worker"]["state"] == "unknown"
    assert "task_worker" not in uit["degraded"]


def test_geen_tick_sinds_de_start_is_onbekend():
    assert gz.beoordeel_tick(None, 5.0)["state"] == "unknown"


def test_een_verbindingsfout_wordt_fail_en_geen_crash():
    def handler(request):
        raise httpx.ConnectError("weg", request=request)
    uit = meet(c=httpx.AsyncClient(transport=httpx.MockTransport(handler)), systemctl="", nu=10.0)
    assert uit["checks"]["supabase"] == {"state": "fail", "detail": "ConnectError"}
    assert uit["checks"]["northsea_mcp"]["state"] == "fail"


def test_cache_meet_hooguit_eens_per_venster():
    teller = {"n": 0}

    def handler(request):
        teller["n"] += 1
        return httpx.Response(200, json={"status": "ok"})

    async def run():
        gz._cache.clear()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            await gz.controles(SB, "k", client=c, systemctl="", nu=100.0)
            na_eerste = teller["n"]
            await gz.controles(SB, "k", client=c, systemctl="", nu=100.0 + gz.CACHE_S / 2)
            gelijk = teller["n"] == na_eerste
            await gz.controles(SB, "k", client=c, systemctl="", nu=100.0 + gz.CACHE_S + 1)
            return gelijk, teller["n"] > na_eerste
    assert asyncio.run(run()) == (True, True)
    gz._cache.clear()


def test_memory_cap_is_waarschuwing_niet_degraded(tmp_path):
    gz.tick_ontvangen(1_000.0)

    def handler(request: httpx.Request):
        if "/rest/v1/memory" in str(request.url):
            return httpx.Response(200, json=[{"agent": "axe_trader"}] * gz.GEHEUGEN_MAG_PER_DAG)
        if request.url.host == "ollama.axecompanion.com":
            return httpx.Response(200, json={"models": [{"name": "hermes3:8b"}]})
        if request.url.host == "project.supabase.co":
            return httpx.Response(200, json=[{"id": "x"}])
        if request.url.host == "127.0.0.1":
            return httpx.Response(200, json={"status": "ok", "version": "1.4.1"})
        return httpx.Response(404)

    uit = meet(c=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
               systemctl=nep_systemctl(tmp_path, "active"), nu=1_030.0)
    assert "memory_cap" in uit["warnings"]
    assert "memory_cap" not in uit["degraded"]
    assert uit["checks"]["memory_cap"]["state"] == "warn"


def test_niet_geconfigureerd_supabase_is_onbekend():
    async def run():
        async with client() as c:
            return await gz.controles("", "", client=c, systemctl="", nu=1.0, cache=False)
    assert asyncio.run(run())["checks"]["supabase"]["state"] == "unknown"

