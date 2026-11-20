"""Luka keurt goed vanuit AXE met zijn eigen inlog (17 nov 2026)."""
import httpx
import pytest

from northsea_mcp.server import create_app
from tests.conftest import PUBLIC, USER
from tests.fakes import DRAFT_PENDING, OPP as OPP_ID, TASK

GOED, ANDER = "luka-sessie", "iemand-anders"


def supabase_user(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/auth/v1/user"):
        tok = request.headers.get("authorization", "")
        if tok == f"Bearer {GOED}":
            return httpx.Response(200, json={"id": USER})
        if tok == f"Bearer {ANDER}":
            return httpx.Response(200, json={"id": "not-on-allowlist"})
        return httpx.Response(401, json={"msg": "invalid JWT"})
    return httpx.Response(404)


@pytest.fixture
def h(settings, repo, research, crew, store, auditor):
    http = httpx.AsyncClient(transport=httpx.MockTransport(supabase_user))
    app = create_app(settings, repo=repo, research=research, crew=crew, store=store, auditor=auditor, http=http)
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC)


async def test_alleen_luka_zelf_kan_goedkeuren(h, repo):
    for tok in ("", "nep", ANDER):
        r = await h.post("/human/drafts/approve-send", json={"draft_ids": [DRAFT_PENDING]},
                         headers={"Authorization": f"Bearer {tok}"} if tok else {})
        assert r.status_code == 401, tok
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == DRAFT_PENDING)
    assert d["approval_status"] == "pending" and not d.get("sent_at")


async def test_luka_keurt_goed_en_hij_gaat_weg(h, repo):
    r = await h.post("/human/drafts/approve-send", json={"draft_ids": [DRAFT_PENDING]},
                     headers={"Authorization": f"Bearer {GOED}"})
    assert r.status_code == 200, r.text
    uit = r.json()["results"][0]
    assert uit["ok"] and uit["sent"], uit
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == DRAFT_PENDING)
    assert d["approved_by"] == USER and d["approval_actor_type"] == "human"


async def test_zonder_mens_op_de_lijst_gaat_er_niets(h, repo, monkeypatch):
    monkeypatch.setenv("NORTHSEA_HUMAN_PRINCIPALS", "")
    r = await h.post("/human/drafts/approve-send", json={"draft_ids": [DRAFT_PENDING]},
                     headers={"Authorization": f"Bearer {GOED}"})
    assert r.json()["results"][0]["code"] == "human_approval_required"
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == DRAFT_PENDING)
    assert d["approval_status"] == "pending"


async def test_rare_ids_worden_geweigerd(h):
    r = await h.post("/human/drafts/approve-send", json={"draft_ids": ["'; drop table"]},
                     headers={"Authorization": f"Bearer {GOED}"})
    assert r.status_code == 400


async def test_decide_approve_wacht_niet_op_send(h, repo):
    r = await h.post("/human/drafts/decide", json={"draft_ids": [DRAFT_PENDING], "action": "approve"},
                     headers={"Authorization": f"Bearer {GOED}"})
    assert r.status_code == 200, r.text
    uit = r.json()["results"][0]
    assert uit["ok"] and uit["action"] == "approve" and not uit.get("sent")
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == DRAFT_PENDING)
    assert d["approval_status"] == "approved" and d["approval_actor_type"] == "human"
    assert repo.sends == []


async def test_decide_reject_is_human_en_verstuurt_niet(h, repo):
    r = await h.post("/human/drafts/decide", json={"draft_ids": [DRAFT_PENDING], "action": "reject"},
                     headers={"Authorization": f"Bearer {GOED}"})
    assert r.status_code == 200, r.text
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == DRAFT_PENDING)
    assert d["approval_status"] == "rejected" and d["approval_actor_type"] == "human"
    assert repo.sends == []


async def test_decide_zonder_mens_keurt_niet_goed(h, repo, monkeypatch):
    monkeypatch.setenv("NORTHSEA_HUMAN_PRINCIPALS", "")
    r = await h.post("/human/drafts/decide", json={"draft_ids": [DRAFT_PENDING], "action": "approve"},
                     headers={"Authorization": f"Bearer {GOED}"})
    assert r.json()["results"][0]["code"] == "human_approval_required"
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == DRAFT_PENDING)
    assert d["approval_status"] == "pending"


# ── Taken en ingekomen mails (20 nov) ──
INBOUND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"


async def test_taak_en_inbound_als_luka(h, repo):
    repo.t["email_intelligence"].append({"id": INBOUND, "status": "new", "requires_human_approval": True})
    for t in repo.t["deal_tasks"]:
        if t["id"] == TASK:
            t["requires_approval"] = True
    r = await h.post("/human/items/decide", headers={"Authorization": f"Bearer {GOED}"}, json={
        "action": "approve",
        "items": [{"kind": "deal_tasks_approval", "id": TASK}, {"kind": "inbound_needs_human_review", "id": INBOUND}]})
    assert r.status_code == 200, r.text
    uit = r.json()
    assert uit["ok"] == 2, uit
    assert next(t for t in repo.t["deal_tasks"] if t["id"] == TASK)["status"] == "completed"
    assert next(e for e in repo.t["email_intelligence"] if e.get("id") == INBOUND)["status"] == "approved"


async def test_items_alleen_voor_luka_en_niet_voor_deals(h, repo):
    r = await h.post("/human/items/decide", headers={"Authorization": f"Bearer {ANDER}"},
                     json={"action": "approve", "items": [{"kind": "deal_tasks_approval", "id": TASK}]})
    assert r.status_code == 401
    r = await h.post("/human/items/decide", headers={"Authorization": f"Bearer {GOED}"},
                     json={"action": "approve", "items": [{"kind": "deal_decision", "id": OPP_ID}]})
    assert r.json()["results"][0]["code"] == "not_here"
    r = await h.post("/human/items/decide", headers={"Authorization": f"Bearer {GOED}"},
                     json={"action": "send", "items": [{"kind": "deal_tasks_approval", "id": TASK}]})
    assert r.status_code == 400
