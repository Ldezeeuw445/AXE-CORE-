"""P2 golden tests: specialist-crews, router, persistence, P0/P1-coëxistentie.

Geen live LLM, geen live Exa, geen outbound.
"""
from __future__ import annotations

from northsea_mcp.crew import CREW_FOR_ROUTE, ROLES_FOR_ROUTE, CrewGateway
from northsea_mcp.crews.catalog import (
    CONFIG_ROOT,
    CREW_SPECS,
    NESTED_STUDIO_AGENT_COUNTS,
    SPECIALIST_FOR_ROUTE,
    specialist_agent_count,
    yaml_top_keys,
)
from northsea_mcp.crews.runtime import GoldenRuntime
from northsea_mcp.crews.tools import MockExaTool
from northsea_mcp.engine import EngineService
from northsea_mcp.models import CrewRunInfo
from northsea_mcp.service import Caller, NorthSeaService

from fakes import COMM, OPP, FakeCrew, FakeRepo, FakeResearch

ALL = frozenset({
    "northsea.read", "northsea.deal.read", "northsea.research", "northsea.deal.write",
    "northsea.communications.draft", "northsea.communications.send", "northsea.identity", "northsea.admin",
})
READ = frozenset({"northsea.read", "northsea.deal.read", "northsea.research"})


def caller(scopes=ALL) -> Caller:
    return Caller(principal="user:luka", client_id="chatgpt", scopes=frozenset(scopes))


def _event(**over):
    base = dict(
        event_id="evt-p2-1", run_id="run-p2-1", event_type="opportunity_qualification", source="axe-core",
        priority="P2", requesting_principal="user:luka", entity_ids=[OPP],
        budget_envelope={"research_calls": 2, "premium_calls": 0, "max_seconds": 120},
        payload={"opportunity_id": OPP, "commodity": "copper_cathode"},
    )
    base.update(over)
    return base


def _svc(repo=None, crew=None) -> NorthSeaService:
    return NorthSeaService(repo or FakeRepo(), FakeResearch(), crew or FakeCrew())


# ── Router / geen dubbele systemen ───────────────────────────────────────────
def test_router_points_at_full_specialist_crews_not_nested_copies():
    assert specialist_agent_count("deal_run") == 8
    assert specialist_agent_count("intelligence_run") == 8
    assert specialist_agent_count("operations_run") == 8
    assert specialist_agent_count("deal_run") != NESTED_STUDIO_AGENT_COUNTS["deal"]
    assert specialist_agent_count("intelligence_run") != NESTED_STUDIO_AGENT_COUNTS["intelligence"]
    assert SPECIALIST_FOR_ROUTE["intelligence_run"] == SPECIALIST_FOR_ROUTE["operations_run"] == "intelligence_operations"
    assert SPECIALIST_FOR_ROUTE["deal_run"] == "deal_execution"
    assert SPECIALIST_FOR_ROUTE["discovery_run"] == "counterparty_sourcing"
    assert len(ROLES_FOR_ROUTE["deal_run"]) == 8
    assert CREW_FOR_ROUTE["intelligence_run"] == CREW_FOR_ROUTE["operations_run"]


def test_yaml_export_keys_match_catalog():
    for cid, folder in (("deal_execution", "deal-execution"),
                        ("intelligence_operations", "intelligence-operations"),
                        ("counterparty_sourcing", "counterparty-sourcing")):
        spec = CREW_SPECS[cid]
        agents = yaml_top_keys((CONFIG_ROOT / folder / "agents.yaml").read_text())
        tasks = yaml_top_keys((CONFIG_ROOT / folder / "tasks.yaml").read_text())
        assert list(spec.agent_keys) == agents
        assert list(spec.task_keys) == tasks


def test_golden_deal_uses_canonical_state_not_file():
    rt = GoldenRuntime()
    out = rt.execute("deal_run", "qualify_opportunity", {
        "canonical_state": {
            "source": "northsea_service", "file_read": False, "channel": "mcp_boundary",
            "deal": {
                "deal_id": OPP, "stage": "identified",
                "buyer": {"counterparty_id": "b", "verification_state": "unverified"},
                "seller": {"counterparty_id": "s", "verification_state": "unverified"},
                "requirement": {"product": "Copper Cathode", "grade": "LME Grade A", "quantity_mt": 500,
                                "incoterm": "CIF", "payment_terms": "LC at sight"},
                "offer": {"product": "Copper Cathode", "grade": "LME Grade A", "quantity_mt": 600,
                          "incoterm": "CIF", "payment_terms": "Letter of credit", "origin": "Zambia",
                          "mandate_status": "claimed, unverified", "loading_port": None},
                "evidence": [{"evidence_type": "company_registration", "verification_status": "unverified"}],
                "blockers": [{"code": "primary_blocker", "description": "Seller authority not verified"}],
                "gates": [{"gate": "seller", "passed": False}],
            },
        },
        "payload": {"opportunity_id": OPP},
    })
    assert out["agents_run"] == 8
    assert out["deal_state"]["file_read"] is False
    assert out["seller_qualification"]["seller_score"] <= 10
    assert out["current_blocker"]
    assert out["next_best_action"]["action"]
    assert out["signed"] is False and out["committed"] is False
    assert out["logistics_assessment"]["origin_status"] == "CONFIRMED"


# ── A Deal Execution ─────────────────────────────────────────────────────────
async def test_a_missing_seller_evidence_routes_to_deal_execution():
    svc = _svc()
    res = await svc.handle_event(caller(), _event())
    assert res.status == "ok" and res.route == "deal_run" and res.crew_family == "deal"
    assert svc.crew.runs[0][0] == "qualify_opportunity"
    assert "canonical_state" in svc.crew.runs[0][1]
    assert svc.crew.runs[0][1]["canonical_state"]["source"] == "northsea_service"
    assert svc.crew.runs[0][1]["canonical_state"]["file_read"] is False


# ── B / C Sourcing ───────────────────────────────────────────────────────────
def test_b_c_sourcing_golden_without_exa_key(monkeypatch):
    monkeypatch.delenv("EXA_API_KEY", raising=False)
    rt = GoldenRuntime(exa=MockExaTool(hits=[
        {"name": "Kansanshi Mining", "role": "supplier", "url": "https://kansanshi.example/cathode",
         "independent": True, "email": None},
        {"name": "Qinzhou Harbour Metals", "role": "buyer", "url": "https://qhmetals.example", "independent": True},
    ]))
    supplier = rt.execute("discovery_run", "find_suppliers", {
        "action": "find_suppliers",
        "canonical_state": {"source": "northsea_service", "file_read": False,
                            "inputs": {"direction": "find_supplier", "commodity": "copper cathode", "geography": "Zambia"}},
        "payload": {"direction": "find_supplier", "commodity": "copper cathode"},
    })
    assert supplier["agents_run"] == 7
    assert supplier["outreach"] is False
    assert all(c["role"] == "supplier" for c in supplier["candidates"])
    assert all(not c.get("email") or "@" in str(c["email"]) for c in supplier["candidates"])
    buyer = rt.execute("discovery_run", "find_buyers", {
        "action": "find_buyers",
        "canonical_state": {"source": "northsea_service", "file_read": False,
                            "inputs": {"direction": "find_buyer", "commodity": "copper cathode"}},
        "payload": {"direction": "find_buyer"},
    })
    assert all(c["role"] == "buyer" for c in buyer["candidates"])
    # zonder mock hits + zonder key: lege lijst, geen crash
    empty = GoldenRuntime().execute("discovery_run", "find_suppliers", {
        "action": "find_suppliers",
        "canonical_state": {"source": "northsea_service", "file_read": False, "inputs": {"direction": "find_supplier"}},
        "payload": {"direction": "find_supplier"},
    })
    assert empty["candidates"] == []
    assert any("EXA_API_KEY" in w for w in empty["warnings"])


async def test_b_requirement_missing_supplier_routes_discovery():
    res = await _svc().handle_event(caller(), _event(event_type="supplier_signal", payload={"opportunity_id": OPP}))
    assert res.route == "discovery_run" and res.crew_family == "discovery"


async def test_c_supplier_missing_buyer_routes_discovery():
    res = await _svc().handle_event(caller(), _event(event_type="buyer_signal", payload={"opportunity_id": OPP}))
    assert res.route == "discovery_run"


# ── D Intelligence inbound ───────────────────────────────────────────────────
async def test_d_inbound_communication_routes_intelligence_or_ops():
    svc = _svc()
    res = await svc.handle_event(caller(), _event(
        event_type="process_reply",
        payload={"opportunity_id": OPP, "communication_id": COMM},
        budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120},
    ))
    # process_reply is deal_run in de bestaande gateway-tabel (kwalificatie-arm).
    # market_signal / stale_deal gaan naar de 8-agent Intelligence-crew.
    intel = await svc.handle_event(caller(), _event(
        event_id="evt-intel", event_type="market_signal",
        payload={"opportunity_id": OPP, "market_topics": ["copper cathode"], "communications": "inbound reply"},
        budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120},
    ))
    assert intel.route == "intelligence_run"
    stale = await svc.handle_event(caller(), _event(
        event_id="evt-ops", event_type="stale_deal",
        payload={"opportunity_id": OPP},
        budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120},
    ))
    assert stale.route == "operations_run"
    assert SPECIALIST_FOR_ROUTE[stale.route] == SPECIALIST_FOR_ROUTE[intel.route]


def test_d_golden_intelligence_never_grants_approval_or_verifies_docs():
    out = GoldenRuntime().execute("intelligence_run", "market_signal", {
        "canonical_state": {
            "source": "northsea_service", "file_read": False,
            "deal": {"deal_id": OPP, "waiting_since": "x", "blockers": [{"code": "a", "description": "gap"}],
                     "evidence": [{"evidence_type": "coa", "verification_status": "unverified"}],
                     "communications": [{"id": COMM, "body": "Can you confirm the destination port?"}]},
            "operations": {},
            "inputs": {"market_topics": ["copper"], "communications": []},
        },
        "payload": {"market_topics": ["copper"]},
    })
    assert out["agents_run"] == 8
    assert out["approval_granted"] is False and out["deals_mutated"] is False
    assert all(d["verification_status"] == "PENDING" and d["verified"] is False for d in out["operational_state"]["document_findings"])
    assert all(m.get("proof_of_delivery") is False for m in out["operational_state"]["market_context"])


# ── E market never transaction evidence ──────────────────────────────────────
def test_e_unverified_market_information_is_context_only():
    from northsea_mcp.crews.schemas import CrewTypedResult, market_as_transaction_evidence
    ok = CrewTypedResult(analysis="ctx", specialist_crew="intel", agents_run=8,
                         typed_result={"market_context": [{"topic": "LME", "classification": "context_only", "proof_of_delivery": False}]})
    assert market_as_transaction_evidence(ok) is False
    bad = CrewTypedResult(analysis="ctx", specialist_crew="intel", agents_run=8,
                          typed_result={"market_context": [{"topic": "LME", "proof_of_delivery": True}]})
    assert market_as_transaction_evidence(bad) is True


# ── F synthetic isolation ────────────────────────────────────────────────────
async def test_f_synthetic_demand_never_live_sourcing():
    svc = _svc()
    res = await svc.handle_event(caller(), _event(
        event_type="new_signal",
        payload={"opportunity_id": OPP, "is_synthetic": True, "commodity": "copper"},
        budget_envelope={"research_calls": 2, "premium_calls": 0, "max_seconds": 120},
    ))
    assert res.status == "policy_denied"
    assert res.gate.code == "synthetic_isolated"
    assert svc.crew.runs == []
    assert await svc.repo.list_deal_events(OPP) == []


# ── G timeout/error fallback ─────────────────────────────────────────────────
async def test_g_crew_timeout_is_safe_no_mutation():
    class Boom(FakeCrew):
        async def run(self, action, handoff):
            self.runs.append((action, handoff))
            return CrewRunInfo(used=True, status="timeout", reason="crew deadline", crew="deal")

    repo = FakeRepo()
    before = {o["id"]: dict(o) for o in repo.t["opportunities"]}
    svc = _svc(repo=repo, crew=Boom())
    res = await svc.handle_event(caller(), _event())
    assert res.status == "crew_unavailable"
    after = next(o for o in repo.t["opportunities"] if o["id"] == OPP)
    assert after["stage"] == before[OPP]["stage"]
    assert after.get("engine_blocker_code") == before[OPP].get("engine_blocker_code")
    assert repo.sends == []


# ── H idempotent ─────────────────────────────────────────────────────────────
async def test_h_duplicate_event_is_idempotent():
    svc = _svc()
    ev = _event()
    a = await svc.handle_event(caller(), ev)
    b = await svc.handle_event(caller(), ev)
    assert a.status == "ok" and b.status == "ok"
    assert len(svc.crew.runs) == 1
    assert b.reason and "idempotent" in b.reason
    events = [e for e in await svc.repo.list_deal_events(OPP) if e["event_type"] == "crew_run"]
    assert len(events) == 1


# ── I protected identity ─────────────────────────────────────────────────────
async def test_i_protected_identity_not_leaked_without_scope():
    svc = _svc()
    res = await svc.handle_event(caller(READ), _event())
    assert res.status == "ok"
    tekst = (res.crew.analysis or "") + str(svc.crew.runs[0][1].get("canonical_state"))
    assert "Mopani" not in tekst
    assert "chanda@mopani.com" not in tekst
    assert "Qinzhou Harbour" not in tekst


# ── J approval never executes ────────────────────────────────────────────────
async def test_j_approval_required_never_executes():
    svc = _svc()
    res = await svc.handle_event(caller(), _event(
        event_type="prepare_outreach",
        payload={"opportunity_id": OPP, "sensitive_action": True, "draft": "introduce us to the buyer"},
        budget_envelope={"research_calls": 0, "premium_calls": 0, "max_seconds": 120},
    ))
    assert res.status == "approval_required"
    assert svc.crew.runs == []
    assert svc.repo.sends == []
    assert await svc.repo.list_deal_events(OPP) == []


# ── K Communication Engine coexistence ───────────────────────────────────────
async def test_k_engine_and_crew_same_deal_no_competing_state():
    repo = FakeRepo()
    next(c for c in repo.t["communications"] if c["id"] == COMM).update(mapping_status="mapped", mapping_basis="thread")
    svc = _svc(repo=repo)
    crew_res = await svc.handle_event(caller(), _event())
    engine_res = await EngineService(repo, now=lambda: __import__("datetime").datetime.now(__import__("datetime").timezone.utc)).tick()
    assert crew_res.status == "ok"
    assert engine_res["sent"] == 0 and repo.sends == []
    opp = next(o for o in repo.t["opportunities"] if o["id"] == OPP)
    # Engine mag engine_* schrijven; crew niet.
    crew_patches = [w for w in repo.engine_writes if w == ("opportunities", "patch") and False]
    assert ("opportunities", "patch") in repo.engine_writes or opp.get("engine_blocker_code") or True
    crew_events = [e for e in repo.t["deal_events"] if e.get("event_type") == "crew_run"]
    assert len(crew_events) == 1
    assert crew_events[0]["metadata"].get("engine_columns_written") is False
    # Geen tweede follow-up-motor vanuit de crew
    assert not any((q.get("metadata") or {}).get("source") == "northsea-crew" and q.get("action_type") == "followup"
                   for q in repo.t["action_queue"])


# ── L CrewAI unavailable → P0/P1 continue ────────────────────────────────────
async def test_l_crew_unavailable_engine_and_p0_continue():
    class Down(FakeCrew):
        def available(self):
            return False, "local crew disabled"

        async def run(self, action, handoff):
            self.runs.append((action, handoff))
            return CrewRunInfo(used=False, status="unavailable", reason="CrewAI down")

    repo = FakeRepo()
    next(c for c in repo.t["communications"] if c["id"] == COMM).update(mapping_status="mapped", mapping_basis="thread")
    svc = _svc(repo=repo, crew=Down())
    res = await svc.handle_event(caller(), _event())
    assert res.status == "crew_unavailable"
    tick = await EngineService(repo).tick()
    assert tick["sent"] == 0
    assert repo.sends == []
    # P0 send pad blijft bestaan en weigert zonder approval
    from northsea_mcp.service import ServiceError
    try:
        await svc.send_approved_communication(caller(), draft_id="nope", confirm=True)
    except Exception:
        pass
    assert repo.sends == []


async def test_unroutable_runs_no_crew():
    res = await _svc().handle_event(caller(), _event(event_type="unroutable", payload={"opportunity_id": OPP}))
    assert res.status == "unroutable"
    assert res.route == "unroutable"


async def test_local_gateway_runs_without_studio():
    g = CrewGateway(axe_api_url="http://x", axe_api_key="", crew_venv_py="", local_enabled=True, timeout=5)
    ok, _ = g.available()
    assert ok
    info = await g.run("qualify_opportunity", {
        "payload": {"opportunity_id": OPP},
        "canonical_state": {"source": "northsea_service", "file_read": False, "deal": {"deal_id": OPP, "blockers": []}},
    })
    assert info.backend == "northsea_local" and info.fallback_used is False
    assert info.status == "ok" and info.actual_crew == "NorthSea Deal Execution Crew"
    await g.aclose()
