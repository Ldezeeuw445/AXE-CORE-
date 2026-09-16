"""P0: contactbeleid (DNC/review), testdata, menselijke goedkeuring en herkomst via de NorthSea MCP."""
from __future__ import annotations

import json

from mcp import Client

from conftest import ALL, READ, USER, signed_in
from fakes import COMM, DRAFT_APPROVED, DRAFT_PENDING, OPP, SELLER_CO

ADMIN = {"northsea.admin"}
SEND = {"northsea.communications.send"}
DRAFT = {"northsea.communications.draft"}
WRITE = {"northsea.deal.write"}


async def call(server, scopes, tool, args, subject=USER, client_id="test-client"):
    with signed_in(scopes, subject=subject, client_id=client_id):
        async with Client(server) as c:
            return await c.call_tool(tool, args)


def draft(repo, i):
    return next(d for d in repo.t["reply_drafts"] if d["id"] == i)


def set_seller_policy(repo, policy):
    next(c for c in repo.t["companies"] if c["id"] == SELLER_CO)["contact_policy"] = policy


# ── P0.4 Goedkeuringsintegriteit ─────────────────────────────────────────────

async def test_service_credential_cannot_approve(mcp_server, repo):
    r = await call(mcp_server, ADMIN, "northsea_approve_draft", {"draft_id": DRAFT_PENDING, "idempotency_key": "p0-approve-svc-1"},
                   subject="service:automation", client_id="service:automation")
    assert r.is_error and "human_approval_required" in r.content[0].text
    assert draft(repo, DRAFT_PENDING)["approval_status"] == "pending"


async def test_human_approval_records_provenance(mcp_server, repo):
    r = await call(mcp_server, ADMIN, "northsea_approve_draft", {"draft_id": DRAFT_PENDING, "idempotency_key": "p0-approve-hum-1"})
    assert not r.is_error
    d = draft(repo, DRAFT_PENDING)
    assert (d["approval_status"], d["approval_actor_type"], d["approved_by"], d["approval_channel"], d["lifecycle_state"]) == \
        ("approved", "human", USER, "northsea_mcp", "human_approved")
    assert repo.sends == []


async def test_send_refuses_approval_without_human_provenance(mcp_server, repo):
    d = draft(repo, DRAFT_APPROVED)
    d.update(approval_actor_type="unknown", approved_by=None, approval_channel=None)  # zoals een historische draft
    r = await call(mcp_server, SEND, "northsea_send_approved_communication", {"draft_id": DRAFT_APPROVED, "confirm": True, "idempotency_key": "p0-send-legacy-1"})
    assert r.is_error and "human_approval_provenance_missing" in r.content[0].text
    assert repo.sends == []


# ── P0.5 Do-not-contact ──────────────────────────────────────────────────────

async def test_dnc_blocks_outreach_approval_send_and_tasks(mcp_server, repo):
    set_seller_policy(repo, "do_not_contact")
    r = await call(mcp_server, DRAFT, "northsea_prepare_outreach", {"objective": "qualify seller", "counterparty_id": SELLER_CO})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text
    r = await call(mcp_server, DRAFT, "northsea_prepare_outreach", {"objective": "qualify", "opportunity_id": OPP, "template": "supplier_qualification",
                                                                     "save_as_pending_draft": True, "idempotency_key": "p0-outreach-dnc1"})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text
    r = await call(mcp_server, ADMIN, "northsea_approve_draft", {"draft_id": DRAFT_PENDING, "idempotency_key": "p0-approve-dnc-1"})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text
    r = await call(mcp_server, SEND, "northsea_send_approved_communication", {"draft_id": DRAFT_APPROVED, "confirm": True, "idempotency_key": "p0-send-dnc-01"})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text
    r = await call(mcp_server, WRITE, "northsea_create_task", {"opportunity_id": OPP, "title": "Chase seller", "idempotency_key": "p0-task-dnc-001"})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text
    r = await call(mcp_server, WRITE, "northsea_create_task", {"opportunity_id": OPP, "title": "Review DNC", "task_type": "dnc_review",
                                                               "idempotency_key": "p0-task-dnc-002"})
    assert not r.is_error
    assert repo.sends == []
    assert all(d["approval_status"] != "approved" for d in repo.t["reply_drafts"] if d["id"] == DRAFT_PENDING)


async def test_dnc_contact_by_email_blocks_send(mcp_server, repo):
    next(k for k in repo.t["contacts"] if k["email"] == "chanda@mopani.com")["contact_policy"] = "do_not_contact"
    r = await call(mcp_server, SEND, "northsea_send_approved_communication", {"draft_id": DRAFT_APPROVED, "confirm": True, "idempotency_key": "p0-send-dnc-02"})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text and repo.sends == []


async def test_review_required_allows_human_path_with_note(mcp_server, repo):
    set_seller_policy(repo, "review_required")
    r = await call(mcp_server, DRAFT, "northsea_prepare_outreach", {"objective": "qualify seller", "counterparty_id": SELLER_CO})
    assert not r.is_error
    assert any("review_required" in n for n in r.structured_content["notes"])
    r = await call(mcp_server, ADMIN, "northsea_approve_draft", {"draft_id": DRAFT_PENDING, "idempotency_key": "p0-approve-rev-1"})
    assert not r.is_error


async def test_contact_policy_failure_fails_closed(mcp_server, repo):
    repo.fail_reads = True
    r = await call(mcp_server, SEND, "northsea_send_approved_communication", {"draft_id": DRAFT_APPROVED, "confirm": True, "idempotency_key": "p0-send-fail-01"})
    assert r.is_error and repo.sends == []


# ── P0.6 Synthetische data ───────────────────────────────────────────────────

async def test_synthetic_deal_blocks_work_and_is_excluded_from_deal_lists(mcp_server, repo):
    repo.t["opportunities"][0]["is_synthetic"] = True
    r = await call(mcp_server, WRITE, "northsea_create_task", {"opportunity_id": OPP, "title": "Chase", "idempotency_key": "p0-task-syn-001"})
    assert r.is_error and "contact_policy_blocked" in r.content[0].text
    r = await call(mcp_server, READ, "northsea_list_deals", {})
    assert r.structured_content["total"] == 0 and r.structured_content["excluded_testcases"] == 1


async def test_synthetic_requirement_column_marks_testcase(mcp_server, repo):
    repo.t["buyer_requirements"][0].update(is_synthetic=True, synthetic_reason="STRATO/Jasmine test")
    r = await call(mcp_server, READ, "northsea_list_deals", {"include_testcases": True})
    assert "internal_testcase" in json.dumps(r.structured_content)


async def test_synthetic_messages_excluded_from_activity_metrics(mcp_server, repo):
    next(c for c in repo.t["communications"] if c["id"] == COMM)["is_synthetic"] = True
    r = await call(mcp_server, READ, "northsea_get_dashboard_snapshot", {"view": "communications"})
    m = {x["metric"]: x["value"] for x in r.structured_content["views"]["communications"]["metrics"]}
    echt = [c for c in repo.t["communications"] if not c.get("is_synthetic")]
    assert m["messages"] == len(echt) and m["synthetic_messages_excluded"] == 1
    assert m["messages_last_7d"] == len(echt)  # alle seed-berichten zijn recent


async def test_dnc_metric_uses_machine_column(mcp_server, repo):
    set_seller_policy(repo, "do_not_contact")
    r = await call(mcp_server, READ, "northsea_get_dashboard_snapshot", {"view": "counterparties"})
    m = {x["metric"]: x for x in r.structured_content["views"]["counterparties"]["metrics"]}
    assert m["do_not_contact"]["value"] == 1 and m["do_not_contact"]["record_ids"] == [SELLER_CO]
    assert "machine-enforced" in m["do_not_contact"]["definition"].lower()


async def test_outbound_provenance_is_exposed_and_unknown_stays_unknown(mcp_server, repo):
    repo.t["communications"].append({"id": "12121212-1212-4121-8121-121212121212", "company_id": SELLER_CO, "direction": "outbound", "channel": "email",
                                     "subject": "legacy", "body": "x", "occurred_at": "2026-09-12T10:00:00+00:00", "external_message_id": "legacy-1"})
    r = await call(mcp_server, ALL, "northsea_get_communication", {"communication": "12121212-1212-4121-8121-121212121212"})
    prov = r.structured_content["communication"]["provenance"]
    assert prov["recorded"] is False and prov["from"] is None and prov["approval_basis"] is None
