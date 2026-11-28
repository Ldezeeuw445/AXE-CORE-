"""Tests voor de fusie van managers en DAX-bots (Issue #355).

Luka, 26-27 nov 2026: managers en DAX-bots zijn één identiteit. Er gaat niets
verloren, maar er blijft per terrein één manager over. Richting (zijn keuze, en
zo al live sinds de ADR van 26 nov): de zes managers zijn canoniek, de oude
DAX-botnamen zijn aliassen; Browser is een gedeelde computer, geen agent.
"""
from datetime import datetime, timedelta, timezone

import agent_workspace as aw
import manager_draad as md
import manager_werk as mw
from manager_identiteit import (
    ALIAS_NAAR_CANONIEK,
    CANONIEKE_MANAGERS,
    DAX_BOT_VAN_MANAGER,
    alle_managers,
    alle_namen,
    canoniek_of_zelf,
    is_manager,
    manager_naam,
    manager_terrein,
    namen_van,
    normaliseer_manager,
)
from test_manager_werk import DB

NU = datetime(2026, 11, 27, 20, 0, tzinfo=timezone.utc)


def t(min_geleden: int) -> str:
    return (NU - timedelta(minutes=min_geleden)).isoformat()


# ── de identiteit ──────────────────────────────────────────────────────────

def test_northsea_is_alias_van_northseamgr():
    assert normaliseer_manager("northsea") == "northseamgr"
    assert normaliseer_manager("NORTHSEA") == "northseamgr"
    assert normaliseer_manager("northseamgr") == "northseamgr"


def test_oude_dax_botnamen_wijzen_naar_hun_manager():
    assert normaliseer_manager("trading") == "tradingos"
    assert normaliseer_manager("developer") == "projectsmgr"
    assert normaliseer_manager("thinktank") == "axemanager"
    for alias in DAX_BOT_VAN_MANAGER:
        assert is_manager(alias)


def test_browser_is_geen_manager_maar_een_gedeelde_computer():
    assert not is_manager("browser")
    assert "browser" not in ALIAS_NAAR_CANONIEK
    assert aw.GEDEELDE_BROWSER_DAX == "dax-browser-01"


def test_zes_unieke_managers_en_geen_alias_in_de_lijst():
    managers = alle_managers()
    assert managers == CANONIEKE_MANAGERS
    assert len(managers) == 6 == len(set(managers))
    assert "northseamgr" in managers and "northsea" not in managers


def test_elke_manager_heeft_naam_en_terrein():
    for agent in alle_managers():
        assert manager_naam(agent)
        assert manager_terrein(agent)
    assert manager_naam("northsea") == manager_naam("northseamgr") == "NorthSea Desk Manager"


def test_alias_verwijst_altijd_naar_canonieke_manager():
    for alias, canoniek in ALIAS_NAAR_CANONIEK.items():
        assert canoniek in CANONIEKE_MANAGERS
        assert normaliseer_manager(alias) == canoniek


def test_onbekende_naam_is_geen_manager_en_blijft_wat_hij_was():
    assert not is_manager("onbekende-agent")
    assert normaliseer_manager("") == ""
    assert normaliseer_manager(None) == ""
    assert canoniek_of_zelf("luka") == "luka"
    assert canoniek_of_zelf("northsea") == "northseamgr"
    assert canoniek_of_zelf(None) is None


def test_namen_van_geeft_manager_plus_aliassen():
    assert namen_van("northsea") == ("northseamgr", "northsea", "northsea-desk", "northsea_desk")
    assert namen_van("companionmgr") == ("companionmgr",)
    assert set(alle_namen()) >= {"northseamgr", "northsea", "tradingos", "trading", "developer", "thinktank"}


def test_een_bron_agent_workspace_gebruikt_dezelfde_aliassen():
    assert aw.MANAGER_VAN_DAX_BOT == DAX_BOT_VAN_MANAGER
    for alias, m in DAX_BOT_VAN_MANAGER.items():
        assert aw.manager_voor(alias) == normaliseer_manager(alias) == m


# ── de managerlus: één manager, één gesprek, één takenstroom ───────────────

def test_lus_kent_alleen_de_zes_managers():
    assert mw.IN_GESPREK == mw.MANAGERS == alle_managers()
    assert not hasattr(mw, "DAX_BOTS")


def test_northsea_en_northseamgr_zijn_hetzelfde_gesprek():
    berichten = [
        {"from_agent": "luka", "to_agent": "northsea", "kind": "directive", "body": "oud, aan de DAX-bot", "created_at": t(30)},
        {"from_agent": "northseamgr", "to_agent": "luka", "kind": "report", "body": "beantwoord", "created_at": t(20)},
        {"from_agent": "luka", "to_agent": "northseamgr", "kind": "directive", "body": "nieuw", "created_at": t(10)},
    ]
    # Het antwoord van northseamgr beantwoordt ook het bericht aan northsea; alleen "nieuw" wacht.
    assert [b["body"] for b in mw.onbeantwoord(berichten, "northseamgr", NU)] == ["nieuw"]
    assert mw.onbeantwoord(berichten, "northsea", NU) == mw.onbeantwoord(berichten, "northseamgr", NU)
    # In de app: één gesprek, onder de manager.
    agents = {md._rij_naar_bericht(b)["agent"] for b in berichten}
    assert agents == {"northseamgr"}


def test_bericht_aan_oude_naam_krijgt_antwoord_van_de_manager(monkeypatch):
    monkeypatch.setattr(mw, "_context", lambda db, a: "context")
    monkeypatch.setattr(mw, "_http_status", lambda url, timeout=8.0: "HTTP 200")
    db = DB({"core_manager_messages": [
        {"from_agent": "luka", "to_agent": "northsea", "kind": "directive", "body": "Hoe staat de desk?", "created_at": t(5)},
    ], "core_tasks": []})
    uit = mw.run(db, NU, chat=lambda m: ('{"antwoord": "De desk draait.", "taken": []}', "groq"))
    assert uit["beantwoord"] == [{"agent": "northseamgr", "model": "groq", "taken": 0}]
    van = [m["from_agent"] for m in db.data["core_manager_messages"] if m.get("to_agent") == "luka"]
    assert van == ["northseamgr"]                      # één status, één stem
    assert mw.run(db, NU, chat=lambda m: ("{}", "groq"))["beantwoord"] == []   # niet nog eens


def test_taken_van_northsea_en_northseamgr_zijn_een_stroom(monkeypatch):
    import acceptatie
    monkeypatch.setattr(acceptatie, "maak", lambda db, opdracht: None)
    monkeypatch.setattr(acceptatie, "doel_tekst", lambda acc: "")
    # Een oude taak die nog op de DAX-botnaam staat, met zijn oude idem/vinger.
    import manager_betrouwbaar as mb
    opdracht = "Zoek drie kopers voor EN590 in Rotterdam"
    oud = {"id": "oud-1", "requested_by": "northsea", "status": "running", "created_at": t(30),
           "metadata": {"manager": True, "idem": mb.idem_sleutel("northsea", "m1", opdracht),
                        "vinger": mb.vingerafdruk("northsea", opdracht)}}
    db = DB({"core_tasks": [oud], "core_manager_messages": []})
    # Dezelfde opdracht via de oude naam én via de manager: geen tweede taak naast de lopende.
    assert mw.maak_taak(db, "northsea", opdracht, NU, "m1") is None
    assert mw.maak_taak(db, "northseamgr", opdracht, NU, "m1") is None
    assert len(db.data["core_tasks"]) == 1
    # Een nieuwe opdracht via de oude naam komt op naam van de manager.
    nieuw = mw.maak_taak(db, "northsea", "Controleer de bounce-lijst van vandaag", NU, "m2")
    assert nieuw["requested_by"] == nieuw["assignee"] == "northseamgr"
    assert nieuw["metadata"]["agent"] == "northseamgr"
    assert nieuw["metadata"]["idem"].startswith("northseamgr:") and nieuw["metadata"]["vinger"].startswith("northseamgr:")
    # De daglimiet en "heeft open taak" tellen beide namen.
    assert mw._taken_vandaag(db, "northseamgr", NU) == 2
    assert mw._heeft_open_taak(db, "northseamgr")


def test_klaar_taak_onder_oude_naam_wordt_door_de_manager_gemeld():
    db = DB({"core_tasks": [
        {"id": "x", "title": "NorthSea DAX-bot: kopers", "status": "completed", "requested_by": "northsea",
         "completed_at": NU.isoformat(), "result": {"summary": "Drie kopers gevonden"}, "metadata": {"manager": True}},
    ], "core_manager_messages": []})
    assert mw.meld_klaar(db, NU) == 1
    melding = db.data["core_manager_messages"][0]
    assert melding["from_agent"] == "northseamgr" and "Drie kopers" in melding["body"]


def test_gezondheid_toont_een_status_per_manager():
    db = DB({"core_tasks": [
        {"requested_by": "northsea", "status": "completed", "metadata": {}, "created_at": t(60)},
        {"requested_by": "northseamgr", "status": "running", "metadata": {}, "created_at": t(30)},
    ], "core_manager_messages": [], "core_schedules": []})
    g = mw.gezondheid(db, NU)
    per = g.get("managers") or g.get("per") or g
    assert "northsea" not in per
    assert per["northseamgr"]["taken_24u"] == 2


def test_overleg_met_oude_naam_gaat_naar_de_manager():
    assert mw.lees_overleg('{"antwoord": "x", "taken": [], "overleg": [{"met": "northsea", "vraag": "welke deals?"}]}',
                           "axemanager") == [("northseamgr", "welke deals?")]
    assert mw.lees_overleg('{"antwoord": "x", "taken": [], "overleg": [{"met": "northsea", "vraag": "?"}]}',
                           "northseamgr") == []           # nooit aan zichzelf
    assert mw.lees_overleg('{"antwoord": "x", "taken": [], "overleg": [{"met": "browser", "vraag": "?"}]}',
                           "axemanager") == []            # browser is geen collega


def test_oude_naam_gebruikt_de_sleutels_van_zijn_manager():
    assert mw.sleutel_volgorde("northsea") == mw.sleutel_volgorde("northseamgr")
    assert mw.sleutel_volgorde("developer") == mw.sleutel_volgorde("projectsmgr")
    assert mw.NAAM["northsea"] == mw.NAAM["northseamgr"]
