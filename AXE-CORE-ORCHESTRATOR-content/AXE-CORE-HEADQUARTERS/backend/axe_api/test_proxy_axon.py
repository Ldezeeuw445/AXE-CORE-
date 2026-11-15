"""AXON via de VPS: alleen de twee bekende paden, de sleutel als Bearer.

Er gaat hier geen echt verzoek naar AXON uit; httpx.AsyncClient is nagebootst.
"""
import os
import tempfile

os.environ.setdefault("AXE_API_KEY", "test-sleutel")
os.environ.setdefault("SUPABASE_URL", "http://localhost.invalid")
os.environ.setdefault("SUPABASE_SERVICE_ROLE", "test-service-role")
if "WORKSPACE_DIR" not in os.environ:
    os.environ["WORKSPACE_DIR"] = tempfile.mkdtemp(prefix="axe-test-workspace-")

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

SLEUTEL = {"Authorization": f"Bearer {main.AXE_API_KEY}"}


class NepAntwoord:
    status_code = 200
    content = b'{"pack":"Luka wil NorthSea eerst."}'
    headers = {"content-type": "application/json"}


class NepClient:
    gezien: list = []

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get(self, url, headers=None, params=None):
        NepClient.gezien.append(("GET", url, headers, params))
        return NepAntwoord()

    async def post(self, url, headers=None, json=None):
        NepClient.gezien.append(("POST", url, headers, json))
        return NepAntwoord()


def test_onbekend_pad_wordt_geweigerd(monkeypatch):
    monkeypatch.setattr(main.httpx, "AsyncClient", NepClient)
    r = TestClient(main.app).post("/proxy/axon", headers=SLEUTEL,
                                  json={"path": "../admin", "key": "axon_live_x"})
    assert r.status_code == 400


def test_zonder_sleutel_geen_aanroep(monkeypatch):
    monkeypatch.delenv("AXON_API_KEY", raising=False)
    NepClient.gezien = []
    monkeypatch.setattr(main.httpx, "AsyncClient", NepClient)
    r = TestClient(main.app).post("/proxy/axon", headers=SLEUTEL, json={"path": "remember"})
    assert r.status_code == 503 and NepClient.gezien == []


def test_context_pack_gaat_door_met_bearer(monkeypatch):
    NepClient.gezien = []
    monkeypatch.setattr(main.httpx, "AsyncClient", NepClient)
    r = TestClient(main.app).post("/proxy/axon", headers=SLEUTEL, json={
        "path": "context-pack", "key": "axon_live_abc", "query": {"query": "NorthSea", "limit_tokens": 150}})
    assert r.status_code == 200 and r.json()["pack"].startswith("Luka")
    methode, url, kop, params = NepClient.gezien[0]
    assert methode == "GET" and url.endswith("/functions/v1/context-pack")
    assert kop["Authorization"] == "Bearer axon_live_abc"
    assert params == {"query": "NorthSea", "limit_tokens": "150"}


def test_zonder_axe_sleutel_dicht():
    r = TestClient(main.app).post("/proxy/axon", json={"path": "remember", "key": "k"})
    assert r.status_code in (401, 403)
