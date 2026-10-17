import asyncio
import json
from datetime import datetime, timezone

import httpx

import eigenaar_acties as ea

SB = "https://project.supabase.co"
NS = "https://northsea.supabase.co"
AX = "https://axon.supabase.co"
NS_ENV = {"NORTHSEA_SUPABASE_URL": NS, "NORTHSEA_SUPABASE_SERVICE_ROLE": "ns-secret",
          "AXON_SUPABASE_URL": AX, "AXON_SUPABASE_ANON_KEY": "anon-public"}
# 17 okt 2026, 09:30 in Amsterdam (CEST, UTC+2).
NA_ACHT = datetime(2026, 10, 17, 7, 30, tzinfo=timezone.utc)
VOOR_ACHT = datetime(2026, 10, 17, 5, 30, tzinfo=timezone.utc)


def wereld(gedaan: bool, lus_rijen: int | None = None, functions_live: bool | None = None):
    """Een nep-internet waarin alles gedaan is, of niets."""
    posts = []

    def handler(request: httpx.Request):
        pad = request.url.path
        if request.method == "POST":
            posts.append(json.loads(request.content))
            return httpx.Response(201)
        if request.url.host == "mcp.axon-memory.com":
            live = gedaan if functions_live is None else functions_live
            return httpx.Response(200, json={"code_challenge_methods_supported": ["S256"] if live else ["S256", "plain"]})
        if request.url.host == "app.axon-memory.com":
            if pad == "/":
                return httpx.Response(200, text='<script type="module" src="/assets/index-AbC_1.js"></script>')
            tekst = "x;" + (ea.AXON_CONSENT_TEKST + ". It calls itself" if gedaan else "Approve") + ";y"
            return httpx.Response(200, text=tekst)
        if request.url.host == "axon.supabase.co":
            return httpx.Response(401, json={"code": "42501"}) if gedaan else httpx.Response(200, json=[])
        if pad.endswith("/action_queue"):
            n = lus_rijen if lus_rijen is not None else (3 if gedaan else 146)
            return httpx.Response(206, headers={"content-range": f"0-0/{n}"}, json=[{"id": "x"}])
        if pad.endswith("/core_bouw_apps"):
            return httpx.Response(200, json=[{"repo": r, "opdracht": "PROGRAMME ..." if gedaan else None}
                                             for r in ea.BOUW_REPOS])
        if pad.endswith("/registered_apps"):
            if not gedaan:
                return httpx.Response(400, json={"code": "42703"})
            return httpx.Response(200, json=[{"product_key": "northsea"}])
        if request.url.host == "mcp.northseacommodity.com":
            return httpx.Response(200, json={"status": "ok", "version": "1.5.0" if gedaan else "1.4.1"})
        if request.url.host == "api.axecompanion.com" and pad == "/health":
            body = {"status": "ok"}
            if gedaan:
                body.update(checks={"supabase": {"state": "ok"}}, degraded=[])
            return httpx.Response(200, json=body)
        if pad.endswith("/core_axe_devices"):
            if gedaan:
                return httpx.Response(200, json=[{
                    "device_id": "a17",
                    "platform": "android",
                    "device_type": "mobile",
                    "capabilities": ["mobile", "native_notify"],
                    "last_seen": "2026-10-17T07:29:00+00:00",
                }])
            return httpx.Response(200, json=[])
        if pad.endswith("/core_schedules"):
            return httpx.Response(200, json=[{"enabled": not gedaan}])
        return httpx.Response(404)

    return handler, posts


def meet(handler, env=NS_ENV, nu=NA_ACHT):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await ea.meet(client, SB, "secret", env, nu)
    return asyncio.run(run())


def test_alles_gedaan_meet_elke_stap_als_gedaan():
    handler, _ = wereld(gedaan=True)
    stand = meet(handler)
    assert [a["id"] for a in stand] == [a["id"] for a in ea.ACTIES]
    assert all(a["done"] is True for a in stand), stand


def test_phone_push_meet_native_notify_niet_web_push():
    handler, _ = wereld(gedaan=True)
    stand = {a["id"]: a for a in meet(handler)}
    assert stand["phone-push"]["done"] is True
    assert "native_notify" in stand["phone-push"]["measured"]
    handler0, _ = wereld(gedaan=False)
    stand0 = {a["id"]: a for a in meet(handler0)}
    assert stand0["phone-push"]["done"] is False
    assert "web-push" not in stand0["phone-push"]["measured"]
    assert "native_notify" in stand0["phone-push"]["measured"]


def test_niets_gedaan_meet_elke_stap_als_open_met_wat_er_gemeten_is():
    handler, _ = wereld(gedaan=False)
    stand = {a["id"]: a for a in meet(handler)}
    assert all(a["done"] is False for a in stand.values()), stand
    assert "146 action_queue rows" in stand["northsea-engine-fix"]["measured"]
    assert "plain" in stand["axon-pr2-live"]["measured"]
    assert "old policy" in stand["axon-key-migration"]["measured"]
    assert "no product_key column" in stand["product-registry"]["measured"]


def test_northsea_zonder_eigen_sleutel_is_onmeetbaar_en_niet_stil_gedaan():
    handler, _ = wereld(gedaan=True)
    stand = {a["id"]: a for a in meet(handler, env={})}
    assert stand["northsea-engine-fix"]["done"] is None
    assert "cannot measure" in stand["northsea-engine-fix"]["measured"]


def test_axon_functions_live_maar_frontend_oud_is_niet_af():
    handler, _ = wereld(gedaan=False, functions_live=True)
    stand = {a["id"]: a for a in meet(handler)}
    assert stand["axon-pr2-live"]["done"] is False
    assert stand["axon-pr2-live"]["measured"] == "functions live, frontend still the old build"


def test_axon_migratie_zonder_anon_sleutel_is_onmeetbaar():
    handler, _ = wereld(gedaan=True)
    stand = {a["id"]: a for a in meet(handler, env={})}
    assert stand["axon-key-migration"]["done"] is None


def test_meet_af_en_toe_meet_hooguit_eens_per_kwartier():
    teller = {"n": 0}
    handler0, _ = wereld(gedaan=True)

    def handler(request):
        teller["n"] += 1
        return handler0(request)

    async def run():
        ea._CACHE.clear()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await ea.meet_af_en_toe(client, SB, "secret", NS_ENV, NA_ACHT)
            na_eerste = teller["n"]
            await ea.meet_af_en_toe(client, SB, "secret", NS_ENV, NA_ACHT + ea.MEET_ELKE / 2)
            gelijk = teller["n"] == na_eerste
            await ea.meet_af_en_toe(client, SB, "secret", NS_ENV, NA_ACHT + ea.MEET_ELKE)
            return gelijk, teller["n"] > na_eerste
    assert asyncio.run(run()) == (True, True)
    ea._CACHE.clear()


def test_northsea_drempel():
    handler, _ = wereld(gedaan=True, lus_rijen=ea.NORTHSEA_LUS_DREMPEL + 1)
    stand = {a["id"]: a for a in meet(handler)}
    assert stand["northsea-engine-fix"]["done"] is False


def test_een_kapotte_verbinding_geeft_onbekend_in_plaats_van_een_crash():
    def handler(request):
        raise httpx.ConnectError("weg", request=request)
    stand = meet(handler)
    assert all(a["done"] is None for a in stand)


def test_herinnering_pas_vanaf_acht_uur_en_een_keer_per_dag():
    handler, _ = wereld(gedaan=False)
    stand = meet(handler)
    assert ea.herinnering(stand, VOOR_ACHT, None) is None
    datum, tekst = ea.herinnering(stand, NA_ACHT, None)
    assert datum == "2026-10-17"
    assert tekst.startswith("Owner actions: 9 open\n1. NorthSea")
    assert "deploy.sh check" in tekst
    assert ea.herinnering(stand, NA_ACHT, "2026-10-17") is None


def test_geen_herinnering_als_alles_gedaan_is():
    handler, _ = wereld(gedaan=True)
    assert ea.herinnering(meet(handler), NA_ACHT, None) is None


def test_herinner_schrijft_een_rij_per_dag_met_vast_id(tmp_path):
    handler, posts = wereld(gedaan=False)
    stand = meet(handler)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            eerste = await ea.herinner(client, SB, "secret", stand, NA_ACHT, tmp_path)
            tweede = await ea.herinner(client, SB, "secret", stand, NA_ACHT, tmp_path)
            return eerste, tweede
    assert asyncio.run(run()) == (True, False)
    assert len(posts) == 1
    rij = posts[0]
    assert rij["recipient"] == ea.USER_ID and rij["type"] == "warning"
    assert rij["message"].startswith("Owner actions: 9 open")
    # Zelfde datum, zelfde id: een herhaalde poging na een timeout wordt geen tweede rij.
    assert rij["id"] == "%s" % ea.uuid.uuid5(ea.uuid.NAMESPACE_URL, "axe-eigenaar-acties/2026-10-17")


def test_mislukte_aflevering_telt_niet_als_herinnerd(tmp_path):
    def handler(request):
        if request.method == "POST":
            return httpx.Response(503)
        return wereld(gedaan=False)[0](request)
    stand = meet(handler)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            try:
                await ea.herinner(client, SB, "secret", stand, NA_ACHT, tmp_path)
            except httpx.HTTPStatusError:
                pass
    asyncio.run(run())
    assert not (tmp_path / "eigenaar_acties.json").exists()
