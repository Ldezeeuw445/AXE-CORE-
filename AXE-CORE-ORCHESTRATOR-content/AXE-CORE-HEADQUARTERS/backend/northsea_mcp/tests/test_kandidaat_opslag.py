"""N4: elke kandidaat uit een crew-review krijgt een duurzame rij, nooit een feit."""
from __future__ import annotations

from datetime import datetime, timezone

from fakes import FakeRepo
from test_discovery import _ok_crew_info, _StubCrew, disc

from northsea_mcp import kandidaat_opslag as ko

NU = datetime(2026, 10, 17, 9, 0, tzinfo=timezone.utc)

TWEE = {"candidates": [
    {"name": "Mopani Copper Mines", "url": "https://www.mopani.com/en", "fit_score": 80, "role": "supplier",
     "facts": [{"field": "identity", "level": "VERIFIED", "value": "Mopani"},
               {"field": "lc_acceptance", "level": "UNKNOWN", "value": "UNKNOWN"}]},
    {"name": "Aurubis AG", "url": "aurubis.com", "fit_score": "71.6"},
], "rejected": [{"name": "Copper price today", "fit_score": 0}]}


def req(repo):
    return repo.t["buyer_requirements"][0]


async def test_review_legt_elke_kandidaat_vast_in_een_nieuwe_campagne():
    repo = FakeRepo()
    voor_bedrijven, voor_contacten = len(repo.t["companies"]), len(repo.t.get("contacts") or [])
    uit = await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review()
    assert uit["created_review"] is True
    assert uit["candidates_persisted"]["persisted"] == 2

    campagnes = repo.t["sourcing_campaigns"]
    assert len(campagnes) == 1
    c = campagnes[0]
    assert c["buyer_requirement_id"] == req(repo)["id"] and c["direction"] == "find_supplier"
    assert c["candidates_found"] == 2 and c["status"] == "active"

    rijen = {r["candidate_name"]: r for r in repo.t["sourcing_candidates"]}
    assert set(rijen) == {"Mopani Copper Mines", "Aurubis AG"}
    mopani = rijen["Mopani Copper Mines"]
    assert mopani["status"] == "found" and mopani["website"] == "https://mopani.com"
    assert mopani["source_url"] == "https://www.mopani.com/en" and mopani["fit_score"] == 80
    assert mopani["gaps"] == ["lc_acceptance"] and mopani["fit_reasons"][0]["field"] == "identity"
    review = next(q for q in repo.t["action_queue"] if q["action_type"] == "crew_candidate_review")
    assert mopani["evidence"]["action_queue_id"] == review["id"]
    assert mopani["evidence"]["crew_route"] == "discovery_run" and mopani["evidence"]["origin"] == "northsea-discovery"
    assert rijen["Aurubis AG"]["fit_score"] == 72 and rijen["Aurubis AG"]["website"] == "https://aurubis.com"

    # Afgewezen hits worden geen kandidaat, en er ontstaat geen enkel feit.
    assert "Copper price today" not in rijen
    assert len(repo.t["companies"]) == voor_bedrijven and len(repo.t.get("contacts") or []) == voor_contacten
    assert any(a["action"] == "sourcing_candidates_persisted" for a in repo.t["northsea_audit_events"])


async def test_dezelfde_leverancier_twee_keer_gevonden_is_een_rij():
    repo = FakeRepo()
    eerste = await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review()
    tweede = await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review(
        buyer_requirement_id=req(repo)["id"], replace_existing=True, ignore_daily_cap=True, search_only=True)
    assert eerste["candidates_persisted"]["persisted"] == 2
    assert tweede["candidates_persisted"] == {**tweede["candidates_persisted"], "persisted": 0, "duplicates": 2}
    assert len(repo.t["sourcing_candidates"]) == 2
    assert repo.t["sourcing_campaigns"][0]["candidates_found"] == 2


async def test_een_bestaande_actieve_campagne_wordt_gebruikt():
    repo = FakeRepo()
    repo.t["sourcing_campaigns"] = [{"id": "c0000000-0000-4000-8000-000000000001", "buyer_requirement_id": req(repo)["id"],
                                     "direction": "find_supplier", "status": "active", "candidates_found": 0,
                                     "created_at": "2026-10-01"}]
    await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review()
    assert len(repo.t["sourcing_campaigns"]) == 1
    assert {r["campaign_id"] for r in repo.t["sourcing_candidates"]} == {"c0000000-0000-4000-8000-000000000001"}


async def test_een_geannuleerde_campagne_wordt_gerespecteerd():
    repo = FakeRepo()
    repo.t["sourcing_campaigns"] = [{"id": "c0000000-0000-4000-8000-000000000002", "buyer_requirement_id": req(repo)["id"],
                                     "direction": "find_supplier", "status": "cancelled", "candidates_found": 0,
                                     "created_at": "2026-10-01"}]
    uit = await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review()
    assert uit["created_review"] is True
    assert uit["candidates_persisted"]["persisted"] == 0 and "cancelled" in uit["candidates_persisted"]["reason"]
    assert not repo.t.get("sourcing_candidates")


async def test_een_mislukte_opslag_laat_de_review_staan_en_wordt_geaudit():
    repo = FakeRepo()
    repo.fail_discovery_insert = True
    uit = await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review()
    assert uit["created_review"] is True
    assert "simulated" in uit["candidates_persisted"]["error"]
    review = next(q for q in repo.t["action_queue"] if q["action_type"] == "crew_candidate_review")
    assert review["status"] == "open" and len(review["metadata"]["candidates"]) == 2
    assert any(a["action"] == "sourcing_candidates_persist_failed" for a in repo.t["northsea_audit_events"])


async def test_dry_run_schrijft_niets():
    repo = FakeRepo()
    await disc(repo, crew=_StubCrew(_ok_crew_info(structured_output=TWEE))).crew_assisted_review(
        buyer_requirement_id=req(repo)["id"], dry_run=True, search_only=True)
    assert not repo.t.get("sourcing_candidates") and not repo.t.get("sourcing_campaigns")


def test_sleutel_en_score():
    assert ko.sleutel({"url": "https://WWW.Mopani.com/x"}) == ko.sleutel({"url": "mopani.com"}) == "d:mopani.com"
    assert ko.sleutel({"name": "  Aurubis   AG "}) == "n:aurubis ag"
    assert ko.sleutel({"name": "UNKNOWN"}) is None
    assert ko.score("101") == 100 and ko.score(-3) == 0 and ko.score(None) is None and ko.score("x") is None
