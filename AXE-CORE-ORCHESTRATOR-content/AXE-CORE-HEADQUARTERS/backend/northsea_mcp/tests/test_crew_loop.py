"""De bestaande desk-lus: crews doen het werk; een ja of een lege run is zichtbaar."""
from __future__ import annotations

from fakes import DRAFT_APPROVED, DRAFT_PENDING, OPP
from northsea_mcp.crew_loop import (
    finish_after_event,
    finish_discovery,
    finish_engine_tick,
    finish_idle_operations,
    is_scheduled,
    notice_body,
)
from northsea_mcp.orchestration import OrchestrationResult, ValidationResult
from northsea_mcp.service import Caller, NorthSeaService


def _ok():
    return OrchestrationResult(
        status="ok", event_id="e1", run_id="r1", route="deal_run", crew_family="deal",
        validation=ValidationResult(valid=True, event_type="opportunity_qualification"),
    )


def _event(**over):
    ev = {
        "event_id": "auto-qualify-1", "run_id": "run-1",
        "event_type": "opportunity_qualification",
        "source": "northsea_operations_loop",
        "payload": {"opportunity_id": OPP, "automated_sweep": True},
    }
    ev.update(over)
    return ev


def _flags(repo):
    p = repo.t["deal_automation_policy"][0]
    return p["auto_send_qualification"], p["auto_reply_nonbinding"], p["auto_send_followups"]


def test_alleen_het_rooster_is_de_lus():
    assert is_scheduled(_event()) is True
    assert is_scheduled({"source": "axe-core", "payload": {"opportunity_id": OPP}}) is False


async def test_historisch_concept_wordt_een_ja_en_gaat_niet_de_deur_uit(repo, research, crew):
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(service, _event(), _ok())
    assert uit["sent"] == 0 and uit["approved"] == 0
    assert uit["notice"]["akkoord_nodig"] is True
    tekst = uit["notice"]["tekst"]
    assert "What yes does:" in tekst
    assert "Buyer:" in tekst and "Seller:" in tekst and "Commission:" in tekst
    assert "Qinzhou" in tekst and "Mopani" in tekst
    assert repo.sends == []
    assert next(d for d in repo.t["reply_drafts"] if d["id"] == DRAFT_PENDING)["approval_status"] == "pending"
    assert _flags(repo) == (False, False, False)
    taken = [t for t in repo.t["deal_tasks"] if t.get("requires_approval")]
    assert taken and taken[-1]["owner"] == "luka"
    assert any("What yes does" in (t.get("description") or "") for t in taken)


async def test_axe_mag_niet_bindende_kwalificatie_versturen_via_de_desk_manager(repo, research, crew):
    for d in repo.t["reply_drafts"]:
        if d["approval_status"] == "pending":
            d["approval_status"] = "rejected"
    service = NorthSeaService(repo, research, crew)
    voor = list(repo.sends)
    uit = await finish_after_event(service, _event(), _ok())
    assert uit.get("sent") == 1
    assert uit.get("approved") == 1
    assert uit.get("notice") is None
    assert len(repo.sends) == len(voor) + 1
    assert DRAFT_PENDING not in repo.sends
    assert DRAFT_APPROVED not in repo.sends
    assert _flags(repo) == (False, False, False)
    nieuw = next(d for d in repo.t["reply_drafts"] if d["id"] == repo.sends[-1])
    assert nieuw["approval_actor_type"] == "human"
    assert nieuw["approved_by"] == "northsea-desk-manager"
    assert nieuw["sent_at"]


async def test_handmatige_call_verandert_niets(repo, research, crew):
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(
        service,
        {"source": "chatgpt", "payload": {"opportunity_id": OPP}},
        _ok(),
    )
    assert uit.get("skipped") is True
    assert repo.sends == []
    assert _flags(repo) == (False, False, False)


async def test_goede_deal_zonder_bescherming_is_een_ja_geen_jacht(repo, research, crew):
    for d in repo.t["reply_drafts"]:
        d["approval_status"] = "rejected"
    repo.t["communications"].clear()
    opp = repo.t["opportunities"][0]
    opp["seller_gate_passed"] = True
    opp["buyer_gate_passed"] = True
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(service, _event(), _ok())
    assert uit["sent"] == 0
    notice = uit["notice"]
    assert notice["akkoord_nodig"] is True
    assert "commission protection" in notice["what_yes_does"].lower() or "Commission" in notice["tekst"]
    assert "Buyer:" in notice["tekst"] and "Seller:" in notice["tekst"]
    assert "What yes does:" in notice["tekst"]
    assert repo.sends == []


async def test_eerste_kwalificatie_loopt_door_de_bestaande_desk_manager_zonder_nep_inbound(repo, research, crew):
    for d in repo.t["reply_drafts"]:
        if d["approval_status"] == "pending":
            d["approval_status"] = "rejected"
    repo.t["communications"].clear()
    service = NorthSeaService(repo, research, crew)
    uit = await finish_after_event(service, _event(), _ok())
    assert uit["sent"] == 1 and uit["approved"] == 1
    draft = next(d for d in repo.t["reply_drafts"] if d["id"] == uit["draft_id"])
    assert draft["communication_id"] is None and draft["approval_status"] == "approved"
    assert draft["approved_by"] == "northsea-desk-manager"
    assert len(repo.sends) == 1
    assert _flags(repo) == (False, False, False)


async def test_discovery_nul_paren_schrijft_zichtbaar_geen_mail(repo):
    uit = await finish_discovery(repo, {"created": 0, "considered_pairs": 1554, "candidates_found": 0})
    assert uit["sent"] == 0
    assert uit["notice"]["akkoord_nodig"] is False
    assert "1554" in uit["notice"]["tekst"]
    assert "What yes does:" in notice_body(
        {"deal_code": "x", "product": "Copper", "buyer": "A", "seller": "B",
         "commission": {"status": "not_started"}},
        what_yes_does="nothing",
    )
    chase = [q for q in repo.t["action_queue"] if q.get("action_type") == "desk_run_note"]
    assert chase and chase[-1]["metadata"]["owner"] == "axe"
    assert chase[-1]["requires_approval"] is False


async def test_engine_zonder_followup_verdwijnt_niet(repo, research, crew):
    service = NorthSeaService(repo, research, crew)
    uit = await finish_engine_tick(service, {"plan": {"followups": []}, "sent": 0})
    assert uit["sent"] == 0
    assert "0 follow-up" in uit["notice"]["titel"]
    assert uit["flags"] == {
        "auto_send_qualification": False,
        "auto_reply_nonbinding": False,
        "auto_send_followups": False,
    }


async def test_stille_operations_sweep_schrijft_toch(repo):
    uit = await finish_idle_operations(repo, active=65, recent=65)
    assert uit["sent"] == 0
    assert "nothing new" in uit["notice"]["titel"]
    assert "65" in uit["notice"]["tekst"]


def test_desk_manager_is_geen_service_token():
    from northsea_mcp.crew_loop import desk_manager_caller
    c: Caller = desk_manager_caller()
    assert c.is_human is True
    assert not c.principal.startswith("service:")
