"""HTTP-surface tests for /revenue.

Mounted on a bare FastAPI app (no auth, no Supabase) so the routes are tested
in isolation from main.py's environment requirements.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from revenue.router import reset_store, router
from revenue.store import JsonStore


@pytest.fixture
def client(tmp_path):
    reset_store(JsonStore(tmp_path / "state.json"))
    app = FastAPI()
    app.include_router(router, prefix="/revenue")
    yield TestClient(app)
    reset_store(None)


def _seeded(client) -> dict:
    client.post("/revenue/harvest", json={"offline": True})
    client.post("/revenue/fuse", json={})
    return client.post("/revenue/offers", json={"target_cents": 33000}).json()


def test_harvest_offline_is_labelled(client):
    body = client.post("/revenue/harvest", json={"offline": True}).json()
    assert body["harvested"] > 0
    assert any("NOT live market evidence" in w for w in body["warnings"])


def test_live_harvest_requires_queries(client):
    assert client.post("/revenue/harvest", json={"offline": False}).status_code == 400


def test_offers_before_fuse_is_409(client):
    assert client.post("/revenue/offers", json={}).status_code == 409


def test_offer_returns_ladder_and_routes(client):
    body = _seeded(client)
    assert [t["rung"] for t in body["offer"]["tiers"]][:2] == ["tripwire", "core"]
    assert body["routes"] and all(r["revenue_cents"] >= 33000 for r in body["routes"])


def test_plan_without_identity_is_400(client):
    _seeded(client)
    r = client.post("/revenue/plan", json={"identity": "", "base_url": "https://ex.com"})
    assert r.status_code == 400
    assert "identity" in r.json()["detail"]


def test_plan_returns_disclosed_assets(client):
    _seeded(client)
    body = client.post(
        "/revenue/plan",
        json={"identity": "axe_kits", "base_url": "https://ex.com/kit",
              "channels": ["forum_answer"]},
    ).json()
    assert body["count"] > 0
    assert all(a["disclosure"] for a in body["assets"])
    assert all("utm_source=forum_answer" in a["tracked_url"] for a in body["assets"])


def test_ledger_roundtrip_and_decisions(client):
    offer = _seeded(client)["offer"]
    payload = {
        "offer_id": offer["id"], "tier_id": offer["tiers"][0]["id"],
        "channel": "forum_answer", "reach": 900, "clicks": 40, "sales": 3,
        "revenue_cents": 5697,
    }
    body = client.post("/revenue/ledger", json=payload).json()
    assert body["totals"]["revenue_cents"] == 5697
    assert body["decisions"][0]["decision"] == "scale"
    assert client.get("/revenue/ledger").json()["count"] == 1


def test_ledger_rejects_unknown_channel(client):
    offer = _seeded(client)["offer"]
    r = client.post("/revenue/ledger", json={
        "offer_id": offer["id"], "tier_id": offer["tiers"][0]["id"],
        "channel": "telepathy", "revenue_cents": 100,
    })
    assert r.status_code == 400


def test_projection_starts_honest(client):
    _seeded(client)
    assert client.get("/revenue/projection").json()["status"] == "insufficient_data"


def test_cycle_returns_a_checklist(client):
    body = client.post("/revenue/cycle", json={
        "offline": True, "identity": "axe_kits", "base_url": "https://ex.com/kit",
    }).json()
    assert body["report"]["assets_queued"] > 0
    assert body["report"]["next_actions"]
    assert body["report"]["revenue_cents_to_date"] == 0


def test_channels_expose_their_rules(client):
    channels = client.get("/revenue/channels").json()["channels"]
    by_name = {c["channel"]: c for c in channels}
    assert by_name["forum_answer"]["requires_disclosure"] is True
    assert all(c["warmup"] for c in channels)
