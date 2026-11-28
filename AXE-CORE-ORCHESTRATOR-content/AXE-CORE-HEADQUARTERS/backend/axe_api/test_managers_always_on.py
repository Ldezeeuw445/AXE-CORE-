"""De managers ZIJN de DAX-bots, always on zoals in Grok Bot (Luka, 28 nov 2026).

Gemeten 28 nov: alle zeven computers draaiden en gaven een hartslag, maar het
vaste werk stond in dax_wacht nog onder de oude botnamen. Sinds de computers op
26 nov op naam van de managers kwamen, gaf ROUTINES.get("projectsmgr") None: geen
manager kreeg vast werk, Companion en AXON nooit, en de oude missies liepen door
onder developer/thinktank/northsea/trading/browser. Deze tests leggen vast:
één manager = één computer = één vaste missie, op naam van de manager.
"""
from __future__ import annotations

import uuid

import dax_wacht
from manager_identiteit import alle_managers, manager_naam
from test_dax_wacht import NU, NepDB, NepRuntime, computer, gezond_hart

LIVE_COMPUTERS = {  # core_dax_computers, 28 nov
    "dax-thinktank-01": "axemanager", "dax-developer-01": "projectsmgr", "dax-companion-01": "companionmgr",
    "dax-axon-01": "axon", "dax-trading-01": "tradingos", "dax-northsea-01": "northseamgr",
    "dax-browser-01": "browser",
}


def _live_db(**extra):
    rijen = [computer(eig, id=cid) for cid, eig in LIVE_COMPUTERS.items()]
    return NepDB(core_dax_computers=rijen, core_missions=[], core_mission_events=[], core_tasks=[], **extra)


def test_elke_manager_heeft_vast_werk_en_er_is_geen_botnaam_meer():
    assert set(dax_wacht.ROUTINES) == set(alle_managers())
    for oud in ("browser", "developer", "thinktank", "northsea", "trading"):
        assert oud not in dax_wacht.ROUTINES
    # Een oude naam vindt het werk van zijn manager.
    assert dax_wacht.routine_voor("developer") is dax_wacht.ROUTINES["projectsmgr"]
    assert dax_wacht.routine_voor("browser") is None


def test_alleen_lezen_managers_schrijven_geen_bestand():
    # Trading OS en NorthSea hebben geen write_file (agent_workspace _LEES/_NORTHSEA).
    import agent_workspace as aw
    for agent, r in dax_wacht.ROUTINES.items():
        tools = aw.laad_workspace(agent)["tools"]
        assert r.verslag == ("write_file" in tools), agent


def test_een_ronde_geeft_alle_zes_managers_hun_missie_op_hun_eigen_naam():
    db = _live_db()
    rt = NepRuntime(gezond_hart(), status="running")
    uit = dax_wacht.ronde(lambda: db, runtime_factory=lambda c: rt, model_check=lambda: None, nu=NU)

    missies = db.tabellen["core_missions"]
    assert sorted(m["owner_agent"] for m in missies) == sorted(alle_managers())
    assert {m["metadata"]["dax_routine"] for m in missies} == set(alle_managers())
    assert all(m["status"] == "active" for m in missies)
    titels = {m["owner_agent"]: m["title"] for m in missies}
    assert titels["companionmgr"] == f"Site watch ({manager_naam('companionmgr')})"
    # Browser blijft wakker en gemeten, maar is geen agent met eigen werk.
    assert uit["bots"]["browser"].get("shared") is True and "mission" not in uit["bots"]["browser"]
    browser = next(r for r in db.tabellen["core_dax_computers"] if r["id"] == "dax-browser-01")
    assert browser["status"] == "running" and browser["stats"]["routine"] is None
    assert dax_wacht.ronde_status(uit) == "ok"


def test_oude_missie_wordt_geadopteerd_niet_verdubbeld():
    oud = dax_wacht.missie_rij("projectsmgr", dax_wacht.ROUTINES["projectsmgr"])
    oud.update(id=str(uuid.uuid4()), owner_agent="developer", title="Orchestrator health check (developer)",
               status="monitoring", metadata={**oud["metadata"], "dax_routine": "developer"},
               created_at="2026-10-11T12:00:00+00:00")
    db = NepDB(core_missions=[oud], core_mission_events=[], core_tasks=[])

    uit = dax_wacht.zorg_voor_missie(db, "projectsmgr", dax_wacht.ROUTINES["projectsmgr"], [], NU)

    assert uit["mission"] == oud["id"] and len(db.tabellen["core_missions"]) == 1
    m = db.tabellen["core_missions"][0]
    assert m["owner_agent"] == "projectsmgr" and m["metadata"]["dax_routine"] == "projectsmgr"
    assert m["title"] == "Orchestrator health check (Projects Manager)"
    assert m["status"] == "monitoring"                       # wat er liep, blijft lopen
    events = [e for e in db.tabellen["core_mission_events"] if e.get("kind", e.get("event_type")) == "mission.adopted"
              or "mission.adopted" in str(e)]
    assert events, db.tabellen["core_mission_events"]
    # Een tweede ronde maakt geen nieuwe en meldt de adoptie niet opnieuw.
    dax_wacht.zorg_voor_missie(db, "projectsmgr", dax_wacht.ROUTINES["projectsmgr"], [], NU)
    assert len(db.tabellen["core_missions"]) == 1
    assert len([e for e in db.tabellen["core_mission_events"] if "mission.adopted" in str(e)]) == 1


def test_geadopteerde_trading_missie_krijgt_de_alleen_lezen_opdracht():
    r = dax_wacht.ROUTINES["tradingos"]
    oud = dax_wacht.missie_rij("tradingos", r)
    # Zoals live: de oude opdracht van de trading-bot schreef een verslagbestand.
    oud.update(id=str(uuid.uuid4()), owner_agent="trading", status="monitoring",
               metadata={**oud["metadata"], "dax_routine": "trading"},
               milestones=[{"key": "markets", "goal": "4. Write a short factual report (markdown) with write_file",
                            "task_id": "klaar-1"}])
    db = NepDB(core_missions=[oud], core_mission_events=[], core_tasks=[{"id": "klaar-1", "status": "completed"}])
    dax_wacht.zorg_voor_missie(db, "trading", r, [], NU)
    m = db.tabellen["core_missions"][0]
    assert m["owner_agent"] == "tradingos"
    assert "do not write files" in m["milestones"][0]["goal"] and not m["milestones"][0].get("task_id")


def test_browser_missie_wordt_beeindigd_niet_verwijderd():
    oud = {"id": str(uuid.uuid4()), "owner_agent": "browser", "status": "monitoring", "title": "Site watch (browser)",
           "metadata": {"dax_routine": "browser", "routine": "sites"}, "milestones": [], "current_milestone": 0}
    db = _live_db()
    db.tabellen["core_missions"].append(oud)
    rt = NepRuntime(gezond_hart(), status="running")
    uit = dax_wacht.ronde(lambda: db, runtime_factory=lambda c: rt, model_check=lambda: None, nu=NU)

    m = next(x for x in db.tabellen["core_missions"] if x["id"] == oud["id"])
    assert m["status"] == "cancelled" and "shared computer" in m["last_stop_reason"]
    assert uit["bots"]["browser"]["retired"] == [{"mission": oud["id"], "action": "retired"}]
    assert len(db.tabellen["core_missions"]) == 7              # zes nieuwe + de oude, niets weg


def test_browser_missie_met_lopende_taak_wacht():
    taak = str(uuid.uuid4())
    oud = {"id": str(uuid.uuid4()), "owner_agent": "browser", "status": "monitoring",
           "metadata": {"dax_routine": "browser"}, "current_milestone": 0,
           "milestones": [{"key": "sites", "task_id": taak}]}
    db = NepDB(core_missions=[oud], core_mission_events=[], core_tasks=[{"id": taak, "status": "running"}])
    assert dax_wacht.beeindig_overgenomen(db, "browser", NU) == [
        {"mission": oud["id"], "action": "waiting", "reason": "a task is still running"}]
    assert db.tabellen["core_missions"][0]["status"] == "monitoring"
