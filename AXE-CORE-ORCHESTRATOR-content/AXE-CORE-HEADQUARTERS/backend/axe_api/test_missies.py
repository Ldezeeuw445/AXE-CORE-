"""De beslisregel van de missielus: doorgaan als het kan, stoppen als het moet."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from agent_activiteit import agent_status, soort_van
from missies import beslis, lees_rapport, normaliseer_mijlpalen

NU = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)


def missie(**kw):
    basis = {
        "id": "00000000-0000-4000-8000-000000000001", "title": "Finish AXON Memory",
        "goal": "Ship AXON Memory", "owner_agent": "developer", "supporting_agents": [],
        "status": "active", "current_milestone": 0, "continue_until": "complete",
        "milestones": normaliseer_mijlpalen(["Schema", "API", "UI"]), "metadata": {},
    }
    basis.update(kw)
    return basis


def bewezen(tid="t1", samenvatting="Built it.\nMILESTONE: done"):
    return {"id": tid, "status": "completed", "assignee": "developer", "completed_at": NU.isoformat(),
            "result": {"summary": samenvatting, "verification": {"passed": True, "checks": []}}}


def met_taak(m, i=0, tid="t1"):
    m["milestones"][i]["task_id"] = tid
    m["milestones"][i]["status"] = "working"
    return m


def test_rapport_lezen():
    assert lees_rapport("klaar") == ("done", None)
    assert lees_rapport("x\nMILESTONE: continue NEXT_ACTION: run the tests") == ("continue", "run the tests")
    assert lees_rapport("MILESTONE: blocked REASON: no SSH key") == ("blocked", "no SSH key")
    assert lees_rapport("MILESTONE: continue\nMILESTONE: done")[0] == "done"
    # Echt model op de VPS: done én continue → done.
    assert lees_rapport("ok\nMILESTONE: done\nMILESTONE: continue NEXT_ACTION: Proceed to the next milestone")[0] == "done"
    assert lees_rapport("MILESTONE: done\nMILESTONE: blocked REASON: geen sleutel") == ("blocked", "geen sleutel")


def test_eerste_stap_start_zonder_luka():
    b = beslis(missie(), None, NU)
    assert b.status == "active" and b.taak is not None
    assert b.taak.agent == "developer"
    assert "MILESTONE: done" in b.taak.request and "Schema" in b.taak.request


def test_na_bewezen_stap_volgt_automatisch_de_volgende_mijlpaal():
    b = beslis(met_taak(missie()), bewezen(), NU)
    assert b.status == "active"
    assert b.taak is not None and b.taak.mijlpaal_index == 1
    assert b.velden["milestones"][0]["status"] == "completed"
    assert b.velden["progress"] == pytest.approx(1 / 3, rel=1e-3)
    soorten = [e[0] for e in b.events]
    assert "milestone.completed" in soorten and "mission.action_chosen" in soorten


def test_klaar_zonder_bewijs_is_niet_klaar():
    taak = bewezen()
    taak["result"]["verification"] = {"passed": False}
    b = beslis(met_taak(missie()), taak, NU)
    assert b.status == "active" and b.taak is not None and b.taak.mijlpaal_index == 0
    assert b.velden["milestones"][0]["attempts"] == 1
    assert b.velden["milestones"][0]["status"] == "working"


def test_continue_blijft_in_mijlpaal_met_volgende_actie():
    b = beslis(met_taak(missie()), bewezen(samenvatting="MILESTONE: continue NEXT_ACTION: add the index"), NU)
    assert b.taak.mijlpaal_index == 0
    assert "add the index" in b.taak.request
    assert b.velden["milestones"][0]["iterations"] == 1


def test_iteratiebudget_op_sluit_mijlpaal():
    m = met_taak(missie(max_iterations_per_milestone=2))
    m["milestones"][0]["iterations"] = 1
    b = beslis(m, bewezen(samenvatting="MILESTONE: continue NEXT_ACTION: more"), NU)
    assert b.velden["milestones"][0]["status"] == "completed"
    assert b.taak.mijlpaal_index == 1


def test_mislukt_probeert_opnieuw_en_blokkeert_daarna():
    fout = {"id": "t1", "status": "failed", "error": {"message": "tests red"}}
    b = beslis(met_taak(missie()), fout, NU)
    assert b.status == "active" and b.taak.mijlpaal_index == 0 and "tests red" in b.taak.request
    m = met_taak(missie())
    m["milestones"][0]["attempts"] = 2
    b = beslis(m, fout, NU)
    assert b.status == "blocked" and "tests red" in b.velden["blocked_reason"]
    assert b.taak is None and b.melding is not None


def test_wachten_op_goedkeuring_bewaart_staat():
    b = beslis(met_taak(missie()), {"id": "t1", "status": "waiting_approval", "title": "push"}, NU)
    assert b.status == "waiting_approval" and b.taak is None
    assert "milestones" not in b.velden   # niets weggegooid


def test_na_goedkeuring_hervat_de_stap():
    b = beslis(met_taak(missie(status="waiting_approval")), {"id": "t1", "status": "queued", "assignee": "developer"}, NU)
    assert b.status == "active" and b.taak is None
    assert b.events and b.events[0][0] == "mission.resumed"


def test_lopende_taak_laat_missie_met_rust():
    b = beslis(met_taak(missie()), {"id": "t1", "status": "running", "assignee": "developer"}, NU)
    assert b.status == "active" and b.taak is None and not b.events


def test_agent_blocked_en_human():
    b = beslis(met_taak(missie()), bewezen(samenvatting="MILESTONE: blocked REASON: needs DNS access"), NU)
    assert b.status == "blocked" and b.velden["blocked_reason"] == "needs DNS access"
    b = beslis(met_taak(missie()), bewezen(samenvatting="MILESTONE: human REASON: pick a price"), NU)
    assert b.status == "human_decision_required"


def test_laatste_mijlpaal_rondt_af_met_bewijs():
    m = missie(current_milestone=2)
    for i in (0, 1):
        m["milestones"][i].update(status="completed", evidence={"verification": {"passed": True}, "summary": "ok"})
    b = beslis(met_taak(m, 2, "t3"), bewezen("t3"), NU)
    assert b.status == "completed" and b.velden["progress"] == 1
    assert any(e[0] == "mission.completed" for e in b.events)


def test_doorlopende_missie_gaat_monitoren():
    m = missie(current_milestone=2, recurring_interval_seconds=3600)
    for i in (0, 1):
        m["milestones"][i].update(status="completed", evidence={"verification": {"passed": True}, "summary": "ok"})
    b = beslis(met_taak(m, 2, "t3"), bewezen("t3"), NU)
    assert b.status == "monitoring" and b.wacht_seconden == 3600
    assert all(x["status"] == "pending" for x in b.velden["milestones"])
    assert b.velden["metadata"]["cycle"] == 1


def test_continue_until_paused_stopt_na_mijlpaal():
    b = beslis(met_taak(missie(continue_until="paused")), bewezen(), NU)
    assert b.status == "paused" and b.taak is None and b.velden["current_milestone"] == 1


def test_idempotency_sleutel_verschilt_per_poging():
    a = beslis(missie(), None, NU).taak.idempotency_key
    m = missie()
    m["milestones"][0]["attempts"] = 1
    assert beslis(m, None, NU).taak.idempotency_key != a
    m = missie(metadata={"resumes": 1})
    assert beslis(m, None, NU).taak.idempotency_key != a


def test_gepauzeerd_doet_niets():
    b = beslis(missie(status="paused"), None, NU)
    assert b.status == "paused" and b.taak is None


# ── Status op Home ───────────────────────────────────────────────────────────

def test_working_alleen_met_levende_lease():
    levend = {"id": "t", "assignee": "developer", "status": "running", "lease_token": "x",
              "lease_expires_at": (NU + timedelta(seconds=60)).isoformat()}
    assert agent_status("developer", [levend], [], None, NU)["status"] == "WORKING"
    dood = dict(levend, lease_expires_at=(NU - timedelta(seconds=5)).isoformat())
    assert agent_status("developer", [dood], [], None, NU)["status"] == "QUEUED"


def test_sleeping_waiting_blocked_monitoring():
    assert agent_status("browser", [], [], None, NU)["status"] == "SLEEPING"
    assert agent_status("developer", [{"id": "t", "assignee": "developer", "status": "waiting_approval"}], [], None, NU)["status"] == "WAITING_APPROVAL"
    blok = {"id": "m", "owner_agent": "northsea", "status": "blocked", "blocked_reason": "x", "milestones": []}
    assert agent_status("northsea", [], [blok], None, NU)["status"] == "BLOCKED"
    mon = {"id": "m", "owner_agent": "northsea", "status": "monitoring", "milestones": []}
    assert agent_status("northsea", [], [mon], None, NU)["status"] == "MONITORING"


def test_fout_verdwijnt_na_latere_succes():
    oud = {"id": "a", "assignee": "trading", "status": "failed", "updated_at": (NU - timedelta(hours=1)).isoformat(),
           "error": {"message": "boom"}}
    assert agent_status("trading", [oud], [], None, NU)["status"] == "ERROR"
    goed = {"id": "b", "assignee": "trading", "status": "completed", "updated_at": NU.isoformat()}
    assert agent_status("trading", [oud, goed], [], None, NU)["status"] == "SLEEPING"


def test_event_soorten_uit_echte_berichten():
    assert soort_van({"event_type": "axe.progress", "message": "Step 3: $ npm test"}) == "shell"
    assert soort_van({"event_type": "axe.progress", "message": "Step 2: writing a.py"}) == "file"
    assert soort_van({"event_type": "milestone.completed"}) == "milestone_completed"


# ── 10 okt: waarom bijna alles op SLEEPING stond ────────────────────────────

def test_planner_namen_tellen_voor_de_roster_agent():
    t = {"id": "t", "assignee": "code-agent", "status": "queued"}
    assert agent_status("developer", [t], [], None, NU)["status"] == "QUEUED"


def test_desk_notitie_is_geen_werk():
    notitie = {"id": "n", "assignee": "northsea", "status": "pending", "metadata": {"source": "cron"}}
    assert agent_status("northsea", [notitie], [], None, NU)["status"] == "SLEEPING"


def test_rooster_maakt_monitoring_met_wat_het_vond():
    r = {"name": "NorthSea Discovery & Sourcing Sweep", "app": "northsea", "enabled": True,
         "metadata": {"owner": "northsea"}, "last_run_at": "2026-10-07T10:00:00+00:00", "last_status": "ok",
         "last_result": '{"created": 5, "considered_pairs": 1409}', "next_run_at": "2026-10-07T12:00:00+00:00"}
    s = agent_status("northsea", [], [], None, NU, routines=[r])
    assert s["status"] == "MONITORING"
    assert "5 new matches" in s["reason"] and "next 14:00" in s["reason"]
    assert s["routines"][0]["summary"].startswith("5 new matches")


def test_lopend_rooster_is_working():
    r = {"name": "NorthSea Communication Engine", "app": "northsea", "enabled": True, "metadata": {},
         "lease_until": (NU + timedelta(seconds=60)).isoformat()}
    assert agent_status("northsea", [], [], None, NU, routines=[r])["status"] == "WORKING"
