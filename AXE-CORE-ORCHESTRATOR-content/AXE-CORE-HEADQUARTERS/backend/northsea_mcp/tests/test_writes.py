"""Schrijfacties via MCP: idempotentie, goedkeuring, gevoelige drafts, nooit twee keer versturen, limieten."""
from __future__ import annotations

from mcp import Client

from conftest import ALL, signed_in
from fakes import DRAFT_APPROVED, DRAFT_PENDING, DRAFT_SENSITIVE, OPP, TASK

WRITE = {"northsea.deal.write"}


async def call(mcp_server, scopes, tool, args):
    with signed_in(scopes):
        async with Client(mcp_server) as c:
            return await c.call_tool(tool, args)


async def test_create_task_retry_with_same_key_returns_same_task(mcp_server, repo):
    args = {"opportunity_id": OPP, "title": "Chase seller for allocation letter", "idempotency_key": "chase-alloc-0001"}
    a = await call(mcp_server, WRITE, "northsea_create_task", args)
    b = await call(mcp_server, WRITE, "northsea_create_task", args)
    assert not a.is_error and not b.is_error
    assert a.structured_content["task_id"] == b.structured_content["task_id"]
    assert len([t for t in repo.t["deal_tasks"] if t["title"] == args["title"]]) == 1


async def test_same_key_with_different_arguments_is_refused(mcp_server):
    await call(mcp_server, WRITE, "northsea_create_task", {"opportunity_id": OPP, "title": "First title", "idempotency_key": "reuse-key-0001"})
    r = await call(mcp_server, WRITE, "northsea_create_task", {"opportunity_id": OPP, "title": "Other title", "idempotency_key": "reuse-key-0001"})
    assert r.is_error and "idempotency_conflict" in r.content[0].text


async def test_write_without_idempotency_key_is_refused_by_schema_or_policy(mcp_server):
    r = await call(mcp_server, WRITE, "northsea_create_task", {"opportunity_id": OPP, "title": "No key given"})
    assert r.is_error


async def test_approve_requires_admin_scope(mcp_server):
    r = await call(mcp_server, WRITE | {"northsea.communications.send"}, "northsea_approve_draft",
                   {"draft_id": DRAFT_PENDING, "idempotency_key": "approve-0000001"})
    assert r.is_error and "insufficient_scope" in r.content[0].text


async def test_sensitive_draft_cannot_be_approved_without_signed_commission(mcp_server, repo):
    r = await call(mcp_server, {"northsea.admin"}, "northsea_approve_draft", {"draft_id": DRAFT_SENSITIVE, "idempotency_key": "approve-sens-001"})
    assert r.is_error and "commission_protection_required" in r.content[0].text
    assert next(d for d in repo.t["reply_drafts"] if d["id"] == DRAFT_SENSITIVE)["approval_status"] == "pending"


async def test_sensitive_draft_approvable_once_commission_is_signed(mcp_server, repo):
    repo.t["opportunities"][0]["commission_agreement_status"] = "signed"
    r = await call(mcp_server, {"northsea.admin"}, "northsea_approve_draft", {"draft_id": DRAFT_SENSITIVE, "idempotency_key": "approve-sens-002"})
    assert not r.is_error and r.structured_content["approval_status"] == "approved"
    assert repo.sends == []  # goedkeuren verstuurt niets


async def test_send_refuses_unapproved_draft(mcp_server, repo):
    r = await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication",
                   {"draft_id": DRAFT_PENDING, "confirm": True, "idempotency_key": "send-pending-01"})
    assert r.is_error and "draft_not_approved" in r.content[0].text and repo.sends == []


async def test_send_requires_confirm_true(mcp_server, repo):
    r = await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication",
                   {"draft_id": DRAFT_APPROVED, "confirm": False, "idempotency_key": "send-noconfirm1"})
    assert r.is_error and "confirmation_required" in r.content[0].text and repo.sends == []


async def test_retry_and_new_key_never_send_twice(mcp_server, repo):
    args = {"draft_id": DRAFT_APPROVED, "confirm": True, "idempotency_key": "send-approved-01"}
    a = await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication", args)
    b = await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication", args)
    c = await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication", {**args, "idempotency_key": "send-approved-02"})
    assert not a.is_error and a.structured_content["submitted"] is True
    assert b.structured_content == a.structured_content                      # idempotente replay
    assert c.structured_content["duplicate"] is True and c.structured_content["submitted"] is False
    assert repo.sends == [DRAFT_APPROVED]                                     # precies één verzending


async def test_high_impact_rate_limit(mcp_server, repo, auditor):
    for i in range(5):
        await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication",
                   {"draft_id": DRAFT_PENDING, "confirm": True, "idempotency_key": f"rate-limit-{i:04d}"})
    r = await call(mcp_server, {"northsea.communications.send"}, "northsea_send_approved_communication",
                   {"draft_id": DRAFT_PENDING, "confirm": True, "idempotency_key": "rate-limit-9999"})
    assert r.is_error and "rate_limited" in r.content[0].text
    assert auditor.rows[-1]["details"]["error_code"] == "rate_limited"


async def test_prepare_outreach_save_is_idempotent(mcp_server, repo):
    args = {"opportunity_id": OPP, "objective": "request authority documents", "template": "supplier_qualification",
            "save_as_pending_draft": True, "idempotency_key": "save-draft-0001"}
    a = await call(mcp_server, ALL, "northsea_prepare_outreach", args)
    b = await call(mcp_server, ALL, "northsea_prepare_outreach", args)
    assert not a.is_error and a.structured_content["saved_draft_id"] == b.structured_content["saved_draft_id"]
    assert len([d for d in repo.t["reply_drafts"] if d.get("generated_by") == "northsea-mcp"]) == 1


async def test_update_task_audit_records_mutation(mcp_server, auditor):
    r = await call(mcp_server, WRITE, "northsea_update_task", {"task_id": TASK, "status": "in_progress", "idempotency_key": "update-task-001"})
    assert not r.is_error
    assert auditor.rows[-1]["details"]["mutations"]["task_id"] == TASK
