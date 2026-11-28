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


def test_geadopteerde_trading_missie_krijgt_de_opdracht_van_de_manager():
    r = dax_wacht.ROUTINES["tradingos"]
    oud = dax_wacht.missie_rij("tradingos", r)
    # Zoals live: de oude opdracht van de trading-bot schreef een verslagbestand.
    oud.update(id=str(uuid.uuid4()), owner_agent="trading", status="monitoring",
               metadata={**oud["metadata"], "dax_routine": "trading"},
               milestones=[{"key": "markets", "goal": "old text from the trading bot", "task_id": "klaar-1"}])
    db = NepDB(core_missions=[oud], core_mission_events=[], core_tasks=[{"id": "klaar-1", "status": "completed"}])
    dax_wacht.zorg_voor_missie(db, "trading", r, [], NU)
    m = db.tabellen["core_missions"][0]
    assert m["owner_agent"] == "tradingos"
    assert m["milestones"][0]["goal"] == dax_wacht.missie_rij("tradingos", r)["milestones"][0]["goal"]
    assert not m["milestones"][0].get("task_id")


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


# ── het vaste werk in het eigen gesprek (28 nov) ────────────────────────────

def _routine_db(*taken, berichten=()):
    from test_manager_werk import DB
    missie = {"id": "m-axon", "title": "Site watch (AXON Memory Manager)",
              "metadata": {"dax_routine": "axon", "routine": "sites-axon"}}
    gewoon = {"id": "m-los", "title": "Iets anders", "metadata": {}}
    return DB({"core_tasks": list(taken), "core_missions": [missie, gewoon],
               "core_manager_messages": list(berichten)})


def _taak(i, status="completed", summary="Site watch complete. Receipt sites-axon-1. 2/2 up.\nMILESTONE: done",
          missie="m-axon", assignee="axon"):
    from datetime import datetime, timezone
    return {"id": f"t{i}", "title": "Site watch: run dax-routine", "status": status, "assignee": assignee,
            "requested_by": "axe-missions", "completed_at": datetime(2026, 11, 28, 10, i, tzinfo=timezone.utc).isoformat(),
            "result": {"summary": summary}, "metadata": {"source": "mission_engine", "mission_id": missie}}


def test_vaste_ronde_komt_in_het_gesprek_van_de_manager():
    import manager_werk as mw
    from datetime import datetime, timezone
    nu = datetime(2026, 11, 28, 11, 0, tzinfo=timezone.utc)
    db = _routine_db(_taak(1), _taak(2, missie="m-los"))
    assert mw.meld_routines(db, nu) == 1
    [b] = db.data["core_manager_messages"]
    assert b["from_agent"] == "axon" and b["to_agent"] == "luka"
    assert b["body"].startswith("Vaste ronde: Site watch op mijn eigen computer is gedaan.")
    assert "2/2 up" in b["body"] and "MILESTONE" not in b["body"]
    assert db.data["core_tasks"][0]["metadata"]["gemeld"]
    assert "gemeld" not in db.data["core_tasks"][1]["metadata"]      # geen routine: niet hier
    assert mw.meld_routines(db, nu) == 0                              # niet twee keer


def test_gelukte_ronde_hooguit_een_keer_per_dag_mislukte_altijd():
    import manager_werk as mw
    from datetime import datetime, timezone
    nu = datetime(2026, 11, 28, 18, 0, tzinfo=timezone.utc)
    eerder = {"from_agent": "axon", "to_agent": "luka", "body": "Vaste ronde: Site watch ...",
              "created_at": datetime(2026, 11, 28, 11, 0, tzinfo=timezone.utc).isoformat()}
    db = _routine_db(_taak(3), _taak(4, status="failed", summary="sites-axon: no site answered"), berichten=[eerder])
    assert mw.meld_routines(db, nu) == 1
    nieuw = db.data["core_manager_messages"][-1]["body"]
    assert "lukte niet (failed)" in nieuw and "no site answered" in nieuw
    assert db.data["core_tasks"][0]["metadata"]["stil"] is True       # gezien, niet opnieuw gezegd


def test_ronde_die_zichzelf_blokkeert_telt_als_mislukt():
    import manager_werk as mw
    t = _taak(5, summary="Ran it.\nMILESTONE: blocked REASON: HTTP 503")
    assert "lukte niet" in mw.routine_tekst(t, {"title": "Site watch (AXON Memory Manager)"})


# ── één hartslag per manager (28 nov) ───────────────────────────────────────

def test_hartslag_is_eigen_check_plus_eigen_ronde(monkeypatch):
    import grok_managers as gm
    import manager_werk as mw
    from datetime import datetime, timezone
    nu = datetime(2026, 11, 28, 12, 0, tzinfo=timezone.utc)
    volgorde = []
    monkeypatch.setitem(gm.RUNNERS, "axon", lambda db, n: volgorde.append("check") or {"job": "axon"})
    monkeypatch.setattr(mw, "eigen_ronde", lambda db, a, n, chat=None: volgorde.append(f"ronde:{a}") or "Repareer X")
    uit = gm.hartslag("axon", object(), nu)
    assert volgorde == ["check", "ronde:axon"]
    assert uit == {"job": "axon", "eigen_ronde": "Repareer X"}
    # De pulse-dienst van elke manager IS die hartslag.
    d = next(d for d in gm.diensten() if d["agent"] == "axon")
    volgorde.clear()
    d["run"](object(), nu)
    assert volgorde == ["check", "ronde:axon"]


def test_hartslag_ronde_faalt_zonder_de_check_te_verliezen(monkeypatch):
    import grok_managers as gm
    import manager_werk as mw
    from datetime import datetime, timezone
    monkeypatch.setitem(gm.RUNNERS, "tradingos", lambda db, n: {"job": "t"})
    monkeypatch.setattr(mw, "eigen_ronde", lambda *a, **k: 1 / 0)
    uit = gm.hartslag("tradingos", object(), datetime(2026, 11, 28, tzinfo=timezone.utc))
    assert uit["job"] == "t" and "division" in uit["eigen_ronde_fout"]


def test_inbox_lus_wekt_geen_managers_meer(monkeypatch):
    import manager_werk as mw
    from datetime import datetime, timezone
    from test_manager_werk import DB
    monkeypatch.setattr(mw, "eigen_ronde", lambda *a, **k: (_ for _ in ()).throw(AssertionError("niet hier")))
    uit = mw.run(DB({"core_manager_messages": [], "core_tasks": []}), datetime(2026, 11, 28, 12, 0, tzinfo=timezone.utc),
                 chat=lambda m: ("{}", "groq"))
    assert "eigen_ronde" not in uit and not uit["fouten"]
