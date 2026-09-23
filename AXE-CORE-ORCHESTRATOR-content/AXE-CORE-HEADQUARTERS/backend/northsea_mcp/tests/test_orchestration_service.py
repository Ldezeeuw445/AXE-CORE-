"""Service-wiring: NorthSeaService.handle_event routeert echte events door de
deterministische master-orchestratie en legt provenance canoniek vast.

Gebruikt de bestaande fakes (FakeRepo/FakeCrew) — geen live LLM, geen netwerk.
"""
from __future__ import annotations

import pytest

from fakes import OPP
from northsea_mcp.service import Caller, NorthSeaService

ALL_SCOPES = frozenset({
    "northsea.read", "northsea.deal.read", "northsea.research", "northsea.deal.write",
    "northsea.communications.draft", "northsea.communications.send", "northsea.identity", "northsea.admin",
})


@pytest.fixture
def service(repo, research, crew) -> NorthSeaService:
    return NorthSeaService(repo, research, crew)


@pytest.fixture
def caller() -> Caller:
    return Caller(principal="user:luka", client_id="chatgpt", scopes=ALL_SCOPES)


def _event(**over):
    base = dict(
        event_id="evt-1", run_id="run-1", event_type="new_signal", source="axe-core",
        priority="P2", requesting_principal="user:luka",
        budget_envelope={"research_calls": 2, "premium_calls": 0, "max_seconds": 120},
        payload={"commodity": "copper_cathode", "opportunity_id": OPP},
    )
    base.update(over)
    return base


async def test_valid_event_routes_to_crew_and_records_provenance(service, caller, crew, repo):
    res = await service.handle_event(caller, _event())
    assert res.status == "ok"
    assert res.route == "discovery_run" and res.crew_family == "discovery"
    assert len(crew.runs) == 1                              # crew draaide één keer
    # canonieke provenance vastgelegd als deal_event, niet als feit
    events = await repo.list_deal_events(OPP)
    crew_events = [e for e in events if e["event_type"] == "crew_run"]
    assert len(crew_events) == 1
    assert crew_events[0]["metadata"]["route"] == "discovery_run"
    assert crew_events[0]["metadata"]["validation"] in ("valid", "not_validated")


async def test_invalid_event_fails_closed_no_crew_no_event(service, caller, crew, repo):
    bad = _event(event_type="do_whatever")               # onbekend type
    res = await service.handle_event(caller, bad)
    assert res.status == "schema_invalid"
    assert crew.runs == []                                  # GEEN crew
    assert await repo.list_deal_events(OPP) == []           # GEEN deal_event


async def test_policy_denied_no_crew(service, crew):
    caller = Caller(principal="user:luka", client_id="chatgpt", scopes=frozenset({"northsea.read"}))
    res = await service.handle_event(caller, _event())      # find_buyers vereist northsea.research
    assert res.status == "policy_denied"
    assert res.gate.code == "insufficient_scope"
    assert crew.runs == []


async def test_approval_required_no_crew(service, caller, crew, repo):
    ev = _event(event_type="prepare_outreach",
                payload={"opportunity_id": OPP, "sensitive_action": True, "draft": "introduce us to the buyer"},
                budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await service.handle_event(caller, ev)
    assert res.status == "approval_required"
    assert crew.runs == []
    assert await repo.list_deal_events(OPP) == []           # niets uitgevoerd, niets vastgelegd
