"""Grok Bot-managers: harde grenzen, peer-berichten, pulse zonder send/orders."""
from datetime import datetime, timezone

import grok_managers as gm
import staande_diensten as sd
from test_staande_diensten import FakeDb, NU


def test_ids_en_pulse_staan_in_staande_catalogus():
    assert set(gm.GROK_IDS) <= sd.STAANDE_AGENTS
    for aid in gm.GROK_IDS:
        d = sd.catalogus_voor(aid)
        assert d["cron_expr"] == gm.PULSE_CRON[aid]
        assert d["job_key"] == f"axe_core:staande-{aid}"


def test_peer_alleen_baas_naar_iedereen_en_rapport_terug():
    assert gm.mag_peer_bericht("axemanager", "axon") is True
    assert gm.mag_peer_bericht("axon", "axemanager") is True
    assert gm.mag_peer_bericht("axon", "tradingos") is False
    assert gm.mag_peer_bericht("wingman", "axemanager") is False


def test_is_human_alleen_luka():
    assert gm.is_human_principal("luka") is True
    assert gm.is_human_principal("axemanager") is False
    assert gm.is_human_principal("northseamgr") is False
    assert gm.is_human_principal("northsea-desk-manager") is False
    assert gm.is_human_principal("luka", "axe-core-northsea-desk") is False
    assert gm.is_human_principal("") is False


def test_toets_actie_blokkeert_vlaggen_orders_geld_deals_en_sends():
    for flag in gm.AUTO_SEND_VLAGGEN:
        try:
            gm.toets_actie("config", f"set {flag}=true")
            assert False, flag
        except gm.Verboden as e:
            assert e.code == "auto_send"
    for soort, tekst, code in (
        ("live_order", "place_order XAUUSD", "live_trade"),
        ("money", "wire_transfer 400", "money"),
        ("deal_move", "close the deal", "deal"),
        ("send", "send_email to buyer", "not_human"),
    ):
        try:
            gm.toets_actie(soort, tekst, principal="northseamgr")
            assert False, soort
        except gm.Verboden as e:
            assert e.code == code
    gm.toets_actie(
        "send", "send_email chase",
        principal="luka", bestaande_thread=True, luka_ja=True,
    )


def test_axemanager_pulse_schrijft_directives_en_geen_verboden():
    db = FakeDb(core_approvals=[{"id": "a", "status": "pending", "title": "Yes needed"}],
                core_tasks=[{"id": "t", "status": "queued"}],
                core_schedules=[], core_manager_messages=[])
    uit = sd.voer_uit("axemanager", db, NU)
    assert uit["status"] == "ok"
    body = uit["output"].lower()
    assert "aanbeveling" in body
    for woord in sd.VERBODEN:
        assert woord not in body
    berichten = db.db["core_manager_messages"]
    assert {b["to_agent"] for b in berichten} == set(gm.GROK_IDS) - {gm.BAAS}
    assert all(b["from_agent"] == gm.BAAS and b["kind"] == "directive" for b in berichten)


def test_andere_managers_rapporteren_terug_zonder_te_verzenden():
    db = FakeDb(core_tasks=[{"id": "t", "status": "pending", "assignee": None}],
                core_schedules=[], core_manager_messages=[],
                intel_market_tide=[{"bias": "flat"}],
                core_approvals=[], memory=[], rag_memories=[])
    for aid in ("projectsmgr", "companionmgr", "axon", "tradingos", "northseamgr"):
        uit = sd.voer_uit(aid, db, NU)
        assert uit["status"] == "ok", aid
        for woord in sd.VERBODEN:
            assert woord not in uit["output"].lower(), aid
    rapporten = [b for b in db.db["core_manager_messages"] if b["kind"] == "report"]
    assert {b["from_agent"] for b in rapporten} == {
        "projectsmgr", "companionmgr", "axon", "tradingos", "northseamgr",
    }
    assert all(b["to_agent"] == gm.BAAS for b in rapporten)


def test_tradingos_pulse_plaatst_geen_orders():
    body = gm.run_tradingos(FakeDb(intel_market_tide=[{"bias": "bullish"}]), NU)
    assert body["orders"] == 0
    assert body["live"] is False


def test_northsea_pulse_raakt_geen_vlag_en_verstuurt_niet():
    body = gm.run_northseamgr(FakeDb(core_approvals=[], core_tasks=[]), NU)
    assert body["sent"] == 0
    assert body["flags"] == "untouched"
    assert body["priority"] == "first deal"


def test_vraag_luka_maakt_een_approval_en_dedupt():
    db = FakeDb(core_approvals=[], core_tasks=[])
    gm._vraag_luka(db, "northseamgr", "Send chase in DEAL-1?", "existing thread")
    gm._vraag_luka(db, "northseamgr", "Send chase in DEAL-1?", "existing thread")
    assert len(db.db["core_approvals"]) == 1
    assert db.db["core_approvals"][0]["status"] == "pending"
    assert db.db["core_tasks"][0]["status"] == "waiting_approval"
    assert db.db["core_approvals"][0]["requested_by"] == "northseamgr"


def test_geheugen_schrijft_geen_cycle_of_hold():
    db = FakeDb(memory=[])
    assert gm._les_schrijven(db, "axon", "HOLD score=0") == "noop"
    assert gm._les_schrijven(db, "axon", "") == "leeg"
    assert gm._les_schrijven(db, "axon", "Buyers ghost after first call unless a named next step exists.") == "ok"
    assert len(db.db["memory"]) == 1
    assert db.db["memory"][0]["agent"] == "axe_axon"
