"""De gedeelde servicelaag, zonder MCP ertussen -- zo roept AXE CORE hem ook aan."""
from __future__ import annotations

import json

import pytest

from conftest import ALL, READ, caller
from fakes import BUYER_CO, COMM, OFFER, OPP, OTHER_OFFER, REQ, SELLER_CO, TASK, FakeResearch
from northsea_mcp.research import ResearchError
from northsea_mcp.service import NotFound, ServiceError

GEHEIM = ("Mopani", "mopani.com", "Chanda", "chanda@", "Qinzhou Harbour", "qhmetals", "Li Wei", "+260")


def no_leak(model) -> None:
    tekst = json.dumps(model.model_dump(mode="json"))
    for g in GEHEIM:
        assert g not in tekst, f"leaked {g!r}"


async def test_review_deal_state_is_deterministic_and_complete(service, crew, research):
    r = await service.review_deal(caller(READ), opportunity_id=OPP)
    assert r.stage == "identified" and r.code == "DEAL-001"
    assert len(r.gates) == 9 and not any(g.passed for g in r.gates)
    seller_gate = next(g for g in r.gates if g.gate == "seller")
    assert seller_gate.evidence_count == 1
    codes = {b.code for b in r.open_blockers}
    assert {"primary_blocker", "seller_authority_not_evidenced", "commission_protection_not_signed", "gate_buyer_open"} <= codes
    assert r.commercial_fit_score == 100 and r.transaction_readiness_score == 0
    assert any(d["overdue"] for d in r.deadlines)
    assert r.next_best_actions and r.next_best_actions[0].rank == 1
    assert crew.runs == [] and research.asks == []  # geen agent en geen onderzoek voor een leesactie
    no_leak(r)


async def test_next_actions_are_ranked_and_deduplicated(service):
    acties = (await service.get_next_actions(caller(READ), opportunity_id=OPP)).actions
    assert [a.rank for a in acties] == list(range(1, len(acties) + 1))
    titels = [a.title.lower() for a in acties]
    assert len(titels) == len(set(titels))
    commissie = next(a for a in acties if a.source == "policy:commission_protection")
    assert commissie.requires_approval and commissie.owner == "luka"
    overdue = next(a for a in acties if a.source.startswith("deal_tasks:"))
    assert overdue.urgency == "overdue" and overdue.impact == "high"


async def test_unknown_opportunity_is_not_found(service):
    with pytest.raises(NotFound):
        await service.review_deal(caller(READ), opportunity_id="00000000-0000-4000-8000-000000000000")


async def test_research_counterparty_redacts_findings_and_own_domain_sources(service, research):
    r = await service.research_counterparty(caller({"northsea.research"}), counterparty_id=SELLER_CO,
                                            objective="verify seller authority", priority="P2")
    assert r.research.status == "completed" and r.research.cost_usd > 0
    assert "[counterparty]" in r.findings and "[email]" in r.findings
    assert all("mopani.com" not in s.url for s in r.sources)
    assert r.verification_state == "unverified"
    assert all(c.state != "verified" or c.basis == "verification_checks" for c in r.claims)
    assert r.crew.used is False
    no_leak(r)


async def test_research_with_identity_scope_keeps_names(service):
    r = await service.research_counterparty(caller(ALL), counterparty_id=SELLER_CO, objective="verify seller authority")
    assert "Mopani Copper Mines PLC" in r.findings
    assert r.counterparty.company_name == "Mopani Copper Mines PLC"


async def test_research_budget_exhausted_is_reported_not_raised(repo, crew):
    from northsea_mcp.service import NorthSeaService
    svc = NorthSeaService(repo, FakeResearch(fail=ResearchError("budget_exhausted", "The shared daily research budget is spent.")), crew)
    r = await svc.research_counterparty(caller(ALL), counterparty_id=SELLER_CO, objective="verify seller authority")
    assert r.research.status == "budget_exhausted" and r.findings == ""
    assert r.open_questions and r.blockers


async def test_research_requires_id_or_context(service):
    with pytest.raises(ServiceError):
        await service.research_counterparty(caller(ALL), objective="anything useful")


async def test_deep_depth_uses_crew_and_redacts_its_analysis(service, crew):
    r = await service.research_counterparty(caller({"northsea.research"}), counterparty_id=SELLER_CO,
                                            objective="verify seller authority", depth="deep")
    assert r.crew.used and r.crew.status == "ok" and len(crew.runs) == 1
    assert "Mopani" not in (r.crew.analysis or "") and "chanda@" not in (r.crew.analysis or "")
    assert "prohibited_actions" in crew.runs[0][1]


async def test_find_suppliers_scores_database_and_deduplicates_web(service, research):
    r = await service.find_suppliers(caller({"northsea.research", "northsea.read"}), buyer_requirement_id=REQ, geography="Zambia")
    db = [c for c in r.candidates if c.source_type == "database_offer"]
    web = [c for c in r.candidates if c.source_type == "web_search"]
    assert {c.existing_entity_id for c in db} == {OFFER, OTHER_OFFER}
    assert next(c for c in db if c.existing_entity_id == OFFER).preliminary_score == 100
    assert r.dedupe.duplicates_removed == 1          # tweede kansanshi-URL
    assert r.dedupe.already_in_database >= 3         # mopani.com bekend + 2 offers
    assert len(web) == 2 and all(c.preliminary_score <= 80 and c.verification_state == "unverified" for c in web)
    markt = next(c for c in web if any("marketplace" in x for x in c.fit_reasons))
    raffinaderij = next(c for c in web if any("producer" in x for x in c.fit_reasons))
    assert raffinaderij.preliminary_score > markt.preliminary_score
    assert all(c.name is None and c.website is None and c.source_url is None for c in r.candidates)
    assert r.persisted is False
    no_leak(r)


async def test_find_buyers_for_offer(service):
    r = await service.find_buyers(caller({"northsea.research", "northsea.read"}), supplier_offer_id=OFFER)
    assert any(c.existing_entity_id == REQ for c in r.candidates)
    assert r.anchor["supplier"].startswith("Supplier · Zambia")


async def test_assess_match_separates_fit_and_readiness(service):
    m = await service.assess_match(caller(READ), buyer_requirement_id=REQ, supplier_offer_id=OFFER)
    assert m.commercial_fit_score == 100 and m.meets_match_threshold
    assert m.transaction_readiness_score == 0
    assert m.existing_opportunity_id == OPP
    assert any(b.code == "seller_authority_not_evidenced" for b in m.blockers)
    m2 = await service.assess_match(caller(READ), buyer_requirement_id=REQ, supplier_offer_id=OTHER_OFFER)
    assert {c["field"] for c in m2.conflicts} >= {"incoterm"}
    assert m2.commercial_fit_score < 100


async def test_qualify_recommends_tasks_and_communications_without_passing_gates(service, repo):
    q = await service.qualify_opportunity(caller(READ), opportunity_id=OPP)
    assert not any(g.passed for g in q.gates)
    assert q.evidence_state["total"] == 1
    assert any(t["blocker_code"] == "commission_protection_not_signed" and t["requires_approval"] for t in q.task_recommendations)
    templates = {c["template"] for c in q.communication_recommendations}
    assert {"supplier_qualification", "buyer_qualification", "follow_up"} <= templates
    assert all(not repo.t["opportunities"][0][f"{g}_gate_passed"] for g in ("buyer", "seller"))


async def test_investigate_blockers_never_resolves_on_research_alone(service, research, repo):
    r = await service.investigate_blockers(caller({"northsea.research", "northsea.deal.read"}), opportunity_id=OPP, priority="P1")
    assert r.resolved == []
    assert r.new_evidence and all(e.state == "unverified" for e in r.new_evidence)
    assert all("human" in u["reason"] or "Needs human" in u["reason"] or "budget" in u["reason"] for u in r.unresolved)
    assert len(research.asks) <= 3                                  # P1-budget
    assert "Mopani Copper Mines cathode sales authority" in research.asks[0] or any("Mopani" in q for q in research.asks)
    assert repo.t["opportunities"][0]["primary_blocker"]            # niets gewijzigd
    no_leak(r)


async def test_investigate_unknown_blocker_code_is_reported(service):
    r = await service.investigate_blockers(caller(ALL), opportunity_id=OPP, blocker_codes=["gate_settlement_open"])
    assert r.investigated == [] and r.resolved[0]["code"] == "gate_settlement_open"


async def test_prepare_outreach_to_supplier_never_names_the_buyer_and_never_sends(service, repo):
    d = await service.prepare_outreach(caller({"northsea.communications.draft"}), opportunity_id=OPP,
                                       objective="qualify the seller before any introduction")
    assert d.template in ("supplier_qualification", "follow_up") and d.sent is False and d.approval_required
    assert "Qinzhou Harbour" not in d.body and "qhmetals" not in d.body and "Li Wei" not in d.body
    assert "No counterparty introduction or binding commercial commitment" in d.body
    assert not any(line.lstrip().startswith(">") for line in d.body.splitlines())
    assert d.to_email is None and d.saved_draft_id is None
    assert repo.sends == [] and len(repo.t["reply_drafts"]) == 3


async def test_prepare_outreach_can_save_pending_draft_only(service, repo):
    d = await service.prepare_outreach(caller(ALL), opportunity_id=OPP, template="supplier_qualification",
                                       objective="request authority documents", save_as_pending_draft=True)
    assert d.saved_status == "pending" and d.to_email == "chanda@mopani.com"
    saved = next(x for x in repo.t["reply_drafts"] if x["id"] == d.saved_draft_id)
    assert saved["approval_status"] == "pending" and saved["generated_by"] == "northsea-mcp" and saved["sent_at"] is None
    assert saved["communication_id"] == COMM          # antwoord op de bestaande e-mail van de verkoper


async def test_outreach_without_inbound_email_is_returned_but_not_saved(service, repo):
    # De koper heeft een contact met e-mail, maar nooit zelf gemaild: geen draad om op te antwoorden.
    d = await service.prepare_outreach(caller(ALL), opportunity_id=OPP, template="buyer_qualification",
                                       objective="qualify the buyer requirement", save_as_pending_draft=True)
    assert d.saved_draft_id is None and d.saved_status == "not_saved_no_email_thread"
    assert d.body and any("Not saved" in n for n in d.notes)
    assert len(repo.t["reply_drafts"]) == 3


async def test_prepare_outreach_flags_sensitive_objective(service):
    d = await service.prepare_outreach(caller(ALL), opportunity_id=OPP, objective="introduce us to the buyer and agree commission")
    assert d.sensitive and any("commission protection" in n for n in d.notes)
    assert "commission" not in d.body.lower().replace("no counterparty introduction", "")


async def test_process_reply_extracts_facts_questions_and_changed_terms(service):
    r = await service.process_reply(caller(READ), communication_id=COMM)
    assert r.classification == "supplier" and r.analysis_source == "email_intelligence"
    assert {f.field for f in r.facts} == {"quantity_mt", "incoterm", "payment_terms"}
    assert all(f.state == "unverified" for f in r.facts)
    changed = {c["field"] for c in r.changed_terms}
    assert changed == {"quantity_mt", "incoterm", "payment_terms"}
    assert r.questions and "destination port" in r.questions[0]
    assert r.recommended_reply["draft_id"]
    assert any(t["task_type"] == "review_terms" for t in r.recommended_tasks)
    no_leak(r)


async def test_health_reports_components(service):
    h = await service.health()
    assert h["supabase"] is True and h["crewai"] is True and h["research_perplexity"] is True


async def test_create_task_deduplicates_identical_open_task(service, repo):
    eerste = await service.create_task(caller(ALL), opportunity_id=OPP, title="Verify Mopani seller authority", task_type="resolve_blocker")
    assert eerste.duplicate_of_existing and eerste.task_id == TASK and not eerste.created
    nieuw = await service.create_task(caller(ALL), opportunity_id=OPP, title="Request COA from seller", priority=70)
    assert nieuw.created and len([t for t in repo.t["deal_tasks"] if t["title"] == "Request COA from seller"]) == 1
    assert repo.t["deal_events"][-1]["event_type"] == "task_created"


async def test_update_task_rejects_stale_write(service):
    with pytest.raises(Exception) as e:
        await service.update_task(caller(ALL), task_id=TASK, status="in_progress", expected_updated_at="2020-01-01T00:00:00+00:00")
    assert getattr(e.value, "code", "") == "conflict"


async def test_unused_buyer_company_constant_is_valid():
    assert BUYER_CO.count("-") == 4
