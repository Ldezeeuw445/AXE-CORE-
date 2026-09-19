"""LOOP A/B discovery: deterministic cross-match, bounded, never duplicates, never invents a party."""
from __future__ import annotations

from datetime import datetime, timezone

from fakes import OFFER, OTHER_OFFER, OTHER_SELLER_CO, REQ, FakeRepo
from northsea_mcp.discovery import DiscoveryService

NU = datetime(2026, 9, 19, 18, 0, tzinfo=timezone.utc)


def disc(repo, **kw):
    return DiscoveryService(repo, now=lambda: NU, **kw)


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
    assert beoordeling["overall_score"] == nieuw["match_score"]
    event = next(e for e in repo.t["deal_events"] if e["event_type"] == "opportunity_discovered")
    assert event["opportunity_id"] == nieuw["id"] and event["actor"] == "northsea-discovery"


async def test_sweep_never_duplicates_an_existing_pairing():
    repo = FakeRepo()
    # REQ x OFFER already has an opportunity (the seed OPP); only REQ x OTHER_OFFER is genuinely new.
    await disc(repo).sweep()
    voor = len(repo.t["opportunities"])
    uit = await disc(repo).sweep()
    assert uit["created"] == 0  # de enige goede paring bestaat nu al
    assert len(repo.t["opportunities"]) == voor


async def test_sweep_never_pairs_a_party_with_itself():
    repo = FakeRepo()
    # Zet OTHER_OFFER op hetzelfde bedrijf als REQ's koper: mag nooit een tegenpartij van zichzelf worden.
    for o in repo.t["supplier_offers"]:
        if o["id"] == OTHER_OFFER:
            o["company_id"] = repo.t["buyer_requirements"][0]["company_id"]
    uit = await disc(repo).sweep()
    assert uit["created"] == 0


async def test_sweep_respects_the_per_run_cap():
    repo = FakeRepo()
    # Een tweede koper-vraag die ook tegen OTHER_OFFER zou scoren, plus de bestaande REQ: twee kandidaat-parings.
    tweede_req = {**repo.t["buyer_requirements"][0], "id": "77777777-7777-4777-8777-777777777777", "company_id": "88888888-8888-4888-8888-888888888888"}
    repo.t["buyer_requirements"].append(tweede_req)
    uit = await disc(repo, max_new_per_run=1).sweep()
    assert uit["created"] == 1  # er waren minstens twee kandidaten, maar de cap staat op 1


async def test_sweep_respects_the_per_day_cap_across_runs():
    repo = FakeRepo()
    tweede_req = {**repo.t["buyer_requirements"][0], "id": "77777777-7777-4777-8777-777777777777", "company_id": "88888888-8888-4888-8888-888888888888"}
    repo.t["buyer_requirements"].append(tweede_req)
    d = disc(repo, max_new_per_run=5, max_new_per_day=1)
    eerste = await d.sweep()
    tweede = await d.sweep()
    assert eerste["created"] == 1 and tweede["created"] == 0  # dagbudget al op na de eerste run
    assert tweede["created_today_total"] == 1


async def test_dry_run_creates_nothing():
    repo = FakeRepo()
    voor = len(repo.t["opportunities"])
    uit = await disc(repo).sweep(dry_run=True)
    assert uit["created"] == 1 and len(repo.t["opportunities"]) == voor  # gerapporteerd, niet geschreven


async def test_below_threshold_pairs_are_never_created():
    repo = FakeRepo()
    for o in repo.t["supplier_offers"]:
        if o["id"] == OTHER_OFFER:
            o["commodity"], o["product"] = "Zinc", "Zinc Ingot"
    uit = await disc(repo).sweep()
    assert uit["created"] == 0 and uit["considered_pairs"] >= 1
