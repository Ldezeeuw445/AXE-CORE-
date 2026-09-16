"""Leestools via een echte MCP-client: dekking, opzoeken, paginering, maskering, integriteit en beleid."""
from __future__ import annotations

import json
import uuid

import pytest
from mcp import Client

from conftest import ALL, READ, signed_in
from fakes import BUYER_CO, COMM, DRAFT_PENDING, OPP, SELLER_CO, TASK, ts
from northsea_mcp.policy import TOOLS, Risk
from northsea_mcp.read_catalog import READ_TOOL_SCOPES

TESTCASE_REQ = "7c328c1a-fd41-4592-86bb-de954a384e2b"
ABAKUS = "2991d3a0-e15e-4158-b7b8-9a798d3b9476"


async def call(server, tool, args=None, scopes=READ):
    with signed_in(scopes):
        async with Client(server) as c:
            return await c.call_tool(tool, args or {})


async def ok(server, tool, args=None, scopes=READ) -> dict:
    res = await call(server, tool, args, scopes)
    assert not res.is_error, f"{tool}: {res.content[0].text if res.content else res}"
    data = res.structured_content
    assert data["generated_at"], tool
    return data


def add_testcase_and_dnc(repo):
    repo.t["companies"] += [
        {"id": "c0c0c0c0-0000-4000-8000-000000000001", "company_name": "Test Industrials Metals GmbH", "country": "Germany",
         "city": "Hamburg", "company_type": "buyer", "verification_status": "unverified"},
        {"id": ABAKUS, "company_name": "ABAKUS Metals", "country": "Germany", "company_type": "buyer",
         "verification_status": "reviewing", "notes": "Declined intermediary involvement."},
    ]
    repo.t["buyer_requirements"].append({"id": TESTCASE_REQ, "company_id": "c0c0c0c0-0000-4000-8000-000000000001",
                                         "commodity": "Copper", "product": "Copper Cathode", "destination": "Hamburg, Germany",
                                         "status": "draft", "evidence": "STRATO TEST CALL: synthetic Jasmine qualification test"})
    repo.t["opportunities"].append({**repo.t["opportunities"][0], "id": "d0d0d0d0-0000-4000-8000-000000000002",
                                    "buyer_requirement_id": TESTCASE_REQ, "deal_priority": "DEAL-002", "updated_at": ts(-50)})


# ── Alle leestools zijn READ_ONLY en werken ────────────────────────────────────

def test_every_read_tool_is_read_only_policy():
    for naam, scope in READ_TOOL_SCOPES.items():
        assert TOOLS[naam].risk == Risk.READ_ONLY and TOOLS[naam].scopes == (scope,)
        assert not TOOLS[naam].needs_idempotency_key


ARGS = {
    "northsea_get_deal": {"deal": "DEAL-001"}, "northsea_get_deal_readiness": {"deal": "DEAL-001"},
    "northsea_get_deal_gates": {"deal": OPP}, "northsea_get_deal_blockers": {"deal": "DEAL-001"},
    "northsea_get_deal_events": {"deal": "DEAL-001"},
    "northsea_get_counterparty": {"counterparty": SELLER_CO}, "northsea_get_counterparty_evidence": {"counterparty": SELLER_CO},
    "northsea_get_counterparty_communications": {"counterparty": SELLER_CO},
    "northsea_get_counterparty_opportunities": {"counterparty": BUYER_CO},
    "northsea_get_communication": {"communication": COMM}, "northsea_get_communication_thread": {"communication": COMM},
    "northsea_get_task": {"task_id": TASK}, "northsea_get_approval": {"approval_id": DRAFT_PENDING},
}


@pytest.mark.parametrize("tool", sorted(set(READ_TOOL_SCOPES) - {"northsea_get_evidence", "northsea_get_document_metadata"}))
async def test_read_tool_returns_structured_data_without_leaking(mcp_server, tool):
    data = await ok(mcp_server, tool, ARGS.get(tool))
    tekst = json.dumps(data)
    for geheim in ("Mopani", "mopani.com", "Chanda", "Qinzhou Harbour", "chanda@", "svc-test"):
        assert geheim not in tekst, f"{tool} leaked {geheim}"


async def test_get_evidence_by_id(mcp_server, repo):
    eid = repo.t["deal_evidence"][0]["id"]
    data = await ok(mcp_server, "northsea_get_evidence", {"evidence_id": eid})
    assert "Mopani" not in json.dumps(data)


async def test_unknown_document_is_not_found(mcp_server):
    res = await call(mcp_server, "northsea_get_document_metadata", {"document_id": str(uuid.uuid4())})
    assert res.is_error and "not_found" in res.content[0].text


# ── Acceptatiescenario's ──────────────────────────────────────────────────────

async def test_get_deal_by_code_matches_uuid(mcp_server):
    a = await ok(mcp_server, "northsea_get_deal", {"deal": "DEAL-001"})
    b = await ok(mcp_server, "northsea_get_deal", {"deal": OPP})
    c = await ok(mcp_server, "northsea_get_deal", {"deal": "#" + OPP[:8]})
    assert json.dumps(a, sort_keys=True).replace(a["generated_at"], "") == json.dumps(b, sort_keys=True).replace(b["generated_at"], "")
    assert c["generated_at"]


async def test_unknown_deal_code_is_not_found(mcp_server):
    res = await call(mcp_server, "northsea_get_deal", {"deal": "DEAL-999"})
    assert res.is_error and "not_found" in res.content[0].text


async def test_ambiguous_reference_returns_candidates_not_a_guess(mcp_server, repo):
    repo.t["opportunities"].append({**repo.t["opportunities"][0], "id": str(uuid.uuid4()), "deal_priority": "DEAL-0010"})
    repo.t["opportunities"].append({**repo.t["opportunities"][0], "id": str(uuid.uuid4()), "deal_priority": "DEAL-0011"})
    res = await call(mcp_server, "northsea_get_deal", {"deal": "DEAL-00"})
    assert res.is_error and "ambiguous_reference" in res.content[0].text
    # Exacte code blijft eenduidig, ook met langere codes ernaast.
    assert (await ok(mcp_server, "northsea_get_deal", {"deal": "DEAL-001"}))["generated_at"]


async def test_name_lookup_needs_identity_scope(mcp_server):
    res = await call(mcp_server, "northsea_get_counterparty", {"counterparty": "Mopani"})
    assert res.is_error and "identity_scope_required" in res.content[0].text
    data = await ok(mcp_server, "northsea_get_counterparty", {"counterparty": "Mopani"}, READ | {"northsea.identity"})
    assert "Mopani" in json.dumps(data)


async def test_list_deals_paginates_and_filters(mcp_server, repo):
    for i in range(30):
        repo.t["opportunities"].append({**repo.t["opportunities"][0], "id": str(uuid.uuid4()), "deal_priority": f"DEAL-{100 + i}",
                                        "readiness_score": i})
    eerste = await ok(mcp_server, "northsea_list_deals", {"limit": 10})
    assert eerste["returned"] == 10 and eerste["total"] == 31 and eerste["next_offset"] == 10
    laatste = await ok(mcp_server, "northsea_list_deals", {"limit": 10, "offset": 30})
    assert laatste["returned"] == 1 and laatste["next_offset"] is None
    hoog = await ok(mcp_server, "northsea_list_deals", {"min_readiness": 25, "sort": "readiness_desc", "limit": 100})
    scores = [d["readiness_score"] for d in hoog["items"]]
    assert scores == sorted(scores, reverse=True) and all(s >= 25 for s in scores)
    geen = await ok(mcp_server, "northsea_list_deals", {"commodity": "iron ore"})
    assert geen["total"] == 0


async def test_limit_above_max_is_rejected_by_schema(mcp_server):
    res = await call(mcp_server, "northsea_list_deals", {"limit": 5000})
    assert res.is_error


async def test_deals_are_never_executable(mcp_server):
    data = await ok(mcp_server, "northsea_list_deals", {})
    assert data["items"] and all(d["is_executable_deal"] is False for d in data["items"])


# ── Integriteit: testcase en do-not-contact ──────────────────────────────────

async def test_testcase_deal_excluded_by_default_and_flagged_when_included(mcp_server, repo):
    add_testcase_and_dnc(repo)
    standaard = await ok(mcp_server, "northsea_list_deals", {})
    assert standaard["excluded_testcases"] == 1
    assert "DEAL-002" not in json.dumps(standaard["items"])
    alles = await ok(mcp_server, "northsea_list_deals", {"include_testcases": True})
    assert alles["total"] == standaard["total"] + 1
    assert "testcase" in json.dumps(alles).lower()


async def test_do_not_contact_counterparty_is_flagged(mcp_server, repo):
    add_testcase_and_dnc(repo)
    data = await ok(mcp_server, "northsea_list_counterparties", {"do_not_contact": True})
    assert data["total"] == 1 and data["items"][0]["counterparty_id"] == ABAKUS
    assert "do not contact" in json.dumps(data).lower()


async def test_market_intelligence_excludes_testcases(mcp_server, repo):
    add_testcase_and_dnc(repo)
    data = await ok(mcp_server, "northsea_list_market_intelligence", {})
    assert TESTCASE_REQ in json.dumps(data)  # alleen in de apart gemelde uitsluitingen
    assert "testcase" in json.dumps(data).lower()


# ── Dashboard ────────────────────────────────────────────────────────────────

async def test_dashboard_snapshot_covers_ten_views_with_definitions(mcp_server):
    data = await ok(mcp_server, "northsea_get_dashboard_snapshot")
    views = {"live_map", "active_deals", "pipeline", "counterparties", "communications", "market_intel", "documents", "evidence",
             "automation", "reports"}
    assert views <= set(data["views"])
    for naam in views:
        for m in data["views"][naam]["metrics"]:
            assert {"metric", "value", "definition", "source"} <= set(m), (naam, m)
    actief = next(m for m in data["views"]["active_deals"]["metrics"] if m["metric"] == "active_deals")
    assert actief["value"] == len(actief["record_ids"])


async def test_dashboard_snapshot_single_view(mcp_server):
    data = await ok(mcp_server, "northsea_get_dashboard_snapshot", {"view": "pipeline"})
    assert set(data["views"]) == {"pipeline"}


async def test_overview_reports_pending_approvals_and_inbound(mcp_server):
    data = await ok(mcp_server, "northsea_get_trade_center_overview")
    assert data["headline"]["pending_approvals"] >= 2
    assert data["recent_inbound"] and data["headline"]["verified_counterparties"] == 1


async def test_pending_approvals_do_not_leak_draft_recipients_without_identity(mcp_server):
    data = await ok(mcp_server, "northsea_list_pending_approvals")
    assert data["total"] >= 2
    assert "chanda@mopani.com" not in json.dumps(data)


# ── Beveiliging ──────────────────────────────────────────────────────────────

async def test_read_tools_refuse_unauthenticated(mcp_server):
    async with Client(mcp_server) as c:
        res = await c.call_tool("northsea_list_deals", {})
    assert res.is_error and "unauthorized" in res.content[0].text


async def test_deal_read_tools_need_deal_scope(mcp_server, auditor):
    res = await call(mcp_server, "northsea_list_deals", {}, {"northsea.read"})
    assert res.is_error and "insufficient_scope" in res.content[0].text
    assert auditor.rows[-1]["details"]["decision"] == "denied"


async def test_read_tool_calls_are_audited(mcp_server, auditor):
    await ok(mcp_server, "northsea_get_pipeline_summary")
    assert auditor.rows[-1]["tool"] == "northsea_get_pipeline_summary"
    assert auditor.rows[-1]["details"]["risk"] == "READ_ONLY"


async def test_database_failure_is_safe(mcp_server, repo):
    repo.fail_reads = True
    res = await call(mcp_server, "northsea_list_deals", {})
    assert res.is_error and "upstream_error" in res.content[0].text and "Traceback" not in res.content[0].text


async def test_read_tools_do_not_write(mcp_server, repo):
    voor = json.dumps(repo.t, sort_keys=True, default=str)
    for tool in READ_TOOL_SCOPES:
        if tool in ("northsea_get_evidence", "northsea_get_document_metadata"):
            continue
        await call(mcp_server, tool, ARGS.get(tool), ALL)
    assert json.dumps(repo.t, sort_keys=True, default=str) == voor and repo.sends == []


async def test_approval_gates_still_enforced(mcp_server):
    # Goedkeuren zonder admin-scope blijft geweigerd, ook met alle leesrechten.
    res = await call(mcp_server, "northsea_approve_draft", {"draft_id": DRAFT_PENDING, "idempotency_key": "test-key-123"},
                     ALL - {"northsea.admin"})
    assert res.is_error and "insufficient_scope" in res.content[0].text
