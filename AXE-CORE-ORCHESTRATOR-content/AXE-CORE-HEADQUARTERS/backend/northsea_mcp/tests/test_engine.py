"""P1 Communication Engine: de tick tegen de nep-database. Idempotentie, stormrem, P0-grenzen, geen verzending."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from fakes import COMM, CONTACT_S, OFFER, OPP, SELLER_CO, FakeRepo
from northsea_mcp import engine_rules as rules
from northsea_mcp.engine import EngineService

NU = datetime.now(timezone.utc)


def iso(h):
    return (NU + timedelta(hours=h)).isoformat()


def eng(repo, **kw):
    return EngineService(repo, now=lambda: NU, **kw)


def oude_inbound(repo):
    """De seed-inbound (-4u) telt als antwoord op elk ouder uitgaand bericht; zet hem ver terug."""
    next(c for c in repo.t["communications"] if c["id"] == COMM)["occurred_at"] = iso(-200)


def outbound(repo, h=-60, company=SELLER_CO, contact=CONTACT_S, opp=OPP, **kw):
    cid = str(uuid.uuid4())
    repo.t["communications"].append({"id": cid, "company_id": company, "contact_id": contact, "opportunity_id": opp, "direction": "outbound",
                                     "channel": "email", "subject": "Copper Cathode — supply qualification", "body": "Please confirm allocation.",
                                     "occurred_at": iso(h), "delivery_status": "delivered",
                                     "from_address": "NorthSea Commodity Partners <trade@northseacommodity.com>", **kw})
    return cid


async def test_inbound_is_classified_with_explicit_terms_and_evidence_once():
    repo = FakeRepo()
    next(c for c in repo.t["communications"] if c["id"] == COMM).update(mapping_status="mapped", mapping_basis="thread")
    uit = await eng(repo).tick()
    intel = next(i for i in repo.t["email_intelligence"] if i["communication_id"] == COMM)
    assert intel["engine_primary"] == "supplier" and intel["engine_version"] == rules.ENGINE_VERSION
    assert intel["engine_terms"]["quantity_mt"] == 800 and intel["engine_terms"]["incoterms"] == ["FOB"]
    ev = [e for e in repo.t["deal_evidence"] if e.get("evidence_type") == "stated_terms"]
    assert len(ev) == 1 and ev[0]["verification_status"] == "counterparty_stated" and ev[0]["source_reference"] == COMM
    assert uit["sent"] == 0 and repo.sends == []
    voor = len(repo.engine_writes)
    tweede = await eng(repo).tick()
    assert tweede["summary"]["intelligence"] == 0 and tweede["summary"]["evaluations"] == 0
    assert len([e for e in repo.t["deal_evidence"] if e.get("evidence_type") == "stated_terms"]) == 1
    assert [w for w in repo.engine_writes[voor:] if w[0] != "northsea_audit_events"] == []


async def test_ambiguous_mapping_creates_one_chase_item_and_no_deal_change():
    repo = FakeRepo()
    cid = str(uuid.uuid4())
    repo.t["communications"].append({"id": cid, "company_id": SELLER_CO, "direction": "inbound", "channel": "email", "subject": "Re: offer",
                                     "body": "We can supply 500 MT", "occurred_at": iso(-1), "mapping_status": "ambiguous",
                                     "mapping_candidates": [OPP, str(uuid.uuid4())], "opportunity_id": None})
    await eng(repo).tick()
    await eng(repo).tick()
    items = [q for q in repo.t["action_queue"] if q.get("dedupe_key") == f"review_mapping:{cid}"]
    assert len(items) == 1 and items[0]["opportunity_id"] is None
    assert not [e for e in repo.t["deal_evidence"] if e.get("source_reference") == cid]


async def test_bounce_marks_channel_and_blocks_retry_path():
    repo = FakeRepo()
    outbound(repo, h=-5, delivery_status="bounced")
    await eng(repo).tick()
    contact = next(c for c in repo.t["contacts"] if c["id"] == CONTACT_S)
    assert contact["email_status"] == "bounced" and "delivery_status=bounced" in contact["email_status_reason"]
    assert any(q.get("dedupe_key") == f"repair_channel:{CONTACT_S}" for q in repo.t["action_queue"])
    opp = next(o for o in repo.t["opportunities"] if o["id"] == OPP)
    # Mopani heeft één contact met e-mail, en dat adres bounced: deal staat op 'kanaal herstellen'.
    assert opp["engine_blocker_code"] == "channel_bounced"


async def test_followup_is_planned_once_as_pending_draft_and_never_sent():
    repo = FakeRepo()
    oude_inbound(repo)
    repo.t["reply_drafts"] = [d for d in repo.t["reply_drafts"] if d["approval_status"] != "pending"]
    anker = outbound(repo, h=-60)
    uit = await eng(repo).tick()
    fu = repo.t["northsea_followups"]
    assert len(fu) == 1 and fu[0]["status"] == "draft_created" and fu[0]["attempt"] == 1
    d = next(x for x in repo.t["reply_drafts"] if x["id"] == fu[0]["draft_id"])
    assert (d["approval_status"], d["generated_by"], d["communication_id"]) == ("pending", "northsea-engine", anker)
    assert d["policy_decision"]["allowed"] is False and repo.sends == [] and uit["sent"] == 0
    assert "No counterparty introduction or binding commercial commitment" in d["body"]
    await eng(repo).tick()
    assert len(repo.t["northsea_followups"]) == 1


async def test_reply_closes_followup_plan():
    repo = FakeRepo()
    oude_inbound(repo)
    anker = outbound(repo, h=-60)
    await eng(repo).tick()
    repo.t["communications"].append({"id": str(uuid.uuid4()), "company_id": SELLER_CO, "direction": "inbound", "channel": "email",
                                     "subject": "Re: allocation", "body": "Allocation confirmed next week", "occurred_at": iso(-1)})
    await eng(repo).tick()
    assert repo.t["northsea_followups"][0]["status"] == "replied"
    assert repo.t["northsea_followups"][0]["anchor_communication_id"] == anker


async def test_guard_refusal_blocks_plan_without_draft():
    repo = FakeRepo()
    oude_inbound(repo)
    repo.guard_block = True
    outbound(repo, h=-60)
    uit = await eng(repo).tick()
    assert repo.t["northsea_followups"][0]["status"] == "blocked" and "bounced_channel" in repo.t["northsea_followups"][0]["reason"]
    assert uit["plan"]["followups"][0]["result"] == "blocked_by_guard"


async def test_storm_cap_and_invalid_policy_fail_closed():
    repo = FakeRepo()
    for i in range(15):
        co = str(uuid.uuid4())
        repo.t["companies"].append({"id": co, "company_name": f"C{i}", "company_type": "supplier", "contact_policy": "allowed"})
        outbound(repo, h=-60, company=co, contact=None, opp=None, provider_metadata={"to": [f"desk{i}@example-{i}.com"]})
    uit = await eng(repo, max_followups_per_run=5).tick()
    assert uit["summary"]["followups"] == 5
    repo2 = FakeRepo()
    oude_inbound(repo2)
    repo2.t["deal_automation_policy"][0]["followup_interval_hours"] = None
    outbound(repo2, h=-60)
    uit2 = await eng(repo2).tick()
    assert uit2["summary"]["followups"] == 0 and any("fail closed" in f for f in uit2["errors"])


async def test_synthetic_messages_are_ignored():
    repo = FakeRepo()
    outbound(repo, h=-60, is_synthetic=True)
    for c in repo.t["communications"]:
        c["is_synthetic"] = True
    uit = await eng(repo).tick()
    assert uit["summary"]["intelligence"] == 0 and uit["summary"]["followups"] == 0


async def test_dry_run_writes_nothing():
    repo = FakeRepo()
    oude_inbound(repo)
    outbound(repo, h=-60)
    uit = await eng(repo).tick(dry_run=True)
    assert repo.engine_writes == [] and uit["summary"]["followups"] == 1 and uit["summary"]["intelligence"] == 1


async def test_evaluation_respects_contact_policy():
    repo = FakeRepo()
    next(c for c in repo.t["companies"] if c["id"] == SELLER_CO)["contact_policy"] = "review_required"
    await eng(repo).tick()
    opp = next(o for o in repo.t["opportunities"] if o["id"] == OPP)
    assert opp["engine_blocker_code"] == "contact_policy_review" and opp["engine_owner"] == "luka"
    assert any(e["event_type"] == "engine_evaluation_changed" for e in repo.t["deal_events"])


# ── Interne endpoint ─────────────────────────────────────────────────────────

@pytest.fixture
def client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://mcp.northsea.test")


async def test_engine_endpoint_requires_engine_service_token(client, store, repo):
    r = await client.post("/internal/engine/tick")
    assert r.status_code == 401
    read = store.issue(kind="service", client_id="service:x", subject="service:x", scopes=["northsea.read", "northsea.admin"],
                       resource="https://mcp.northsea.test/mcp", ttl_s=600, label="x")
    r = await client.post("/internal/engine/tick", headers={"Authorization": f"Bearer {read}"})
    assert r.status_code == 403
    ok = store.issue(kind="service", client_id="service:engine", subject="service:engine", scopes=["northsea.engine"],
                     resource="https://mcp.northsea.test/mcp", ttl_s=600, label="engine")
    r = await client.post("/internal/engine/tick?dry_run=1", headers={"Authorization": f"Bearer {ok}"})
    assert r.status_code == 200 and r.json()["dry_run"] is True and r.json()["sent"] == 0
    assert repo.engine_writes == []


def test_engine_scope_is_not_offered_to_oauth_clients():
    from northsea_mcp.policy import INTERNAL_SCOPES, SCOPES
    assert "northsea.engine" in INTERNAL_SCOPES and "northsea.engine" not in SCOPES


# ── Productie-bevindingen (dry run 16 sep): herkomst, beleid en bounce zonder contactrecord ──

async def test_no_followup_on_outbound_without_canonical_provenance():
    repo = FakeRepo()
    oude_inbound(repo)
    outbound(repo, h=-60, from_address=None)
    uit = await eng(repo).tick(dry_run=True)
    assert uit["summary"]["followups"] == 0
    assert [x["reason"] for x in uit["plan"]["followups_skipped"]] == ["provenance_unknown"]


async def test_no_followup_for_review_required_party():
    repo = FakeRepo()
    oude_inbound(repo)
    next(c for c in repo.t["companies"] if c["id"] == SELLER_CO)["contact_policy"] = "review_required"
    outbound(repo, h=-60)
    uit = await eng(repo).tick()
    assert uit["summary"]["followups"] == 0 and repo.t["northsea_followups"] == []
    assert uit["plan"]["followups_skipped"][0]["reason"] == "contact_policy:review_required"


async def test_bounce_recorded_only_in_provider_metadata_blocks_that_address():
    repo = FakeRepo()
    oude_inbound(repo)
    co = str(uuid.uuid4())
    repo.t["companies"].append({"id": co, "company_name": "Rice Co", "company_type": "supplier", "contact_policy": "allowed"})
    outbound(repo, h=-200, company=co, contact=None, opp=None, delivery_status="bounced",
             provider_metadata={"to": ["info@rice.example"], "from": "NorthSea Commodity Partners <trade@northseacommodity.com>"})
    outbound(repo, h=-60, company=co, contact=None, opp=None, provider_metadata={"last_event": {"to": ["Info <INFO@rice.example>"]}})
    uit = await eng(repo).tick()
    assert uit["summary"]["followups"] == 0 and uit["plan"]["followups_skipped"][0]["reason"] == "bounced_channel"
    chase = [q for q in repo.t["action_queue"] if str(q.get("dedupe_key", "")).startswith("repair_channel_address:")]
    assert len(chase) == 1
    await eng(repo).tick()
    assert len([q for q in repo.t["action_queue"] if str(q.get("dedupe_key", "")).startswith("repair_channel_address:")]) == 1


async def test_human_reverified_contact_is_not_overwritten_by_old_bounce():
    repo = FakeRepo()
    outbound(repo, h=-50, delivery_status="bounced")
    k = next(c for c in repo.t["contacts"] if c["id"] == CONTACT_S)
    k["email_status"], k["email_status_at"] = "valid", iso(-1)
    uit = await eng(repo).tick(dry_run=True)
    assert uit["plan"]["contacts_bounced"] == []


async def test_legacy_or_non_party_link_is_not_deal_evidence():
    repo = FakeRepo()
    # Seed-inbound: wel aan de deal gelinkt, maar zonder deterministische koppeling -> classificatie ja, bewijs nee.
    await eng(repo).tick()
    assert [e for e in repo.t["deal_evidence"] if e.get("evidence_type") == "stated_terms"] == []
    # Kandidaat-leverancier die geen partij van de deal is, zelfs 'mapped': telt niet voor die deal.
    repo2 = FakeRepo()
    ander = str(uuid.uuid4())
    repo2.t["companies"].append({"id": ander, "company_name": "Candidate Mill", "company_type": "supplier", "contact_policy": "allowed"})
    cid = str(uuid.uuid4())
    repo2.t["communications"].append({"id": cid, "company_id": ander, "opportunity_id": OPP, "direction": "inbound", "channel": "email",
                                      "subject": "Re: offer", "body": "We can supply 500 MT FOB Bangkok, LC at sight", "occurred_at": iso(-1),
                                      "mapping_status": "mapped", "mapping_basis": "thread"})
    uit = await eng(repo2).tick(dry_run=True)
    assert not [e for e in uit["plan"]["evidence"] if e["source_reference"] == cid]
    assert not [x for x in uit["plan"]["evaluations"] if x["opportunity_id"] == OPP and x["to"] == "reply_needed"]


async def test_reclassification_cancels_stale_engine_chase_item_but_not_human_items():
    repo = FakeRepo()
    cid = str(uuid.uuid4())
    repo.t["communications"].append({"id": cid, "company_id": SELLER_CO, "direction": "inbound", "channel": "email",
                                     "subject": "Welcome to TradeWheel", "body": "Thanks for joining. Unsubscribe here.", "occurred_at": iso(-3)})
    repo.t["email_intelligence"].append({"communication_id": cid, "engine_version": "ns-engine-1", "engine_primary": "rejection"})
    repo.t["action_queue"] += [
        {"id": str(uuid.uuid4()), "dedupe_key": f"review_rejection:{cid}", "status": "open", "metadata": {"source": "northsea-engine"}},
        {"id": str(uuid.uuid4()), "dedupe_key": f"review_rejection:{cid}-human", "status": "open", "metadata": {"source": "luka"}},
    ]
    uit = await eng(repo).tick()
    # Op dedupe_key zoeken, niet op positie: de seed heeft een verlopen deal_task
    # (due_at in het verleden), dus deze tick voegt er ook een deadline-Chase-item
    # aan action_queue toe -- de laatste twee rijen zijn dan niet meer per se deze twee.
    by_key = {r["dedupe_key"]: r for r in repo.t["action_queue"] if r.get("dedupe_key", "").startswith("review_rejection:")}
    engine_item, mens = by_key[f"review_rejection:{cid}"], by_key[f"review_rejection:{cid}-human"]
    assert engine_item["status"] == "cancelled" and "spam_noise" in engine_item["metadata"]["cancelled_reason"]
    assert mens["status"] == "open"
    assert uit["summary"]["chase_cancelled"] == 1
    assert (await eng(repo).tick())["summary"]["chase_cancelled"] == 0


# ── Closed-loop: stop-reden zichtbaar, geen dubbele acties op een herhaalde tick ─

async def test_evaluation_event_carries_loop_stop_category():
    repo = FakeRepo()
    next(c for c in repo.t["companies"] if c["id"] == SELLER_CO)["contact_policy"] = "review_required"
    await eng(repo).tick()
    ev = next(e for e in repo.t["deal_events"] if e["event_type"] == "engine_evaluation_changed")
    assert ev["metadata"]["loop_stop_category"] == "approval_required"


async def test_approval_resolution_becomes_its_own_event_once():
    repo = FakeRepo()
    draft_id = str(uuid.uuid4())
    repo.t["reply_drafts"] = [{"id": draft_id, "communication_id": COMM, "company_id": SELLER_CO, "contact_id": CONTACT_S,
                              "opportunity_id": OPP, "to_email": "chanda@mopani.com", "subject": "Re: allocation",
                              "body": "Please confirm the loading point.", "approval_status": "pending", "sensitive_action": False,
                              "sent_at": None, "resend_email_id": None, "updated_at": iso(-1), "created_at": iso(-1)}]
    await eng(repo).tick()
    opp = next(o for o in repo.t["opportunities"] if o["id"] == OPP)
    assert opp["engine_blocker_code"] == "approval_pending"
    assert not any(e["event_type"] in ("approval_granted", "approval_rejected") for e in repo.t["deal_events"])

    repo.t["reply_drafts"][0]["approval_status"] = "approved"
    repo.t["reply_drafts"][0]["approved_by"] = "luka"
    await eng(repo).tick()
    goedgekeurd = [e for e in repo.t["deal_events"] if e["event_type"] == "approval_granted"]
    assert len(goedgekeurd) == 1 and goedgekeurd[0]["metadata"]["draft_id"] == draft_id and goedgekeurd[0]["metadata"]["approved_by"] == "luka"

    await eng(repo).tick()  # herhaling: geen tweede approval_granted voor hetzelfde besluit
    assert len([e for e in repo.t["deal_events"] if e["event_type"] == "approval_granted"]) == 1


async def test_transient_write_failure_is_retried_and_succeeds():
    repo = FakeRepo()
    origineel = repo.engine_patch
    pogingen = {"n": 0}

    async def flaky(table, filters, body):
        if table == "opportunities" and pogingen["n"] == 0:
            pogingen["n"] += 1
            from northsea_mcp.repository import RepositoryError
            raise RepositoryError("database unreachable (ConnectError)")
        return await origineel(table, filters, body)

    repo.engine_patch = flaky
    uit = await eng(repo, sleep=lambda s: _no_sleep()).tick()
    opp = next(o for o in repo.t["opportunities"] if o["id"] == OPP)
    assert pogingen["n"] == 1 and opp["engine_blocker_code"]  # tweede poging is doorgegaan
    assert not uit["errors"]  # geen fout gerapporteerd: de retry loste het zelf op


async def test_guard_rejection_is_never_retried_and_surfaces_immediately():
    repo = FakeRepo()
    origineel = repo.engine_patch
    pogingen = {"n": 0}

    async def altijd_guard(table, filters, body):
        if table != "opportunities":
            return await origineel(table, filters, body)
        pogingen["n"] += 1
        from northsea_mcp.repository import RepositoryError
        raise RepositoryError("database write failed for opportunities (400): NS_CONTACT_POLICY: blocked")

    repo.engine_patch = altijd_guard
    uit = await eng(repo, sleep=lambda s: _no_sleep()).tick()
    assert pogingen["n"] == 1  # geen enkele retry op een guard-weigering
    assert any("evaluation" in f for f in uit["errors"])


async def _no_sleep():
    return None


def _kaal_voor_onderzoekbare_blokkade(repo):
    """Zet de seed-deal zo dat evaluate_deal() 'seller_unqualified' teruggeeft: geen
    pending drafts, geen e-mailgeschiedenis, geen contactbeleid-blokkade, geen bounce."""
    repo.t["reply_drafts"] = []
    repo.t["communications"] = []
    repo.t["email_intelligence"] = []


async def test_research_gate_raises_one_chase_item_and_never_duplicates_it():
    repo = FakeRepo()
    _kaal_voor_onderzoekbare_blokkade(repo)
    await eng(repo).tick()
    verzoeken = [q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval"]
    assert len(verzoeken) == 1 and verzoeken[0]["status"] == "open" and verzoeken[0]["requires_approval"] is True
    assert any(e["event_type"] == "research_approval_requested" for e in repo.t["deal_events"])

    await eng(repo).tick()  # nog steeds open: geen tweede verzoek
    assert len([q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval"]) == 1
    assert len([e for e in repo.t["deal_events"] if e["event_type"] == "research_approval_requested"]) == 1


async def test_research_gate_executes_once_after_human_approves_and_never_again():
    repo = FakeRepo()
    _kaal_voor_onderzoekbare_blokkade(repo)
    await eng(repo).tick()
    verzoek = next(q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval")
    verzoek["status"] = "completed"  # het besluit van een mens, zoals northsea_update_task dat zou zetten

    await eng(repo).tick()
    verzoek = next(q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval")
    assert verzoek["metadata"]["executed_at"] and verzoek["metadata"]["execution_result"] == "not_wired"
    assert verzoek["metadata"]["approved_via"] == "chase_item"
    uitgevoerd = [e for e in repo.t["deal_events"] if e["event_type"] == "research_approved_execution_not_wired"]
    assert len(uitgevoerd) == 1

    await eng(repo).tick()  # al uitgevoerd: geen tweede keer, geen nieuw event
    assert len([e for e in repo.t["deal_events"] if e["event_type"] == "research_approved_execution_not_wired"]) == 1
    assert len([q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval"]) == 1


async def test_research_gate_standing_policy_never_shows_an_open_chase_item():
    repo = FakeRepo()
    _kaal_voor_onderzoekbare_blokkade(repo)
    repo.t["deal_automation_policy"][0]["auto_investigate_blockers"] = True
    await eng(repo).tick()
    verzoek = next(q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval")
    assert verzoek["status"] == "completed" and verzoek["requires_approval"] is False  # nooit als open Chase-item getoond
    assert verzoek["metadata"]["approved_via"] == "policy" and verzoek["metadata"]["executed_at"]

    await eng(repo).tick()  # ook met beleid AAN: geen tweede uitvoering
    assert len([q for q in repo.t["action_queue"] if q.get("action_type") == "research_approval"]) == 1
    assert len([e for e in repo.t["deal_events"] if e["event_type"] == "research_approved_execution_not_wired"]) == 1


async def test_evaluation_event_flags_a_supplier_offer_updated_since_last_look():
    repo = FakeRepo()
    _kaal_voor_onderzoekbare_blokkade(repo)
    await eng(repo).tick()  # eerste keer: engine_evaluated_at wordt gezet, nog geen "changed"
    eerste = next(e for e in repo.t["deal_events"] if e["event_type"] == "engine_evaluation_changed")
    assert eerste["metadata"]["changed_since_last_evaluation"] == []

    next(o for o in repo.t["supplier_offers"] if o["id"] == OFFER)["updated_at"] = iso(0.5)  # ná tick 1, vóór tick 2
    next(c for c in repo.t["companies"] if c["id"] == SELLER_CO)["contact_policy"] = "do_not_contact"  # forceert een nieuwe blokkade
    later = NU + timedelta(hours=1)
    await EngineService(repo, now=lambda: later).tick()
    tweede = [e for e in repo.t["deal_events"] if e["event_type"] == "engine_evaluation_changed"][-1]
    assert tweede["metadata"]["blocker_code"] == "do_not_contact"
    assert tweede["metadata"]["changed_since_last_evaluation"] == ["supplier_offer"]


async def test_second_tick_on_unchanged_state_creates_no_new_evaluation_or_deadline_duplicate():
    repo = FakeRepo()
    eerste = await eng(repo).tick()
    assert eerste["summary"]["evaluations"] >= 1  # de seed-deal krijgt zijn eerste engine_* velden
    assert eerste["summary"]["deadlines"] >= 1  # de seed-deal_task is al verlopen (due_at in het verleden)
    voor = len(repo.t["deal_events"])
    voor_queue = len(repo.t["action_queue"])
    tweede = await eng(repo).tick()
    # Ongewijzigde staat: geen nieuwe engine_evaluation_changed (evaluate_deal() geeft
    # hetzelfde resultaat), en het deadline-Chase-item bestaat al (dedupe_key), dus
    # geen tweede exemplaar in action_queue.
    assert tweede["summary"]["evaluations"] == 0
    assert len(repo.t["deal_events"]) == voor
    assert len(repo.t["action_queue"]) == voor_queue
