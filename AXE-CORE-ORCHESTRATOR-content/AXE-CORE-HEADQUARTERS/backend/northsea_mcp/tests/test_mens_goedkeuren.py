"""Luka keurt goed vanuit AXE met zijn eigen inlog (17 nov 2026)."""
import httpx
import pytest

from northsea_mcp.server import create_app
from tests.conftest import PUBLIC, USER
from tests.fakes import DRAFT_PENDING

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
