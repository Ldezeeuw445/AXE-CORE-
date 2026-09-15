"""De CrewAI-grens: echte HTTP-vorm van /crew/run, nagebootst met httpx.MockTransport."""
from __future__ import annotations

import json

import httpx

from northsea_mcp.crew import CrewGateway


def gateway(handler, timeout=5.0) -> CrewGateway:
    return CrewGateway(axe_api_url="http://api.test", axe_api_key="k", crew_venv_py="", timeout=timeout,
                       client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_successful_run_returns_unverified_analysis_and_sends_handoff():
    gezien = {}

    def handler(req: httpx.Request) -> httpx.Response:
        gezien["body"] = json.loads(req.content)
        gezien["auth"] = req.headers.get("authorization")
        return httpx.Response(200, json={"status": "ok", "result": "Missing: seller authority evidence.", "specialists": ["deal"]})

    info = await gateway(handler).run("qualify_opportunity", {"entity_ids": {"opportunity_id": "x"}, "prohibited_actions": ["no send"]})
    assert info.used and info.status == "ok" and info.crew == "deal" and "seller authority" in info.analysis
    assert gezien["auth"] == "Bearer k"
    context = json.loads(gezien["body"]["context"])
    assert context["crew"] == "deal" and context["entity_ids"] == {"opportunity_id": "x"}
    assert "Do not send any message." in gezien["body"]["task"]


async def test_busy_slots_are_reported_as_busy_not_error():
    info = await gateway(lambda r: httpx.Response(200, json={"status": "error", "error": "Crew niet gestart: 2 crew-run(s) bezig; later opnieuw"})).run(
        "research_counterparty", {})
    assert info.status == "busy" and info.analysis is None and "retry later" in info.reason


async def test_timeout_is_reported_and_does_not_raise():
    def handler(req):
        raise httpx.ReadTimeout("slow crew", request=req)

    info = await gateway(handler, timeout=1).run("investigate_blockers", {})
    assert info.status == "timeout" and "deterministic result returned" in info.reason


async def test_unavailable_without_key():
    g = CrewGateway(axe_api_url="http://api.test", axe_api_key="", crew_venv_py="")
    info = await g.run("qualify_opportunity", {})
    assert info.used is False and "key" in info.reason
