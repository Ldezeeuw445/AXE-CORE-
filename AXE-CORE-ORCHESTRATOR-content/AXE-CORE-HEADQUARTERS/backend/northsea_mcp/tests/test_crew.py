"""De crew-adapter: toegewijde NorthSea-workforce als primair, algemene AXE CORE-crew als zichtbare fallback.

HTTP-vormen: CrewAI AMP (`GET /inputs`, `POST /kickoff` -> kickoff_id, `GET /status/{id}` ->
running|completed|error) volgens docs.crewai.com; axe-core-api `/crew/run` zoals gemeten.
"""
from __future__ import annotations

import json

import httpx
import pytest

from northsea_mcp.crew import CREW_FOR_ROUTE, ROUTE_FOR_ACTION, CrewGateway, StudioRoute, parse_dedicated_output

API = "api.test"
DEAL = "deal-crew.crewai.test"

GOOD_OUTPUT = json.dumps({"analysis": "Seller authority unproven; request mandate letter.", "models": ["gpt-5-mini"],
                          "skills": [{"name": "assess_match", "version": 1}], "tools": ["supabase:read"],
                          "budget_usage": {"research_calls": 1}})


def make(handler, *, routes=None, timeout=5.0, fallback_on=None):
    kw = {} if fallback_on is None else {"fallback_on": fallback_on}
    return CrewGateway(axe_api_url=f"http://{API}", axe_api_key="k", crew_venv_py="", timeout=timeout,
                       client=httpx.AsyncClient(transport=httpx.MockTransport(handler)), studio_poll_s=0,
                       studio_routes=routes or {}, min_fallback_s=0, local_enabled=False, **kw)


def general_ok(req: httpx.Request) -> httpx.Response | None:
    if req.url.host == API and req.url.path == "/crew/run":
        return httpx.Response(200, json={"status": "ok", "result": "Missing: seller authority evidence.", "specialists": ["Intel"]})
    return None


def studio(status_seq, *, inputs=200, kickoff=200):
    staten = list(status_seq)

    def handler(req: httpx.Request) -> httpx.Response:
        g = general_ok(req)
        if g:
            return g
        if req.url.host == DEAL:
            if req.url.path == "/inputs":
                return httpx.Response(inputs, json={"inputs": ["handoff"]})
            if req.url.path == "/kickoff":
                return httpx.Response(kickoff, json={"kickoff_id": "k-123"} if kickoff == 200 else {})
            if req.url.path == "/status/k-123":
                return httpx.Response(200, json=staten.pop(0) if len(staten) > 1 else staten[0])
        return httpx.Response(404)
    return handler


ROUTE = {"deal_run": StudioRoute(url=f"https://{DEAL}", token="crew-token")}


def test_routing_is_explicit_for_all_four_crews():
    assert CREW_FOR_ROUTE["discovery_run"] == "NorthSea Counterparty Intelligence & Sourcing"
    assert CREW_FOR_ROUTE["deal_run"] == "NorthSea Deal Execution Crew"
    assert CREW_FOR_ROUTE["intelligence_run"] == CREW_FOR_ROUTE["operations_run"] == "NorthSea Intelligence & Operations"
    assert ROUTE_FOR_ACTION["research_counterparty"] == "discovery_run"
    assert ROUTE_FOR_ACTION["qualify_opportunity"] == "deal_run"
    assert ROUTE_FOR_ACTION["market_signal"] == "intelligence_run"
    assert ROUTE_FOR_ACTION["stale_deal"] == "operations_run"


async def test_without_dedicated_deployment_the_general_crew_is_an_explicit_fallback():
    gezien = {}

    def handler(req):
        if req.url.path == "/crew/run":
            gezien["body"] = json.loads(req.content)
        return general_ok(req) or httpx.Response(404)

    info = await make(handler).run("qualify_opportunity", {"entity_ids": {"opportunity_id": "x"}})
    assert info.status == "ok" and info.crew == "deal" and "seller authority" in info.analysis
    assert info.route == "deal_run" and info.requested_crew == "NorthSea Deal Execution Crew"
    assert info.backend == "axe_general_crew" and info.actual_crew == "AXE CORE general crew"
    assert info.fallback_used is True and info.fallback_reason == "dedicated_backend_not_configured"
    assert info.validation == "not_validated" and info.attempts[0]["outcome"] == "not_configured"
    assert "total_s" in info.timings and "Do not send any message." in gezien["body"]["task"]


async def test_dedicated_crew_runs_first_and_returns_validated_provenance():
    handler = studio([{"status": "running", "current_task": "t1"},
                      {"status": "completed", "result": {"output": GOOD_OUTPUT, "tasks": [{"agent": "Evidence Specialist"}]}, "execution_time": 42.5}])
    info = await make(handler, routes=ROUTE).run("qualify_opportunity", {"x": 1})
    assert info.status == "ok" and info.backend == "northsea_crewai" and info.fallback_used is False
    assert info.actual_crew == "NorthSea Deal Execution Crew" and info.run_id == "k-123" and info.validation == "valid"
    assert info.models == ["gpt-5-mini"] and info.skills == [{"name": "assess_match", "version": 1}]
    assert info.tools == ["supabase:read"] and info.budget_usage == {"research_calls": 1}
    assert info.timings["crew_execution_s"] == 42.5 and "seller authority" in info.analysis.lower()


async def test_health_check_failure_falls_back_visibly():
    info = await make(studio([{"status": "completed"}], inputs=500), routes=ROUTE).run("qualify_opportunity", {})
    assert info.backend == "axe_general_crew" and info.fallback_used and info.fallback_reason == "health_check_failed"
    assert [a["outcome"] for a in info.attempts] == ["health_check_failed", "ok"]


async def test_capacity_exhausted_falls_back_visibly():
    info = await make(studio([{"status": "completed"}], kickoff=429), routes=ROUTE).run("qualify_opportunity", {})
    assert info.fallback_used and info.fallback_reason == "capacity_exhausted" and info.backend == "axe_general_crew"


async def test_dedicated_timeout_without_permission_does_not_fall_back():
    handler = studio([{"status": "running"}])
    info = await make(handler, routes=ROUTE, timeout=0.3, fallback_on=("dedicated_backend_not_configured",)).run("qualify_opportunity", {})
    assert info.fallback_used is False and info.backend is None and info.status == "unavailable"
    assert "not permitted by policy" in info.reason and info.attempts[0]["outcome"] == "timeout"


async def test_policy_none_blocks_fallback_even_when_not_configured():
    info = await make(lambda r: general_ok(r) or httpx.Response(404), fallback_on=()).run("research_counterparty", {})
    assert info.used is False and info.fallback_used is False and info.route == "discovery_run"
    assert "NorthSea Counterparty Intelligence & Sourcing not executed (dedicated_backend_not_configured)" in info.reason


async def test_invalid_dedicated_output_is_reported_not_silently_replaced():
    info = await make(studio([{"status": "completed", "result": {"output": "free text, not the contract"}}]), routes=ROUTE).run("qualify_opportunity", {})
    assert info.status == "invalid_output" and info.validation == "invalid" and info.fallback_used is False
    assert info.backend == "northsea_crewai" and "not JSON" in info.reason


async def test_dedicated_execution_error_is_reported_without_fallback():
    info = await make(studio([{"status": "error", "error": "Task execution failed"}]), routes=ROUTE).run("qualify_opportunity", {})
    assert info.status == "error" and info.fallback_used is False and "Task execution failed" in info.reason


async def test_general_crew_busy_is_reported_as_busy():
    def handler(req):
        return httpx.Response(200, json={"status": "error", "error": "Crew niet gestart: 2 crew-run(s) bezig; later opnieuw"})
    info = await make(handler).run("research_counterparty", {})
    assert info.status == "busy" and info.fallback_used and info.analysis is None


async def test_general_crew_timeout_is_reported():
    def handler(req):
        raise httpx.ReadTimeout("slow crew", request=req)
    info = await make(handler, timeout=25).run("investigate_blockers", {})
    assert info.status == "timeout" and info.fallback_used


def test_contract_parser_accepts_fenced_json_and_rejects_missing_analysis():
    ok, fout = parse_dedicated_output({"output": "```json\n" + GOOD_OUTPUT + "\n```"})
    assert ok and not fout
    bad, fout = parse_dedicated_output({"output": json.dumps({"models": ["x"]})})
    assert bad is None and "validation" in fout


def test_gateway_status_lists_routes_and_fallback_policy():
    g = CrewGateway(axe_api_url="http://api.test", axe_api_key="k", crew_venv_py="", studio_routes=ROUTE,
                    local_enabled=False)
    s = g.status()
    assert s["routes"]["deal_run"]["dedicated_configured"] is True
    assert s["routes"]["discovery_run"]["dedicated_configured"] is False
    assert s["studio_optional"] is True
    assert s["fallback"]["backend"] == "axe_general_crew" and "timeout" in s["fallback"]["permitted_reasons"]


@pytest.mark.parametrize("route", ["discovery", "deal", "intelligence", "operations"])
def test_config_reads_per_route_deployments(route, tmp_path):
    from northsea_mcp.config import Settings
    env = {"NORTHSEA_MCP_PUBLIC_URL": "https://mcp.test", "NORTHSEA_SUPABASE_URL": "https://a", "NORTHSEA_SUPABASE_SERVICE_ROLE": "x",
           "SUPABASE_URL": "https://b", "SUPABASE_SERVICE_ROLE": "y", "NORTHSEA_MCP_ALLOWED_USER_IDS": "u",
           f"NORTHSEA_CREW_{route.upper()}_URL": f"https://{route}.crewai.test", f"NORTHSEA_CREW_{route.upper()}_TOKEN": "t"}
    s = Settings.from_env(env)
    assert s.crew_routes == {f"{route}_run": (f"https://{route}.crewai.test", "t")}
    assert Settings.from_env({**env, "NORTHSEA_CREW_FALLBACK_ON": "none"}).crew_fallback_on == ()
