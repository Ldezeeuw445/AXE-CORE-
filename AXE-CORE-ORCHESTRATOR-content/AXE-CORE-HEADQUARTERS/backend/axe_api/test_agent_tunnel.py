"""De doorstuur-laag naar de Mac mini. Zonder netwerk: httpx.MockTransport is de "Mac"."""
import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

import agent_tunnel
from agent_tunnel import AgentTunnel, _matcht

KEY = "geheim-123"
AUTH = {"Authorization": f"Bearer {KEY}"}


def maak(mac_handler, klok=None):
    """Een app met een eigen route op de VPS en de laag ervoor, met `mac_handler` als Mac."""
    app = FastAPI()
    transport = httpx.MockTransport(mac_handler)
    kw = {"klok": klok} if klok else {}
    tunnel = AgentTunnel("http://mac.test", KEY, transport=transport, **kw)
    app.middleware("http")(tunnel.dispatch)
    # CORS BUITEN de laag, zoals main.py doet.
    app.add_middleware(CORSMiddleware, allow_origins=["https://app.test"], allow_methods=["*"], allow_headers=["*"])

    @app.get("/northsea/overzicht")
    def lokaal_overzicht():
        return {"bron": "vps"}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return TestClient(app), tunnel


def test_matcht_op_padgrens():
    assert _matcht("/northsea", ["/northsea"])
    assert _matcht("/northsea/tab/deals", ["/northsea"])
    assert _matcht("/mcp/hub/servers", ["/mcp/hub"])
    assert not _matcht("/northsea-evil", ["/northsea"])
    assert not _matcht("/northseas/x", ["/northsea"])
    assert not _matcht("/mcp/hubris", ["/mcp/hub"])
    assert not _matcht("/claude/run", ["/northsea", "/mcp/hub"])


def test_een_toegestaan_pad_gaat_naar_de_mac_met_pad_query_en_sleutel():
    gezien = {}

    def mac(req: httpx.Request):
        gezien["url"] = str(req.url)
        gezien["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json={"bron": "mac"})

    client, _ = maak(mac)
    r = client.get("/northsea/overzicht?vers=true", headers=AUTH)
    assert r.json() == {"bron": "mac"}
    assert gezien["url"] == "http://mac.test/northsea/overzicht?vers=true"
    assert gezien["auth"] == f"Bearer {KEY}"


def test_een_post_body_komt_onaangetast_aan():
    gezien = {}

    def mac(req: httpx.Request):
        gezien["body"] = req.content
        gezien["methode"] = req.method
        return httpx.Response(200, json={"ok": True})

    client, _ = maak(mac)
    client.post("/northsea/action/x", content=b'{"params":{"a":1}}', headers={**AUTH, "Content-Type": "application/json"})
    assert gezien["methode"] == "POST"
    assert gezien["body"] == b'{"params":{"a":1}}'


def test_andere_paden_raken_de_mac_nooit():
    aangeroepen = []

    def mac(req):
        aangeroepen.append(str(req.url))
        return httpx.Response(200)

    client, _ = maak(mac)
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/claude/repos", headers=AUTH).status_code == 404
    assert aangeroepen == []


def test_zonder_of_met_foute_sleutel_wordt_er_niet_doorgestuurd():
    aangeroepen = []

    def mac(req):
        aangeroepen.append(1)
        return httpx.Response(200, json={})

    client, _ = maak(mac)
    assert client.get("/northsea/overzicht").status_code == 401
    assert client.get("/northsea/overzicht", headers={"Authorization": "Bearer fout"}).status_code == 401
    assert client.get("/northsea/overzicht", headers={"Authorization": "Basic abc"}).status_code == 401
    assert aangeroepen == []


def test_een_dode_tunnel_valt_terug_op_de_eigen_route_en_wordt_onthouden():
    pogingen = []

    def mac(req):
        pogingen.append(1)
        raise httpx.ConnectError("tunnel dood")

    t = [100.0]
    client, tunnel = maak(mac, klok=lambda: t[0])
    r1 = client.get("/northsea/overzicht", headers=AUTH)
    assert r1.json() == {"bron": "vps"}          # niet kapot: de oude route
    assert tunnel.in_terugval()
    r2 = client.get("/northsea/overzicht", headers=AUTH)
    assert r2.json() == {"bron": "vps"}
    assert len(pogingen) == 1                    # de tweede probeerde de tunnel niet eens

    t[0] += agent_tunnel.TERUGVAL_SECONDEN + 1   # na de wachttijd probeert hij het weer
    client.get("/northsea/overzicht", headers=AUTH)
    assert len(pogingen) == 2


def test_de_mac_die_een_fout_antwoordt_is_een_antwoord_en_geen_tunnelstoring():
    def mac(req):
        return httpx.Response(502, json={"detail": "AXE Commodities niet bereikbaar"})

    client, tunnel = maak(mac)
    r = client.get("/northsea/overzicht", headers=AUTH)
    assert r.status_code == 502
    assert r.json()["detail"].startswith("AXE Commodities")
    assert not tunnel.in_terugval()   # de tunnel werkte; de Mac zei iets


def test_het_antwoord_krijgt_cors_headers_van_de_buitenste_laag():
    def mac(req):
        return httpx.Response(200, json={"bron": "mac"})

    client, _ = maak(mac)
    r = client.get("/northsea/overzicht", headers={**AUTH, "Origin": "https://app.test"})
    assert r.headers.get("access-control-allow-origin") == "https://app.test"


def test_preflight_is_van_cors_en_gaat_niet_naar_de_mac():
    aangeroepen = []

    def mac(req):
        aangeroepen.append(1)
        return httpx.Response(200)

    client, _ = maak(mac)
    r = client.options(
        "/northsea/overzicht",
        headers={"Origin": "https://app.test", "Access-Control-Request-Method": "GET",
                 "Access-Control-Request-Headers": "authorization"},
    )
    assert r.status_code == 200
    assert aangeroepen == []


def test_hop_by_hop_headers_van_de_mac_worden_niet_doorgegeven():
    def mac(req):
        return httpx.Response(200, json={"a": 1}, headers={"Connection": "close", "X-Eigen": "ja"})

    client, _ = maak(mac)
    r = client.get("/northsea/overzicht", headers=AUTH)
    assert r.headers.get("x-eigen") == "ja"
    assert "connection" not in {k.lower() for k in r.headers if k.lower() == "connection" and r.headers[k] == "close"}


def test_bereikbaar_meet_de_health_van_de_mac():
    def mac_goed(req):
        return httpx.Response(200, json={"status": "ok"}) if req.url.path == "/health" else httpx.Response(404)

    def mac_dood(req):
        raise httpx.ConnectError("x")

    _, goed = maak(mac_goed)
    _, dood = maak(mac_dood)
    assert asyncio.run(goed.bereikbaar()) is True
    assert asyncio.run(dood.bereikbaar()) is False
