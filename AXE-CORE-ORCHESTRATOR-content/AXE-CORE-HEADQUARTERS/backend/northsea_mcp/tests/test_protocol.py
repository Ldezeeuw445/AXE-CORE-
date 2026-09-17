"""MCP-protocol: ontdekking, schema's, annotaties, auth en foutvorm -- via een echte MCP-client."""
from __future__ import annotations

import json

import httpx
from mcp import Client

from conftest import ALL, PUBLIC, READ, signed_in
from fakes import OPP
from northsea_mcp.read_catalog import READ_TOOL_SCOPES

EXPECTED_TOOLS = {
    "northsea_handle_event",
    "northsea_review_deal", "northsea_get_next_actions", "northsea_qualify_opportunity", "northsea_assess_match",
    "northsea_process_reply", "northsea_research_counterparty", "northsea_find_suppliers", "northsea_find_buyers",
    "northsea_investigate_blockers", "northsea_prepare_outreach", "northsea_create_task", "northsea_update_task",
    "northsea_approve_draft", "northsea_send_approved_communication",
} | set(READ_TOOL_SCOPES)


def _structured(res) -> dict:
    return res.structured_content


async def test_discovers_exactly_the_stable_tool_set_with_schemas(mcp_server):
    with signed_in(ALL):
        async with Client(mcp_server) as c:
            tools = (await c.list_tools()).tools
    namen = {t.name for t in tools}
    assert namen == EXPECTED_TOOLS
    for t in tools:
        assert t.output_schema, f"{t.name} publishes no outputSchema"
        assert t.input_schema.get("type") == "object"
        assert len(t.description or "") > 120, f"{t.name} description too thin for tool selection"
    by = {t.name: t for t in tools}
    assert by["northsea_review_deal"].annotations.read_only_hint is True
    assert by["northsea_send_approved_communication"].annotations.destructive_hint is True
    assert by["northsea_send_approved_communication"].annotations.read_only_hint is False
    assert "never sends" in by["northsea_prepare_outreach"].description.lower()
    assert set(by["northsea_create_task"].input_schema["required"]) >= {"opportunity_id", "title", "idempotency_key"}


async def test_review_deal_returns_structured_output_and_redacts_identities(mcp_server, auditor):
    with signed_in(READ):
        async with Client(mcp_server) as c:
            res = await c.call_tool("northsea_review_deal", {"opportunity_id": OPP})
    assert not res.is_error
    data = _structured(res)
    assert data["opportunity_id"] == OPP and data["code"] == "DEAL-001"
    assert data["seller"]["identity_disclosed"] is False and data["seller"]["company_name"] is None
    tekst = json.dumps(data)
    for geheim in ("Mopani", "mopani.com", "Chanda", "Qinzhou Harbour", "chanda@"):
        assert geheim not in tekst, f"leaked {geheim}"
    assert auditor.rows[-1]["tool"] == "northsea_review_deal"
    assert auditor.rows[-1]["details"]["decision"] == "allowed"


async def test_identity_scope_discloses_real_names(mcp_server):
    with signed_in(READ | {"northsea.identity"}):
        async with Client(mcp_server) as c:
            data = _structured(await c.call_tool("northsea_review_deal", {"opportunity_id": OPP}))
    assert data["seller"]["company_name"] == "Mopani Copper Mines PLC"
    assert data["seller"]["contacts"][0]["email"] == "chanda@mopani.com"


async def test_missing_scope_is_refused_and_audited(mcp_server, auditor):
    with signed_in({"northsea.read"}):
        async with Client(mcp_server) as c:
            res = await c.call_tool("northsea_review_deal", {"opportunity_id": OPP})
    assert res.is_error
    assert "insufficient_scope" in res.content[0].text
    assert auditor.rows[-1]["details"]["decision"] == "denied"


async def test_unauthenticated_call_is_refused(mcp_server):
    async with Client(mcp_server) as c:
        res = await c.call_tool("northsea_review_deal", {"opportunity_id": OPP})
    assert res.is_error and "unauthorized" in res.content[0].text


async def test_invalid_id_gives_safe_error(mcp_server):
    with signed_in(READ):
        async with Client(mcp_server) as c:
            res = await c.call_tool("northsea_get_next_actions", {"opportunity_id": "x" * 36})
    assert res.is_error
    assert "invalid_input" in res.content[0].text
    assert "Traceback" not in res.content[0].text


async def test_database_failure_does_not_leak_internals(mcp_server, repo):
    repo.fail_reads = True
    with signed_in(READ):
        async with Client(mcp_server) as c:
            res = await c.call_tool("northsea_review_deal", {"opportunity_id": OPP})
    assert res.is_error
    msg = res.content[0].text
    # De SDK zet er "Error executing tool …:" voor; de rest is van ons en veilig.
    assert "upstream_error: the NorthSea database request failed" in msg
    assert "svc-test" not in msg and "supabase" not in msg.lower() and "Traceback" not in msg


async def test_resources_list_policy_documents(mcp_server):
    with signed_in(READ):
        async with Client(mcp_server) as c:
            uris = {str(r.uri) for r in (await c.list_resources()).resources}
    assert {"northsea://policy/permissions", "northsea://policy/statuses"} <= uris


# ── HTTP ─────────────────────────────────────────────────────────────────────

def _http(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=PUBLIC)


async def test_mcp_endpoint_requires_bearer_and_points_to_metadata(app):
    async with _http(app) as h:
        r = await h.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                         headers={"accept": "application/json, text/event-stream"})
    assert r.status_code == 401
    www = r.headers.get("www-authenticate", "")
    assert "resource_metadata=" in www and "/.well-known/oauth-protected-resource" in www


async def test_invalid_bearer_is_rejected(app):
    async with _http(app) as h:
        r = await h.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                         headers={"authorization": "Bearer nsat_not-a-real-token", "accept": "application/json, text/event-stream"})
    assert r.status_code == 401


async def test_discovery_metadata(app):
    async with _http(app) as h:
        asm = (await h.get("/.well-known/oauth-authorization-server")).json()
        prm = (await h.get("/.well-known/oauth-protected-resource/mcp")).json()
        root_prm = (await h.get("/.well-known/oauth-protected-resource")).json()
    assert asm["issuer"] == PUBLIC and asm["code_challenge_methods_supported"] == ["S256"]
    assert asm["registration_endpoint"].endswith("/oauth/register")
    assert "northsea.identity" in asm["scopes_supported"]
    # Letterlijk gelijk, zonder slash-verschil: een client vergelijkt issuer en authorization_servers als string.
    assert prm["resource"] == f"{PUBLIC}/mcp" and prm["authorization_servers"] == [asm["issuer"]]
    assert "northsea.identity" in prm["scopes_supported"]
    assert root_prm["resource"] == f"{PUBLIC}/mcp"


async def test_public_health_exposes_no_internals(app):
    from northsea_mcp import __version__
    async with _http(app) as h:
        health = (await h.get("/health")).json()
        ready = await h.get("/ready")
    assert health == {"status": "ok", "version": "1.4.0"}
    assert health["version"] == __version__
    assert set(ready.json()) == {"ready"}


async def test_handle_event_refuses_read_only_scope(mcp_server):
    with signed_in(READ):
        async with Client(mcp_server) as c:
            res = await c.call_tool("northsea_handle_event", {
                "event_id": "evt-readonly-1", "run_id": "run-readonly-1",
                "event_type": "opportunity_qualification", "source": "axe-core",
                "requesting_principal": "user:luka",
                "payload": {"opportunity_id": OPP},
                "budget_envelope": {"research_calls": 1, "premium_calls": 0, "max_seconds": 30},
            })
    assert res.is_error
    assert "insufficient_scope" in res.content[0].text
    assert "northsea.research" in res.content[0].text


async def test_handle_event_allows_research_and_deal_read(mcp_server):
    with signed_in(READ | {"northsea.research"}):
        async with Client(mcp_server) as c:
            res = await c.call_tool("northsea_handle_event", {
                "event_id": "evt-research-1", "run_id": "run-research-1",
                "event_type": "opportunity_qualification", "source": "axe-core",
                "requesting_principal": "user:luka",
                "payload": {"opportunity_id": OPP},
                "budget_envelope": {"research_calls": 1, "premium_calls": 0, "max_seconds": 30},
            })
    assert not res.is_error
    assert res.structured_content["status"] in ("ok", "crew_unavailable", "unroutable")
