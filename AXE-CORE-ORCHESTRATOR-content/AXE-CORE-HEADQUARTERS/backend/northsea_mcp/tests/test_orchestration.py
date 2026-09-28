"""Golden tests voor de deterministische master-orchestratie (orchestration.py).

Synthetische fixtures, geen live LLM en geen netwerk: de gateway is een fake die
registreert ÓF hij is aangeroepen. Zo bewijzen we de grens deterministisch:
ongeldige/geweigerde/goedkeuringsplichtige events laten NOOIT een crew draaien.

Dekt de A–F uit de opdracht:
  A Discovery  — geldig → validatie PASS, policy PASS, crew draait
  B Operations — geldig, ontbrekende kwalificatie → crew draait, geen uitvoering
  C Intelligence — geldig → crew draait
  D Invalid event — validatie FAIL, geen crew
  E Policy failure — policy FAIL, geen crew
  F Approval action — approval gevraagd, geen crew
"""
from __future__ import annotations

import pytest

from northsea_mcp.models import CrewRunInfo
from northsea_mcp.orchestration import handle_event, validate_event, policy_gate

ALL_SCOPES = frozenset({
    "northsea.read", "northsea.deal.read", "northsea.research", "northsea.deal.write",
    "northsea.communications.draft", "northsea.communications.send", "northsea.identity", "northsea.admin",
})


class FakeGateway:
    """Registreert of de crew is aangeroepen; draait nooit echt iets."""

    def __init__(self, status: str = "ok"):
        self.calls: list[tuple[str, dict]] = []
        self._status = status

    async def run(self, action: str, handoff: dict) -> CrewRunInfo:
        self.calls.append((action, handoff))
        return CrewRunInfo(used=True, status=self._status, crew="test", analysis="unverified analysis",
                           backend="northsea_crewai", validation="valid")


def _event(**over):
    base = dict(
        event_id="evt-1", run_id="run-1", event_type="new_signal", source="test-fixture",
        priority="P2", entity_ids=[], requesting_principal="user:luka",
        budget_envelope={"research_calls": 2, "premium_calls": 0, "max_seconds": 120},
        payload={"commodity": "copper_cathode", "claim": "public buyer post"},
    )
    base.update(over)
    return base


# ── A — DISCOVERY ────────────────────────────────────────────────────────────
async def test_a_discovery_valid_executes():
    gw = FakeGateway()
    res = await handle_event(_event(), gw, ALL_SCOPES)
    assert res.status == "ok"
    assert res.validation.valid is True
    assert res.route == "discovery_run"
    assert res.crew_family == "discovery"
    assert len(gw.calls) == 1                      # crew draaide
    assert gw.calls[0][0] == "find_buyers"
    # onbewezen payload-claim wordt niet plotseling "verified"
    assert res.crew.validation == "valid" and res.crew.status == "ok"


# ── B — OPERATIONS ───────────────────────────────────────────────────────────
async def test_b_operations_qualification_executes():
    gw = FakeGateway()
    ev = _event(event_type="opportunity_qualification", entity_ids=["opp-42"],
                payload={"missing": ["buyer_authority", "payment_terms"]},
                budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "ok"
    assert res.route == "deal_run"
    assert res.crew_family == "deal"
    assert gw.calls and gw.calls[0][0] == "qualify_opportunity"


# ── C — INTELLIGENCE ─────────────────────────────────────────────────────────
async def test_c_intelligence_executes():
    gw = FakeGateway()
    ev = _event(event_type="market_signal", payload={"commodity": "copper", "context": "LME move"},
                budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "ok"
    assert res.route == "intelligence_run"
    assert res.crew_family == "intelligence"
    assert gw.calls and gw.calls[0][0] == "market_signal"


# ── D — INVALID EVENT (validatie FAIL, geen crew) ───────────────────────────
async def test_d_missing_required_field_fails_closed():
    gw = FakeGateway()
    bad = _event()
    del bad["requesting_principal"]
    res = await handle_event(bad, gw, ALL_SCOPES)
    assert res.status == "schema_invalid"
    assert res.validation.valid is False
    assert gw.calls == []                          # GEEN crew


async def test_d_unknown_event_type_fails_closed():
    gw = FakeGateway()
    res = await handle_event(_event(event_type="please_do_something"), gw, ALL_SCOPES)
    assert res.status == "schema_invalid"
    assert gw.calls == []


async def test_d_ambiguous_boolean_fails_closed():
    gw = FakeGateway()
    ev = _event(payload={"sensitive_action": "maybe"})
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "schema_invalid"
    assert any("sensitive_action" in e for e in res.validation.errors)
    assert gw.calls == []


async def test_d_extra_field_fails_closed():
    gw = FakeGateway()
    ev = _event(surprise="unexpected")
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "schema_invalid"
    assert gw.calls == []


# ── E — POLICY FAILURE (policy FAIL, geen crew) ─────────────────────────────
async def test_e_insufficient_scope_denies():
    gw = FakeGateway()
    # new_signal → find_buyers vereist northsea.research + northsea.read
    res = await handle_event(_event(), gw, frozenset({"northsea.read"}))
    assert res.status == "policy_denied"
    assert res.gate.code == "insufficient_scope"
    assert "northsea.research" in res.gate.missing_scopes
    assert gw.calls == []


async def test_e_budget_exhausted_denies():
    gw = FakeGateway()
    ev = _event(budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await handle_event(ev, gw, ALL_SCOPES)          # research-actie zonder research-budget
    assert res.status == "policy_denied"
    assert res.gate.code == "budget_exhausted"
    assert gw.calls == []


# ── F — APPROVAL ACTION (approval gevraagd, geen uitvoering) ─────────────────
async def test_f_sensitive_payload_requires_approval():
    gw = FakeGateway()
    ev = _event(event_type="prepare_outreach", entity_ids=["opp-7"],
                payload={"sensitive_action": True, "draft": "introduce us to the buyer"},
                budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "approval_required"
    assert res.gate.approval_required is True
    assert gw.calls == []                          # crew draait NIET


async def test_f_approval_policy_required_blocks_execution():
    gw = FakeGateway()
    ev = _event(approval_policy="required")
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "approval_required"
    assert gw.calls == []


# ── Grens-eenheidstests ──────────────────────────────────────────────────────
def test_string_true_normalized_once():
    ev, val = validate_event(_event(payload={"verified": "true", "sensitive_action": "false"}))
    assert val.valid and ev is not None
    assert ev.payload["verified"] is True and ev.payload["sensitive_action"] is False


def test_gate_ok_for_clean_discovery():
    ev, _ = validate_event(_event())
    g = policy_gate(ev, ALL_SCOPES)
    assert g.allowed and g.code == "ok"


async def test_unroutable_event_does_not_run_a_crew():
    gw = FakeGateway()
    res = await handle_event(_event(event_type="unroutable"), gw, ALL_SCOPES)
    assert res.status == "unroutable"
    assert res.route == "unroutable"
    assert gw.calls == []


async def test_stale_deal_operations_uses_intelligence_family_route():
    gw = FakeGateway()
    ev = _event(event_type="stale_deal", payload={"opportunity_id": "opp-1"},
                budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await handle_event(ev, gw, ALL_SCOPES)
    assert res.status == "ok"
    assert res.route == "operations_run"
    assert res.crew_family == "operations"
    assert gw.calls[0][0] == "stale_deal"
    # handoff names the full 8-agent Intelligence & Operations crew, not a 2-agent nested copy
    assert "Operations Controller" in gw.calls[0][1]["roles"]
    assert len(gw.calls[0][1]["roles"]) == 8


async def test_deal_handoff_names_full_eight_agent_crew_not_nested_three():
    gw = FakeGateway()
    ev = _event(event_type="opportunity_qualification", entity_ids=["opp-42"],
                payload={"missing": ["buyer_authority"]},
                budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120})
    res = await handle_event(ev, gw, ALL_SCOPES)
    roles = gw.calls[0][1]["roles"]
    assert res.crew_family == "deal"
    assert len(roles) == 8
    assert "Deal Manager" in roles and "Next Best Action Agent" in roles
    assert "Deal Qualification Specialist" not in roles  # nested Studio copy


async def test_discovery_handoff_names_counterparty_crew_not_nested_six():
    gw = FakeGateway()
    res = await handle_event(_event(), gw, ALL_SCOPES)
    roles = gw.calls[0][1]["roles"]
    assert res.route == "discovery_run"
    assert "Buyer Hunter" in roles and "Sourcing Supervisor" in roles
    assert len(roles) == 7


async def test_optional_discovery_to_deal_handoff_is_opt_in():
    gw = FakeGateway()
    res = await handle_event(_event(payload={"handoff_to_deal": True, "opportunity_id": "opp-1",
                                             "commodity": "copper_cathode"}), gw, ALL_SCOPES)
    assert res.status == "ok"
    assert [a for a, _ in gw.calls] == ["find_buyers", "qualify_opportunity"]
    assert res.route == "deal_run"


async def test_default_is_one_specialist_not_all_crews():
    gw = FakeGateway()
    await handle_event(_event(), gw, ALL_SCOPES)
    assert len(gw.calls) == 1

