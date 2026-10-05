"""Desk-run selectie: geparkeerde en stale marketplace-papier blijven liggen."""
from __future__ import annotations

from datetime import datetime, timezone

from fakes import OPP, FakeRepo, ts
from northsea_mcp.crew_loop import finish_after_event, finish_engine_tick
from northsea_mcp.desk_select import (
    desk_run_dedupe_key,
    is_marketplace_sourced,
    is_parked,
    is_stale_marketplace_paper,
    park_reason,
    parked_opportunity_ids,
    select_operations_deals,
    skip_desk_run,
)
from northsea_mcp.orchestration import OrchestrationResult, ValidationResult
from northsea_mcp.service import NorthSeaService

NU = datetime(2026, 10, 5, 15, 7, tzinfo=timezone.utc)

MARKET_BUYER = "b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1"
MARKET_SELLER = "c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1"
MARKET_REQ = "d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1"
MARKET_OFFER = "e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1"
MARKET_OPP = "f1f1f1f1-f1f1-41f1-81f1-f1f1f1f1f1f1"
PARK_AQ = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1"


def _ok():
    return OrchestrationResult(
        status="ok", event_id="e1", run_id="r1", route="deal_run", crew_family="deal",
        validation=ValidationResult(valid=True, event_type="opportunity_qualification"),
    )


def _event(opp_id=OPP, **over):
    ev = {
        "event_id": "auto-qualify-1", "run_id": "run-1",
        "event_type": "opportunity_qualification",
        "source": "northsea_operations_loop",
        "payload": {"opportunity_id": opp_id, "automated_sweep": True},
    }
    ev.update(over)
    return ev


def voeg_marktplaats_papier(repo: FakeRepo, *, parked: bool = False, with_comms: bool = False) -> str:
    """September-papier zoals de Freshdi/KGHM-matches: identified, marktplaats, geen mail."""
    repo.t["companies"].append({
        "id": MARKET_BUYER, "company_name": "Ralf Hastenpflug - marketplace buyer",
        "country": "Germany", "company_type": "buyer",
        "source_url": "https://www.go4worldbusiness.com/buyleads/germany/copper-cathode.html",
        "verification_status": "unverified",
    })
    repo.t["companies"].append({
        "id": MARKET_SELLER, "company_name": "KGHM Polska Miedz S.A.",
        "country": "Poland", "company_type": "supplier",
        "source_url": "https://kghm.com/en/our-business/products/copper",
        "verification_status": "unverified",
    })
    repo.t["buyer_requirements"].append({
        "id": MARKET_REQ, "company_id": MARKET_BUYER, "commodity": "Copper",
        "product": "Copper Cathode", "status": "active",
    })
    repo.t["supplier_offers"].append({
        "id": MARKET_OFFER, "company_id": MARKET_SELLER, "commodity": "Copper",
        "product": "Copper Cathode", "status": "active",
    })
    repo.t["opportunities"].append({
        "id": MARKET_OPP, "buyer_requirement_id": MARKET_REQ, "supplier_offer_id": MARKET_OFFER,
        "match_score": 80, "stage": "identified", "execution_state": "qualifying",
        "deal_priority": "medium", "readiness_score": 31, "is_synthetic": False,
        "notes": "European direct-producer paper match. Execution terms remain unverified.",
        "created_at": ts(-24 * 21), "updated_at": ts(-24 * 19),
        **{f"{g}_gate_passed": False for g in ("buyer", "seller", "commercial", "evidence", "protection",
                                               "introduction", "transaction", "fulfilment", "settlement")},
    })
    if parked:
        repo.t["action_queue"].append({
            "id": PARK_AQ, "opportunity_id": MARKET_OPP, "action_type": "qualify_match",
            "title": "Qualify Ralf Hastenpflug - marketplace buyer ↔ KGHM",
            "status": "waiting", "dedupe_key": None,
            "metadata": {"parked_reason": "backlog_park_marketplace_qualify"},
            "created_at": ts(-24 * 6),
        })
        repo.t["deal_tasks"].append({
            "id": "12121212-1212-4121-8121-121212121212", "opportunity_id": MARKET_OPP,
            "task_type": "resolve_blocker", "title": "Resolve current primary blocker",
            "status": "waiting", "result": {"parked_reason": "backlog_park_marketplace_qualify"},
            "created_at": ts(-24 * 22),
        })
    if with_comms:
        repo.t["communications"].append({
            "id": "13131313-1313-4131-8131-131313131313", "opportunity_id": MARKET_OPP,
            "company_id": MARKET_SELLER, "direction": "inbound", "channel": "email",
            "subject": "Re: allocation", "body": "We can talk.", "occurred_at": ts(-2),
        })
    return MARKET_OPP


def _select(repo: FakeRepo, now=NU):
    return select_operations_deals(
        repo.t["opportunities"],
        audits=repo.t["northsea_audit_events"],
        tasks=repo.t["deal_tasks"],
        queue=repo.t["action_queue"],
        communications=repo.t["communications"],
        companies=repo.t["companies"],
        requirements=repo.t["buyer_requirements"],
        offers=repo.t["supplier_offers"],
        now=now,
    )


def test_park_reason_leest_result_en_metadata():
    taak = {"status": "waiting", "result": {"parked_reason": "backlog_park_marketplace_qualify"}}
    chase = {"status": "waiting", "metadata": {"parked_reason": "backlog_park_marketplace_qualify"}}
    assert park_reason(taak) == "backlog_park_marketplace_qualify"
    assert is_parked(taak) and is_parked(chase)
    assert not is_parked({"status": "waiting", "result": {}})
    assert not is_parked({"status": "cancelled", "result": {"parked_reason": "backlog_park_marketplace_qualify"}})


def test_marketplace_bron_herkent_go4wb_en_paper_match():
    opp = {"notes": "Paper match only.", "execution_metadata": {}, "stage": "identified"}
    koper = {"company_name": "Ralf Hastenpflug - marketplace buyer",
             "source_url": "https://www.go4worldbusiness.com/buyleads/germany/copper-cathode.html"}
    assert is_marketplace_sourced(opp, [koper])
    assert is_stale_marketplace_paper(opp, companies=[koper], has_comms=False)
    assert not is_stale_marketplace_paper(opp, companies=[koper], has_comms=True)
    levend = {"notes": None, "execution_metadata": {}, "stage": "identified"}
    echte = {"company_name": "Mopani Copper Mines PLC", "source_url": "https://mopani.com"}
    assert not is_marketplace_sourced(levend, [echte])


def test_selectie_slaat_geparkeerd_en_stale_papier_over_houdt_levende_deal():
    repo = FakeRepo()
    voeg_marktplaats_papier(repo, parked=True)
    uit = _select(repo)
    ids = [o["id"] for o in uit["chosen"]]
    assert OPP in ids
    assert MARKET_OPP not in ids
    assert uit["skipped"]["parked"] >= 1
    assert MARKET_OPP in uit["parked_ids"]


def test_selectie_slaat_ongeparkeerd_stale_marktplaats_papier_ook_over():
    repo = FakeRepo()
    voeg_marktplaats_papier(repo, parked=False)
    uit = _select(repo)
    ids = [o["id"] for o in uit["chosen"]]
    assert OPP in ids
    assert MARKET_OPP not in ids
    assert uit["skipped"]["stale_marketplace_paper"] >= 1
    assert skip_desk_run(
        next(o for o in repo.t["opportunities"] if o["id"] == MARKET_OPP),
        parked_ids=set(),
        companies=[c for c in repo.t["companies"] if c["id"] in (MARKET_BUYER, MARKET_SELLER)],
        engaged_ids=set(),
    ) == "stale_marketplace_paper"


def test_marktplaats_met_echte_mail_blijft_in_de_selectie():
    repo = FakeRepo()
    voeg_marktplaats_papier(repo, parked=False, with_comms=True)
    uit = _select(repo)
    ids = [o["id"] for o in uit["chosen"]]
    assert MARKET_OPP in ids
    assert OPP in ids


def test_parked_ids_vindt_deal_id_in_metadata_als_opportunity_id_leeg_is():
    queue = [{
        "opportunity_id": None, "status": "waiting",
        "metadata": {"parked_reason": "backlog_park_marketplace_qualify", "deal_id": MARKET_OPP},
    }]
    assert parked_opportunity_ids([], queue) == {MARKET_OPP}


def test_desk_run_dedupe_key_is_stabiel_per_deal_en_dagelijks_voor_heartbeat():
    assert desk_run_dedupe_key(f"missing:{MARKET_OPP}", "2026-10-05") == f"desk-run:missing:{MARKET_OPP}"
    assert desk_run_dedupe_key("engine", "2026-10-05") == "desk-run:engine:2026-10-05"
    assert desk_run_dedupe_key("ops-idle", "2026-10-06") != desk_run_dedupe_key("ops-idle", "2026-10-05")


async def test_finish_after_event_schrijft_niets_voor_geparkeerde_deal(research, crew):
    repo = FakeRepo()
    voeg_marktplaats_papier(repo, parked=True)
    taken_voor = list(repo.t["deal_tasks"])
    chase_voor = list(repo.t["action_queue"])
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(service, _event(MARKET_OPP), _ok())
    assert uit["skipped"] is True and uit["reason"] == "parked"
    assert uit["sent"] == 0
    assert repo.t["deal_tasks"] == taken_voor
    assert repo.t["action_queue"] == chase_voor


async def test_finish_after_event_schrijft_niets_voor_stale_marktplaats_papier(research, crew):
    repo = FakeRepo()
    voeg_marktplaats_papier(repo, parked=False)
    taken_voor = [t["id"] for t in repo.t["deal_tasks"]]
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(service, _event(MARKET_OPP), _ok())
    assert uit["skipped"] is True and uit["reason"] == "stale_marketplace_paper"
    assert [t["id"] for t in repo.t["deal_tasks"]] == taken_voor
    assert not any(
        q.get("action_type") == "desk_run_note" and "missing input" in (q.get("title") or "")
        for q in repo.t["action_queue"]
    )


async def test_finish_after_event_maakt_nog_steeds_werk_voor_levende_deal(research, crew):
    repo = FakeRepo()
    # Geparkeerd papier ernaast mag de levende copper-deal niet tegenhouden.
    voeg_marktplaats_papier(repo, parked=True)
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(service, _event(OPP), _ok())
    assert uit.get("skipped") is not True
    assert uit["sent"] == 0 and uit["approved"] == 0
    assert uit["notice"]["akkoord_nodig"] is True


async def test_engine_note_wordt_niet_gedupliceerd_na_cancel(research, crew):
    repo = FakeRepo()
    service = NorthSeaService(repo, research, crew)
    eerste = await finish_engine_tick(service, {"plan": {"followups": []}})
    assert eerste["sent"] == 0
    notes = [q for q in repo.t["action_queue"] if q.get("action_type") == "desk_run_note"]
    assert len(notes) == 1
    notes[0]["status"] = "cancelled"
    tweede = await finish_engine_tick(service, {"plan": {"followups": []}})
    assert tweede["sent"] == 0
    notes_na = [q for q in repo.t["action_queue"] if q.get("action_type") == "desk_run_note"]
    assert len(notes_na) == 1
    assert notes_na[0]["dedupe_key"] == f"desk-run:engine:{datetime.now(timezone.utc).date().isoformat()}"


async def test_operations_dry_run_selecteert_geen_geparkeerd_papier(app, store, repo):
    import httpx
    voeg_marktplaats_papier(repo, parked=True)
    token = store.issue(
        kind="service", client_id="service:engine", subject="service:engine",
        scopes=["northsea.engine"], resource="https://mcp.northsea.test/mcp", ttl_s=600, label="engine",
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://mcp.northsea.test") as client:
        r = await client.post("/internal/operations/sweep?dry_run=1",
                              headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "dry_run"
    ids = [s["opportunity_id"] for s in body["selected"]]
    assert OPP in ids
    assert MARKET_OPP not in ids
    assert body["skipped"]["parked"] >= 1
    assert repo.engine_writes == []
