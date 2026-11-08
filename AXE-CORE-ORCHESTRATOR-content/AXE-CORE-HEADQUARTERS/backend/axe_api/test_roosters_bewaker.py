"""Companion Manager: met de echte vaste jobs van 8 november 12:05 als voorbeeld.

Die dag zei hij "jobs 21, failing 1", terwijl de NorthSea-motor na een uur
databasestoring tot 14:13 in terugval-rust lag en alle DAX-bots stilstonden.
"""
from datetime import datetime, timezone

import grok_managers as gm
import roosters_bewaker as rb
from test_projecten_bewaker import FakeDb

NU = datetime(2026, 11, 8, 12, 5, tzinfo=timezone.utc)


def job(key, status="ok", fouten=0, volgende="2026-11-08T12:15:00+00:00", resultaat="", aan=True, **extra):
    return {"id": key, "job_key": key, "name": key, "app": "axe_core", "enabled": aan, "last_status": status,
            "consecutive_failures": fouten, "next_run_at": volgende, "last_result": resultaat,
            "lease_owner": None, "lease_until": None, "metadata": {}, **extra}


ROOSTERS_8NOV = [
    job("northsea:engine", "fail", 12, "2026-11-08T14:13:22+00:00",
        '{"summary": null, "errors": [], "sent": null, "notices": [], "http": 502}'),
    job("northsea:operations", "fail", 10, "2026-11-08T12:42:21+00:00",
        '{"status": null, "results": [], "sent": 0, "http": 502}'),
    job("axe_core:dax-wacht", "fail", 6, "2026-11-08T12:36:52+00:00",
        '{"bots": {"browser": {"error": "Expecting \',\' delimiter: line 1 column 258"}}}'),
    job("axe-review-desk-sources", "skipped", 15, "2026-11-08T13:07:32+00:00",
        '{"bronnen": {"gmail": "autorisatie"}, "wacht_op_autorisatie": true}'),
    job("northsea:discovery", "ok", 0, "2026-11-08T13:00:00+00:00", '{"http": 200}'),
    job("axe_core:trading-team-test-15m", None, 0, "2026-10-31T00:21:38+00:00", aan=False),
]


def rijen():
    return [dict(r, metadata={}) for r in ROOSTERS_8NOV]


def codes(b):
    return [x.code for x in b]


def test_lang_falende_jobs_bereiken_luka_met_vaste_titel():
    b = rb.beoordeel(rijen(), NU)
    assert codes(b)[0] == "jobs_falen" and b[0].voor == "luka"
    assert b[0].titel == "Vaste jobs falen achter elkaar"
    assert "northsea:engine: 12x (tijdelijke fout, ik herkans)" in b[0].detail
    assert "axe_core:dax-wacht: 6x" in b[0].detail and "dax-wacht: 6x (tijdelijke" not in b[0].detail


def test_wachten_op_koppeling_is_info_en_uitgezette_job_telt_niet():
    b = rb.beoordeel(rijen(), NU)
    assert "wacht_op_koppeling" in codes(b)
    assert "jobs_achter" not in codes(b)  # de uitgezette testjob van 31 okt is geen achterstand


def test_alleen_tijdelijke_fouten_in_lange_rust_worden_herkanst():
    weg = {r["job_key"] for r in rb.herkansen(rijen(), NU)}
    # operations (12:42) ligt ook in rust: 37 min is korter dan LANGE_RUST, dus die wacht gewoon.
    assert weg == {"northsea:engine"}


def test_herkansen_hooguit_een_keer_per_uur():
    r = rijen()
    r[0]["metadata"] = {"vroeg_herkanst_op": "2026-11-08T11:30:00+00:00"}
    assert rb.herkansen(r, NU) == []
    r[0]["metadata"] = {"vroeg_herkanst_op": "2026-11-08T10:30:00+00:00"}
    assert [x["job_key"] for x in rb.herkansen(r, NU)] == ["northsea:engine"]


def test_job_die_niet_wordt_opgepakt_bereikt_luka():
    r = [job("axe_core:planner", "ok", 0, "2026-11-08T10:10:00+00:00")]
    b = rb.beoordeel(r, NU)
    assert codes(b) == ["jobs_achter"] and b[0].voor == "luka"


def test_pulse_herkanst_vraagt_luka_en_zwijgt_als_er_niets_verandert():
    db = FakeDb()
    db.db["core_schedules"] = rijen()
    uit = gm.run_companionmgr(db, NU)
    assert uit["herkanst"] == ["northsea:engine"] and uit["voor_luka"] == ["jobs_falen"]
    engine = next(r for r in db.rows("core_schedules") if r["job_key"] == "northsea:engine")
    assert engine["next_run_at"] == NU.isoformat()
    assert engine["metadata"]["vroeg_herkanst_door"] == "companionmgr"
    assert "Vaste jobs falen achter elkaar" in [r.get("title") for r in db.rows("core_approvals")]
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "companionmgr"]
    assert len(rapporten) == 1 and "nu opnieuw gestart: northsea:engine" in rapporten[0]["body"]

    # Tweede pulse: niet opnieuw herkanst (binnen het uur); engine staat nu
    # niet meer "in rust" maar "verlopen" -> wel een ander rapport. Derde: stil.
    gm.run_companionmgr(db, NU)
    gm.run_companionmgr(db, NU)
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "companionmgr"]
    assert len(rapporten) == 2
    assert [r.get("title") for r in db.rows("core_approvals")].count("Vaste jobs falen achter elkaar") == 1


def test_alles_groen_zegt_alles_draait():
    db = FakeDb()
    db.db["core_schedules"] = [job("northsea:discovery")]
    uit = gm.run_companionmgr(db, NU)
    assert uit["bevindingen"] == [] and uit["herkanst"] == []
    assert "alles draait" in db.rows("core_manager_messages")[0]["body"]
