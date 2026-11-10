"""Opruimen + voorstellen: wat vanzelf mag, wat Luka eerst ziet."""
from datetime import datetime, timedelta, timezone

from northsea_mcp.opruimen import maak_plan, plan_als_dict

NU = datetime(2026, 11, 10, 13, 0, tzinfo=timezone.utc)


def dagen(n: int) -> str:
    return (NU - timedelta(days=n)).isoformat()


def test_ruis_gaat_vanzelf_een_echte_vraag_niet():
    p = maak_plan({"email_intelligence": [
        {"id": "spam", "requires_human_approval": True, "status": "analyzed", "classification": "spam", "created_at": dagen(2)},
        {"id": "bounce", "requires_human_approval": True, "status": "analyzed", "classification": "unknown",
         "engine_primary": "bounce_failure", "created_at": dagen(2)},
        {"id": "koper", "requires_human_approval": True, "status": "analyzed", "classification": "buyer", "created_at": dagen(2)},
        {"id": "al_weg", "requires_human_approval": True, "status": "dismissed", "classification": "spam", "created_at": dagen(2)},
    ]}, NU)
    assert {s.id for s in p.automatisch} == {"spam", "bounce"}
    assert not p.voorstellen  # de koper is 2 dagen oud: gewoon laten staan


def test_dubbele_concepten_houdt_de_nieuwste():
    p = maak_plan({"reply_drafts": [
        {"id": "lagos1", "approval_status": "pending", "company_id": "c1", "subject": "Re: trial CIF Lagos (Apapa)",
         "communication_id": "m1", "created_at": dagen(12)},
        {"id": "lagos2", "approval_status": "pending", "company_id": "c1", "subject": "Re: trial CIF Lagos (Apapa)",
         "communication_id": "m2", "created_at": dagen(11)},
        {"id": "anders", "approval_status": "pending", "company_id": "c2", "subject": "Re: trial CIF Lagos (Apapa)",
         "communication_id": "m3", "created_at": dagen(11)},
        {"id": "verstuurd", "approval_status": "pending", "company_id": "c1", "subject": "Re: trial CIF Lagos (Apapa)",
         "sent_at": dagen(1), "created_at": dagen(1)},
    ]}, NU)
    assert [s.id for s in p.automatisch] == ["lagos1"]
    assert p.automatisch[0].nieuw == "rejected"


def test_wachtrij_dubbel_met_een_taak_gaat_vanzelf():
    p = maak_plan({
        "action_queue": [{"id": "aq", "status": "open", "opportunity_id": "d2", "title": "Yes needed: DEAL-002 — Copper Cathode"},
                         {"id": "aq2", "status": "open", "opportunity_id": "d3", "title": "Iets anders"}],
        "deal_tasks": [{"id": "t", "status": "open", "opportunity_id": "d2", "title": "Yes needed: DEAL-002 — Copper Cathode"}],
    }, NU)
    assert [s.id for s in p.automatisch] == ["aq"]


def test_oud_werk_wordt_een_voorstel_niet_vanzelf():
    p = maak_plan({
        "email_intelligence": [{"id": "sept", "requires_human_approval": True, "status": "analyzed",
                                "classification": "supplier", "created_at": dagen(55)}],
        "reply_drafts": [{"id": "okt", "approval_status": "pending", "company_id": "c9", "subject": "Re: x",
                          "created_at": dagen(25)}],
        "action_queue": [{"id": "budget", "status": "open", "opportunity_id": "d9",
                          "title": "Research approved, budget exhausted today: Seller legal entity", "updated_at": dagen(20)}],
    }, NU)
    assert not p.automatisch
    d = plan_als_dict(p)
    assert [(v["code"], v["count"]) for v in d["proposals"]] == [("V1", 1), ("V2", 1), ("V3", 1)]
    assert d["proposals"][0]["items"][0]["was"] == "analyzed"


def test_wat_vanzelf_gaat_staat_niet_ook_in_een_voorstel():
    p = maak_plan({"email_intelligence": [
        {"id": "oud_spam", "requires_human_approval": True, "status": "analyzed", "classification": "spam", "created_at": dagen(60)},
    ]}, NU)
    assert [s.id for s in p.automatisch] == ["oud_spam"] and not p.voorstellen


def test_mails_van_een_deal_met_open_beslissing_blijven_staan():
    p = maak_plan({
        "opportunities": [{"id": "deal2", "approval_required": True, "stage": "qualification"}],
        "email_intelligence": [
            {"id": "harcros", "requires_human_approval": True, "status": "analyzed", "classification": "supplier",
             "opportunity_id": "deal2", "created_at": dagen(55)},
            {"id": "los", "requires_human_approval": True, "status": "analyzed", "classification": "supplier",
             "opportunity_id": "deal9", "created_at": dagen(55)},
        ]}, NU)
    assert [s.id for s in p.voorstellen[0].stappen] == ["los"]


async def test_tidy_desk_tool_droog_en_dan_echt(mcp_server, repo):
    """Via de echte tool: droog verandert niets, 'auto' ruimt alleen het zekere op."""
    import json, uuid
    from tests.test_readtools import ALL, call

    async def ok(server, tool, args, scopes):
        res = await call(server, tool, args, scopes)
        assert not res.is_error, res.content[0].text
        return res.structured_content
    a, t = str(uuid.uuid4()), str(uuid.uuid4())
    opp = str(uuid.uuid4())
    repo.t.setdefault("action_queue", []).append({"id": a, "status": "open", "opportunity_id": opp, "title": "Yes needed: X"})
    repo.t.setdefault("deal_tasks", []).append({"id": t, "status": "open", "opportunity_id": opp, "title": "Yes needed: X"})
    droog = await ok(mcp_server, "northsea_tidy_desk", {"idempotency_key": "tidy-test-1"}, scopes=ALL)
    assert droog["dry_run"] and any(s["id"] == a for s in droog["automatic"])
    assert next(r for r in repo.t["action_queue"] if r["id"] == a)["status"] == "open"
    echt = await ok(mcp_server, "northsea_tidy_desk", {"idempotency_key": "tidy-test-2", "dry_run": False, "apply": ["auto"]}, scopes=ALL)
    assert any(s["id"] == a for s in echt["applied"])
    assert next(r for r in repo.t["action_queue"] if r["id"] == a)["status"] == "cancelled"
    assert next(r for r in repo.t["deal_tasks"] if r["id"] == t)["status"] == "open"
    assert "sends" in json.dumps(echt["never"])
