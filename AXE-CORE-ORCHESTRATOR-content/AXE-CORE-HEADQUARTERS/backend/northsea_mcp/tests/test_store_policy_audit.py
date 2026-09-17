from __future__ import annotations

import time

from conftest import PUBLIC
from northsea_mcp.audit import scrub
from northsea_mcp.policy import TOOLS, Risk, check_sensitive_draft, is_sensitive_text, missing_scopes
from northsea_mcp.research import parse_agent_answer
from northsea_mcp.store import Store


def test_tokens_are_stored_only_as_hashes(tmp_path):
    db = tmp_path / "s.db"
    s = Store(str(db))
    token = s.issue(kind="service", client_id="service:axe-core", subject="axe-core", scopes=["northsea.read"],
                    resource=f"{PUBLIC}/mcp", ttl_s=None, label="axe-core")
    del s
    raw = b"".join(p.read_bytes() for p in tmp_path.iterdir())
    assert token.encode() not in raw


def test_expired_and_revoked_tokens_fail(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    kort = s.issue(kind="access", client_id="c", subject="u", scopes=["northsea.read"], resource="r", ttl_s=1)
    assert s.lookup(kort, "access")
    time.sleep(1.2)
    assert s.lookup(kort, "access") is None
    lang = s.issue(kind="service", client_id="c", subject="u", scopes=["northsea.read"], resource="r", ttl_s=None, label="x")
    assert s.revoke_label("x") == 1 and s.lookup(lang, "service") is None


def test_rate_window_slides(tmp_path):
    s = Store(str(tmp_path / "s.db"))
    t = 1000.0
    assert s.hit("b", 10, 2, now=t)[0] and s.hit("b", 10, 2, now=t + 1)[0]
    ok, _, wacht = s.hit("b", 10, 2, now=t + 2)
    assert not ok and 7 < wacht <= 8
    assert s.hit("b", 10, 2, now=t + 10.5)[0]


def test_every_write_tool_needs_idempotency_and_only_writes_can_mutate():
    for naam, p in TOOLS.items():
        if p.risk in (Risk.LOW_RISK_WRITE, Risk.HIGH_IMPACT_WRITE):
            assert p.needs_idempotency_key, naam
    assert TOOLS["northsea_send_approved_communication"].risk == Risk.HIGH_IMPACT_WRITE
    assert TOOLS["northsea_review_deal"].risk == Risk.READ_ONLY
    assert TOOLS["northsea_prepare_outreach"].risk == Risk.DRAFT
    assert missing_scopes("northsea_find_suppliers", {"northsea.research"}) == ["northsea.read"]
    assert TOOLS["northsea_handle_event"].risk == Risk.RESEARCH
    assert TOOLS["northsea_handle_event"].uses_crew is True
    assert TOOLS["northsea_handle_event"].scopes == ("northsea.research", "northsea.deal.read")
    assert missing_scopes("northsea_handle_event", {"northsea.deal.read"}) == ["northsea.research"]
    assert missing_scopes("northsea_handle_event", {"northsea.read", "northsea.deal.read"}) == ["northsea.research"]
    assert missing_scopes("northsea_handle_event", {"northsea.research", "northsea.deal.read"}) == []


def test_sensitive_rules_match_the_deal_desk():
    assert is_sensitive_text("Please send your IBAN and we accept the price")
    assert not is_sensitive_text("Please confirm the loading port and purity")
    check_sensitive_draft({"sensitive_action": False}, None)
    for opp in (None, {"commission_agreement_status": "not_started"}):
        try:
            check_sensitive_draft({"sensitive_action": True, "opportunity_id": "x" if opp else None}, opp)
            raise AssertionError("should refuse")
        except Exception as e:  # noqa: BLE001
            assert getattr(e, "code", "") in ("sensitive_requires_deal", "commission_protection_required")
    check_sensitive_draft({"sensitive_action": True, "opportunity_id": "x"}, {"commission_agreement_status": "signed"})


def test_audit_scrub_removes_secrets_emails_and_bodies():
    uit = scrub({"token": "nsat_" + "a" * 30, "note": "mail me at luka@example.com", "body": "long private text",
                 "nested": {"jwt": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij"}})
    assert uit["token"] == "[secret]" and "[email]" in uit["note"] and uit["body"] == "[omitted]"
    assert uit["nested"]["jwt"] == "[secret]"


def test_perplexity_answer_parsing_matches_measured_shape():
    raw = {"model": "sonar", "usage": {"cost": {"total_cost": 0.0123}}, "output": [
        {"type": "search_results", "results": [{"id": 1, "url": "https://a.example", "title": "A"}, {"id": 2, "url": "https://b.example", "title": "B"}]},
        {"type": "fetch_url_results", "contents": [{"url": "https://c.example", "title": "C"}]},
        {"type": "message", "content": [{"type": "output_text", "text": "Fact one [web:2].", "annotations": []}]}]}
    a = parse_agent_answer(raw)
    assert a.text == "Fact one [web:2]." and a.cost_usd == 0.0123
    assert [s.url for s in a.sources][0] == "https://b.example" and a.sources[0].cited
    assert {s.url for s in a.sources} == {"https://a.example", "https://b.example", "https://c.example"}
