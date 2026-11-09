"""AXE CORE Manager: met de open vragen van 9 november 07:27 als voorbeeld.

"NorthSea: er komt geen mail meer binnen" stond sinds 6 nov bij Luka, terwijl
de northseamgr om 07:15 rapporteerde "75 wachten op jouw ok, 38 wachten op
antwoord" -- geen woord meer over mail -- en om 07:10 nieuwe mail binnenkwam.
"""
from datetime import datetime, timezone

import baas_bewaker as bb
import grok_managers as gm
from test_axon_bewaker import _Db

NU = datetime(2026, 11, 9, 7, 30, tzinfo=timezone.utc)
MANAGERS = tuple(m for m in gm.GROK_IDS if m != gm.BAAS)

VRAGEN_9NOV = [
    {"id": "v1", "status": "pending", "kind": "manager_ask", "requested_by": "northseamgr", "task_id": "t1",
     "title": "NorthSea: er komt geen mail meer binnen", "created_at": "2026-11-06T18:45:33+00:00", "metadata": {}},
    {"id": "v2", "status": "pending", "kind": "manager_ask", "requested_by": "projectsmgr", "task_id": "t2",
     "title": "Taken staan vast in de wachtrij", "created_at": "2026-11-09T06:45:18+00:00", "metadata": {}},
    {"id": "v3", "status": "pending", "kind": "northsea_mail", "requested_by": "northseamgr",
     "title": "NorthSea mail van nieuwe afzender", "created_at": "2026-11-09T07:10:25+00:00", "metadata": {}},
]
RAPPORTEN_9NOV = {
    "northseamgr": {"body": "NorthSea: 75 wachten op jouw ok, 38 wachten op antwoord.",
                    "created_at": "2026-11-09T07:15:30+00:00"},
    "projectsmgr": {"body": "Taken: Taken staan vast in de wachtrij.", "created_at": "2026-11-09T05:30:19+00:00"},
}


def rooster(m, laatst="2026-11-09T07:20:00+00:00", fouten=0, aan=True):
    return {"job_key": f"axe_core:staande-{m}", "enabled": aan, "last_status": "ok",
            "consecutive_failures": fouten, "last_run_at": laatst}


def test_vraag_die_de_manager_niet_meer_meldt_is_opgelost():
    weg = bb.opgeloste_vragen(VRAGEN_9NOV, RAPPORTEN_9NOV, NU)
    # v2 is te jong en nog gemeld; v3 is een mailkaart, nooit door de baas te sluiten.
    assert [v["id"] for v in weg] == ["v1"]


def test_geen_rapport_na_de_vraag_dan_blijft_hij_staan():
    oud = {"northseamgr": {"body": "NorthSea: niets.", "created_at": "2026-11-06T19:00:00+00:00"}}
    assert bb.opgeloste_vragen(VRAGEN_9NOV, oud, NU) == []


def test_stille_of_falende_manager_bereikt_luka():
    roosters = [rooster(m) for m in MANAGERS if m != "axon"] + [rooster("axon", "2026-11-09T05:00:00+00:00")]
    roosters[0]["consecutive_failures"] = 4
    b = bb.beoordeel(roosters, MANAGERS, NU)
    assert [x.code for x in b] == ["manager_stil", "manager_faalt"]
    assert "axon (laatst 09-11 05:00 UTC)" in b[0].detail
    assert bb.beoordeel([rooster(m) for m in MANAGERS], MANAGERS, NU) == []


def test_pulse_sluit_de_oude_vraag_en_zegt_het_een_keer():
    db = _Db()
    db.db["core_approvals"] = [dict(v) for v in VRAGEN_9NOV]
    db.db["core_tasks"] = [{"id": "t1", "status": "waiting_approval"}, {"id": "t2", "status": "waiting_approval"}]
    db.db["core_schedules"] = [rooster(m) for m in MANAGERS]
    db.db["core_manager_messages"] = [{"from_agent": m, "to_agent": gm.BAAS, "kind": "report", **r}
                                      for m, r in RAPPORTEN_9NOV.items()]
    uit = gm.run_axemanager(db, NU)
    assert uit["gesloten"] == ["NorthSea: er komt geen mail meer binnen"] and uit["voor_luka"] == []
    v1 = next(r for r in db.rows("core_approvals") if r["id"] == "v1")
    assert v1["status"] == "expired" and v1["metadata"]["gesloten_door"] == gm.BAAS
    assert next(r for r in db.rows("core_tasks") if r["id"] == "t1")["status"] == "cancelled"
    assert next(r for r in db.rows("core_tasks") if r["id"] == "t2")["status"] == "waiting_approval"
    gm.run_axemanager(db, NU)
    van_baas = [r for r in db.rows("core_manager_messages") if r["from_agent"] == gm.BAAS]
    assert len(van_baas) == 1 and "geen mail meer binnen" in van_baas[0]["body"]
