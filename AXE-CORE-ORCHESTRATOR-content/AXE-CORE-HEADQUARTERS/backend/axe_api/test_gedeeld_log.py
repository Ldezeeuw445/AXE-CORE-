"""Eén log en één stappenlijst voor elke AI (18 nov)."""
import pytest

import gedeeld_log as gl


def test_logregel_en_context():
    r = gl.log_rij("claude-code", "  notch-fix   gepusht ")
    assert r == {"from_agent": "claude-code", "to_agent": "log", "kind": "report", "body": "notch-fix gepusht"}
    with pytest.raises(ValueError):
        gl.log_rij("x", "   ")
    ctx = gl.context_tekst([{"wie": "northseamgr", "tekst": "29 mails verstuurd", "wanneer": "2026-11-18T19:00:00"}])
    assert "northseamgr: 29 mails verstuurd" in ctx and ctx.startswith("Gedeeld log")


def test_wiens_beurt():
    s = gl.verdeel_stappen([
        {"id": "a", "title": "Login vernieuwen", "status": "waiting_approval", "assignee": "companionmgr"},
        {"id": "b", "title": "Build axon", "status": "queued", "assignee": "dax"},
        {"id": "c", "title": "Klaar", "status": "completed"},
    ])
    assert [x["id"] for x in s["jouw_beurt"]] == ["a"] and [x["id"] for x in s["ai_beurt"]] == ["b"]


def test_taak_regel():
    wie, wat = gl.taak_regel({"title": "Site watch", "assignee": "browser"}, {"summary": "3 sites ok"})
    assert (wie, wat) == ("browser", "Site watch: 3 sites ok")


def test_les_als_geheugen():
    r = gl.les_rij("luka", "Geen ID's in berichten aan Luka.", "een id zegt hem niets", "toon het onderwerp", "2026-11-18")
    assert r["to_agent"] == "lessen" and r["body"].startswith("# Geen ID's in berichten aan Luka.")
    assert "Datum: 2026-11-18." in r["body"] and "Waarom: een id zegt hem niets" in r["body"]
    assert gl.lessen_tekst([r]).startswith("Lessen van Luka")
    assert gl.is_correctie("voortaan eerst in gewone taal") and not gl.is_correctie("wat wacht er?")


def test_les_heeft_een_soort_die_de_database_toestaat():
    """core_manager_messages_kind_check: alleen directive/report/ask. Met "les"
    werd elke les geweigerd (20 nov: 0 lessen in het log)."""
    import gedeeld_log as gl
    assert gl.les_rij("luka", "Nooit [x] zonder bewijs")["kind"] in ("directive", "report", "ask")
    assert gl.log_rij("axe", "iets")["kind"] in ("directive", "report", "ask")
