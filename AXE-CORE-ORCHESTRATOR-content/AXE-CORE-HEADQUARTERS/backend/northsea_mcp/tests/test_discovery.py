"""LOOP A/B discovery: two-phase (select-then-persist), bounded BEFORE any write, atomic per
candidate (compensating rollback on a failed child write), never duplicates, never invents a party.

This module's original one-phase design caused a real production incident (2026-09-19): a
schema mismatch in insert_match_assessment made every single write fail, but the run/day cap
counter only advanced on full success, so it silently created 774 opportunities instead of 5
before a server timeout finally stopped it. Every test below exists because of a specific
lesson from that incident, named in the test."""
from __future__ import annotations

from datetime import datetime, timezone

from fakes import OFFER, OTHER_OFFER, OTHER_SELLER_CO, REQ, FakeCrew, FakeRepo, FakeResearch
from northsea_mcp.discovery import DiscoveryService
from northsea_mcp.models import CrewRunInfo
from northsea_mcp.research import ResearchError

NU = datetime(2026, 9, 19, 18, 0, tzinfo=timezone.utc)


def disc(repo, **kw):
    return DiscoveryService(repo, now=lambda: NU, **kw)


def _tweede_req(repo):
    return {**repo.t["buyer_requirements"][0], "id": "77777777-7777-4777-8777-777777777777",
           "company_id": "88888888-8888-4888-8888-888888888888"}


async def test_sweep_pairs_an_unmatched_requirement_and_offer_above_threshold():
    repo = FakeRepo()
    uit = await disc(repo).sweep()
    assert uit["created"] == 1 and uit["errors"] == []
    nieuw = next(o for o in repo.t["opportunities"] if o["id"] == uit["created_ids"][0])
    assert nieuw["buyer_requirement_id"] == REQ and nieuw["supplier_offer_id"] == OTHER_OFFER
    assert nieuw["match_score"] >= 60 and nieuw["stage"] == "identified" and nieuw["execution_state"] == "discovered"
    assert nieuw["qualification_status"] == "unqualified" and nieuw["approval_required"] is False
    assert all(nieuw[f"{g}_gate_passed"] is False for g in ("buyer", "seller", "commercial", "evidence", "protection"))
    beoordeling = next(m for m in repo.t["match_assessments"] if m["supplier_offer_id"] == OTHER_OFFER)
    assert beoordeling["overall_score"] == nieuw["match_score"] and beoordeling["opportunity_id"] == nieuw["id"]
    assert beoordeling["executable"] is False
    event = next(e for e in repo.t["deal_events"] if e["event_type"] == "opportunity_discovered")
    assert event["opportunity_id"] == nieuw["id"] and event["actor"] == "northsea-discovery"


async def test_match_assessment_uses_only_real_schema_columns():
    """The incident's root cause: matching_fields/conflicts/method are not real columns. Locks the
    exact real column set (verified against the live schema during incident remediation) so a future
    change can't silently reintroduce a column that doesn't exist."""
    repo = FakeRepo()
    await disc(repo).sweep()
    beoordeling = repo.t["match_assessments"][0]
    echte_kolommen = {"id", "buyer_requirement_id", "supplier_offer_id", "opportunity_id", "overall_score",
                      "product_score", "quantity_score", "geography_score", "incoterm_score", "payment_score",
                      "timing_score", "verification_score", "blockers", "missing_information", "executable",
                      "assessed_at", "created_at"}
    assert set(beoordeling.keys()) <= echte_kolommen, set(beoordeling.keys()) - echte_kolommen


async def test_sweep_never_duplicates_an_existing_pairing():
    repo = FakeRepo()
    # REQ x OFFER already has an opportunity (the seed OPP); only REQ x OTHER_OFFER is genuinely new.
    await disc(repo).sweep()
    voor = len(repo.t["opportunities"])
    uit = await disc(repo).sweep()
    assert uit["created"] == 0  # de enige goede paring bestaat nu al (idempotente herhaling)
    assert len(repo.t["opportunities"]) == voor


async def test_sweep_never_pairs_a_party_with_itself():
    repo = FakeRepo()
    for o in repo.t["supplier_offers"]:
        if o["id"] == OTHER_OFFER:
            o["company_id"] = repo.t["buyer_requirements"][0]["company_id"]
    uit = await disc(repo).sweep()
    assert uit["created"] == 0


async def test_sweep_respects_the_per_run_cap():
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    uit = await disc(repo, max_new_per_run=1).sweep()
    assert uit["created"] == 1 and uit["candidates_found"] >= 2  # minstens twee kandidaten, cap staat op 1


async def test_sweep_respects_the_per_day_cap_across_runs():
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    d = disc(repo, max_new_per_run=5, max_new_per_day=1)
    eerste = await d.sweep()
    tweede = await d.sweep()
    assert eerste["created"] == 1 and tweede["created"] == 0  # dagbudget al op na de eerste run
    assert tweede["created_today_total"] == 1


async def test_dry_run_creates_nothing():
    repo = FakeRepo()
    voor = len(repo.t["opportunities"])
    uit = await disc(repo).sweep(dry_run=True)
    assert uit["would_create"] == 1 and len(uit["would_create_pairs"]) == 1
    assert uit["would_create_pairs"][0]["supplier_offer_id"] == OTHER_OFFER
    assert len(repo.t["opportunities"]) == voor  # gerapporteerd, niet geschreven
    assert repo.t["match_assessments"] == [] and repo.t["deal_events"] == []


async def test_testcase_requirements_and_offers_are_never_paired():
    """Found during the live controlled proof after the incident: the dry-run's top candidates were
    ALL against a real STRATO/Jasmine test fixture (buyer_requirement 7c328c1a...), which the codebase
    already knows how to recognise (canon.testcase_reason) everywhere else. Discovery must use the
    same recognition, not invent its own."""
    repo = FakeRepo()
    testcase_req = {**repo.t["buyer_requirements"][0], "id": "7c328c1a-fd41-4592-86bb-de954a384e2b",
                    "evidence": "STRATO TEST CALL: synthetic Jasmine qualification test; caller-stated details only.",
                    "companies": None}
    repo.t["buyer_requirements"].append(testcase_req)
    synthetic_offer = {**repo.t["supplier_offers"][0], "id": "99999999-0000-4000-8000-000000000001",
                       "is_synthetic": True, "synthetic_reason": "load test fixture", "companies": None}
    repo.t["supplier_offers"].append(synthetic_offer)
    uit = await disc(repo).sweep(dry_run=True)
    paren = {(p["buyer_requirement_id"], p["supplier_offer_id"]) for p in uit["would_create_pairs"]}
    assert not any(p[0] == testcase_req["id"] or p[1] == synthetic_offer["id"] for p in paren)


async def test_below_threshold_pairs_are_never_created():
    repo = FakeRepo()
    for o in repo.t["supplier_offers"]:
        if o["id"] == OTHER_OFFER:
            o["commodity"], o["product"] = "Zinc", "Zinc Ingot"
    uit = await disc(repo).sweep()
    assert uit["created"] == 0 and uit["considered_pairs"] >= 1


# ── Lessen uit het incident van 19 sep 2026 ─────────────────────────────────────

async def test_a_failed_child_write_rolls_back_the_opportunity_itself():
    """The exact incident scenario: insert_match_assessment fails on a real schema mismatch. No
    opportunity may survive without its assessment -- this is the compensating rollback."""
    repo = FakeRepo()
    repo.fail_insert_match_assessment = True
    voor = len(repo.t["opportunities"])
    uit = await disc(repo).sweep()
    assert uit["created"] == 0 and len(uit["errors"]) == 1
    assert len(repo.t["opportunities"]) == voor  # de opportunity die WEL even bestond is weer weg
    assert repo.t["match_assessments"] == [] and repo.t["deal_events"] == []


async def test_repeated_failures_can_never_create_more_than_the_cap():
    """The incident's actual failure mode: EVERY iteration failed the same way, and because the cap
    counter only moved on success, nothing ever stopped it. Selection now happens entirely before any
    write, so the number of write ATTEMPTS is bounded by the cap regardless of how many fail."""
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    repo.fail_insert_match_assessment = True
    voor = len(repo.t["opportunities"])
    uit = await disc(repo, max_new_per_run=1).sweep()
    assert uit["created"] == 0
    assert uit["selected"] == 1  # nooit meer geprobeerd dan de cap, ook al faalt elke poging
    assert len(uit["errors"]) == 1
    assert len(repo.t["opportunities"]) == voor  # niets overleeft, ook geen half aangemaakte rij


async def test_selection_never_writes_even_when_many_candidates_exist():
    """Cancellation/timeout safety: the SELECT phase is pure reads. However many pairs qualify,
    nothing is written until the (already-capped) candidate list is finalised."""
    repo = FakeRepo()
    for i in range(20):
        repo.t["buyer_requirements"].append({**_tweede_req(repo), "id": f"9{i:07x}-0000-4000-8000-000000000000"})
    d = disc(repo, max_new_per_run=3)
    # Handmatig alleen de selectiefase aanroepen is niet blootgelegd; in plaats daarvan bevestigen we
    # het waarneembare gedrag: van >=20 kandidaten wordt precies de cap geschreven, nooit meer.
    uit = await d.sweep()
    assert uit["candidates_found"] >= 20 and uit["created"] == 3 and uit["selected"] == 3


async def test_daily_cap_reduces_the_selected_slate_not_just_the_outcome():
    """The cap must shrink the SELECTED list (ruimte = min(per_run, per_day - used)), not just be
    checked after the fact -- otherwise a large per-run cap with a nearly-exhausted daily budget
    would still attempt more writes than the day allows."""
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    repo.t["deal_events"].append({"event_type": "opportunity_discovered", "actor": "northsea-discovery",
                                  "created_at": NU.isoformat(), "opportunity_id": "x"})
    uit = await disc(repo, max_new_per_run=10, max_new_per_day=1).sweep(dry_run=True)
    assert uit["would_create"] == 0  # dagbudget (1) al verbruikt door de eerdere event; per_run (10) doet er niet toe


async def test_max_new_override_can_only_lower_the_run_cap_never_raise_it():
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    laag = await disc(repo, max_new_per_run=5).sweep(dry_run=True, max_new_override=1)
    assert laag["would_create"] == 1  # override verlaagt de configured cap (5) naar 1
    hoog = await disc(repo, max_new_per_run=1).sweep(dry_run=True, max_new_override=99)
    assert hoog["would_create"] == 1  # override mag de configured cap (1) nooit optillen


# ── Governed crew invocation (net-new candidates) ───────────────────────────────

class _StubCrew:
    def __init__(self, info: CrewRunInfo):
        self._info = info
        self.calls: list[tuple[str, dict]] = []

    async def run(self, action, handoff):
        self.calls.append((action, handoff))
        return self._info


def _ok_crew_info(**overrides):
    velden = dict(used=True, status="ok", route="discovery_run", backend="northsea_local", execution_mode="deterministic",
                 analysis="Found 2 plausible producers via public registry search; neither confirmed as authorised seller.",
                 requested_specialists=["Sourcing Analyst"], actual_specialists=["Sourcing Analyst"],
                 fallback_used=False, validation="valid", audit_references=["run-1"])
    velden.update(overrides)
    return CrewRunInfo(**velden)


async def test_crew_review_is_skipped_without_a_crew_gateway():
    repo = FakeRepo()
    uit = await disc(repo).crew_assisted_review()
    assert uit["skipped"] is True and "no crew gateway" in uit["reason"]


async def test_crew_review_persists_the_actual_candidates_not_just_a_count():
    """Without this, the Chase item's description only says '6 ranked candidate(s)' and a human has
    nothing concrete to approve or reject -- the structured_output carries the real names/urls/scores."""
    repo = FakeRepo()
    crew = _StubCrew(_ok_crew_info(structured_output={
        "candidates": [{"name": "Mopani Copper Mines", "url": "https://www.mopani.com", "fit_score": 80}],
        "rejected": [{"name": "Some Broker Ltd", "fit_score": 0}]}))
    await disc(repo, crew=crew).crew_assisted_review()
    rij = next(q for q in repo.t["action_queue"] if q["action_type"] == "crew_candidate_review")
    assert rij["metadata"]["candidates"] == [{"name": "Mopani Copper Mines", "url": "https://www.mopani.com", "fit_score": 80}]
    assert rij["metadata"]["rejected"] == [{"name": "Some Broker Ltd", "fit_score": 0}]


async def test_crew_review_creates_a_chase_item_never_a_fact():
    repo = FakeRepo()
    voor_bedrijven = len(repo.t["companies"])
    voor_reqs = len(repo.t["buyer_requirements"])
    voor_offers = len(repo.t["supplier_offers"])
    voor_opps = len(repo.t["opportunities"])
    crew = _StubCrew(_ok_crew_info())
    uit = await disc(repo, crew=crew).crew_assisted_review()
    assert uit["created_review"] is True and len(crew.calls) == 1
    assert crew.calls[0][0] == "find_suppliers"
    rij = next(q for q in repo.t["action_queue"] if q["action_type"] == "crew_candidate_review")
    assert rij["status"] == "open" and rij["requires_approval"] is True  # nooit automatisch uitgevoerd
    assert "Found 2 plausible producers" in rij["description"]
    md = rij["metadata"]
    assert md["crew_route"] == "discovery_run" and md["crew_backend"] == "northsea_local"
    assert md["execution_mode"] == "deterministic" and md["actual_specialists"] == ["Sourcing Analyst"]
    assert md["audit_references"] == ["run-1"]
    # geen enkele company/requirement/offer/opportunity is aangemaakt uit de crew-analyse zelf
    assert len(repo.t["companies"]) == voor_bedrijven and len(repo.t["buyer_requirements"]) == voor_reqs
    assert len(repo.t["supplier_offers"]) == voor_offers and len(repo.t["opportunities"]) == voor_opps


async def test_crew_review_never_reviews_the_same_requirement_twice():
    repo = FakeRepo()
    crew = _StubCrew(_ok_crew_info())
    eerste = await disc(repo, crew=crew).crew_assisted_review()
    assert eerste["created_review"] is True and eerste["buyer_requirement_id"] == REQ
    tweede = await disc(repo, crew=crew).crew_assisted_review()
    # met maar één actieve requirement in de seed, nu al gereviewed, is er niets nieuws
    assert tweede["skipped"] is True and len(crew.calls) == 1


async def test_crew_review_moves_to_the_next_requirement_once_the_first_is_reviewed():
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    crew = _StubCrew(_ok_crew_info())
    eerste = await disc(repo, crew=crew).crew_assisted_review()
    tweede = await disc(repo, crew=crew).crew_assisted_review()
    assert eerste["created_review"] is True and tweede["created_review"] is True
    assert eerste["buyer_requirement_id"] != tweede["buyer_requirement_id"]
    derde = await disc(repo, crew=crew).crew_assisted_review()
    assert derde["skipped"] is True  # beide requirements nu al gereviewed


async def test_crew_review_respects_the_daily_cap():
    repo = FakeRepo()
    repo.t["buyer_requirements"].append(_tweede_req(repo))
    crew = _StubCrew(_ok_crew_info())
    d = disc(repo, crew=crew, max_crew_calls_per_day=1)
    eerste = await d.crew_assisted_review()
    tweede = await d.crew_assisted_review()
    assert eerste["created_review"] is True
    assert tweede["skipped"] is True and "budget" in tweede["reason"]
    assert len(crew.calls) == 1  # de tweede poging riep de crew niet eens aan


async def test_a_failed_or_unavailable_crew_run_creates_no_review_but_is_audited():
    repo = FakeRepo()
    crew = _StubCrew(CrewRunInfo(used=False, status="unavailable", reason="dedicated backend not configured and fallback denied"))
    uit = await disc(repo, crew=crew).crew_assisted_review()
    assert uit["created_review"] is False and uit["crew_status"] == "unavailable"
    assert not any(q["action_type"] == "crew_candidate_review" for q in repo.t["action_queue"])
    assert any(e["action"] == "crew_candidate_review_skipped" for e in repo.t["northsea_audit_events"])


async def test_crew_review_feeds_real_search_hits_into_the_crew_handoff():
    """Closes the EXA_API_KEY gap: the crew's own exa_search was never live-implemented, so
    net-new discovery must reuse the same Tavily/Zenserp/Perplexity chain find_suppliers/
    find_buyers already use, not a second, EXA-only search path."""
    repo = FakeRepo()
    crew = _StubCrew(_ok_crew_info())
    research = FakeResearch()  # returns real-shaped tavily hits, see fakes.py
    uit = await disc(repo, crew=crew, research=research).crew_assisted_review()
    assert uit["created_review"] is True and uit["search_status"] == "ok:tavily"
    assert research.searches  # de zoekketen werd echt aangeroepen
    handoff = crew.calls[0][1]
    assert handoff["payload"]["web_hits_provider"] == "tavily"
    assert len(handoff["payload"]["web_hits"]) > 0
    assert handoff["payload"]["web_hits"][0]["title"] == "Mopani Copper Mines"
    rij = next(q for q in repo.t["action_queue"] if q["action_type"] == "crew_candidate_review")
    assert rij["metadata"]["search_provider"] == "tavily" and rij["metadata"]["search_hits"] > 0


async def test_crew_review_reports_a_failed_search_chain_honestly():
    repo = FakeRepo()
    crew = _StubCrew(_ok_crew_info())
    research = FakeResearch(search_fail=ResearchError("not_configured", "no search provider configured"))
    uit = await disc(repo, crew=crew, research=research).crew_assisted_review()
    assert uit["search_status"] == "failed:not_configured"
    handoff = crew.calls[0][1]
    assert "web_hits" not in handoff["payload"]  # geen lege lijst doen alsof er gezocht is
    assert "Search chain exhausted" in handoff["payload"]["web_hits_warning"]


async def test_crew_review_still_works_without_a_research_gateway():
    repo = FakeRepo()
    crew = _StubCrew(_ok_crew_info())
    uit = await disc(repo, crew=crew).crew_assisted_review()  # research=None (default)
    assert uit["created_review"] is True and uit["search_status"] == "no_research_service"


async def test_crew_review_excludes_testcase_requirements():
    repo = FakeRepo()
    repo.t["buyer_requirements"] = [{**repo.t["buyer_requirements"][0], "id": "7c328c1a-fd41-4592-86bb-de954a384e2b",
                                    "evidence": "STRATO TEST CALL: synthetic Jasmine qualification test."}]
    crew = _StubCrew(_ok_crew_info())
    uit = await disc(repo, crew=crew).crew_assisted_review()
    assert uit["skipped"] is True and len(crew.calls) == 0


async def test_idempotent_rerun_creates_no_duplicates_even_after_a_rollback():
    """A candidate whose write failed and rolled back must be retryable on the NEXT run without
    becoming a duplicate once it succeeds."""
    repo = FakeRepo()
    repo.fail_insert_match_assessment = True
    voor = len(repo.t["opportunities"])
    eerste = await disc(repo).sweep()
    assert eerste["created"] == 0 and len(repo.t["opportunities"]) == voor
    repo.fail_insert_match_assessment = False
    tweede = await disc(repo).sweep()
    assert tweede["created"] == 1
    derde = await disc(repo).sweep()
    assert derde["created"] == 0  # nu bestaat de paring: geen tweede exemplaar
