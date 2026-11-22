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


# ── stap-nieuw / stap-af (22 nov) ─────────────────────────────────────────
def test_stap_taak_is_pending_en_wordt_niet_door_worker_opgepakt():
    t = gl.stap_taak("  Mail   support@ omzetten ", "jij", "claude-code", "Resend-route")
    assert t["status"] == "pending" and t["capability"] == "stap"
    assert t["assignee"] == "luka" and t["title"] == "Mail support@ omzetten"
    assert t["goal"] == "Resend-route" and t["requested_by"] == "claude-code"
    assert t["status"] in gl.OPEN


def test_stap_taak_voor_een_ai_en_zonder_titel():
    assert gl.stap_taak("Desk opruimen", "NorthSeaMgr", "codex")["assignee"] == "northseamgr"
    import pytest
    with pytest.raises(ValueError):
        gl.stap_taak("   ", "luka", "x")


def test_waarom_niet_af():
    assert gl.waarom_niet_af({"status": "pending", "capability": "stap"}) is None
    assert gl.waarom_niet_af({"status": "pending", "capability": "code"}) is None
    assert "al af" in gl.waarom_niet_af({"status": "completed", "capability": "stap"})
    assert "worker" in gl.waarom_niet_af({"status": "running", "capability": "code"})
    assert "cancelled" in gl.waarom_niet_af({"status": "cancelled", "capability": "stap"})


def test_af_velden():
    v = gl.af_velden("  klaar   en getest ", "cursor", "2026-11-22T12:00:00Z")
    assert v["status"] == "completed" and v["completed_at"] == "2026-11-22T12:00:00Z"
    assert v["result"] == {"summary": "klaar en getest", "door": "cursor"}
    assert gl.af_velden("", "x", "t")["result"]["summary"] == "afgerond"


def test_ritme_telt_per_dag_oudste_eerst():
    r = gl.ritme(["2026-11-22T10:00:00Z", "2026-11-22T11:00:00Z", "2026-11-20T09:00:00+00:00", "2026-10-01T00:00:00Z", None],
                 "2026-11-22", dagen=7)
    assert [d["dag"] for d in r][0] == "2026-11-16" and r[-1] == {"dag": "2026-11-22", "aantal": 2}
    assert len(r) == 7 and sum(d["aantal"] for d in r) == 3


def test_verdeel_stappen_met_samen_en_waarom():
    s = gl.verdeel_stappen([
        {"id": "a", "title": "Mail", "goal": "Resend-route", "status": "pending", "assignee": "luka", "capability": "stap"},
        {"id": "b", "title": "Desk", "goal": "Desk", "status": "queued", "assignee": "northseamgr"},
        {"id": "c", "title": "Plan", "status": "pending", "assignee": "samen", "capability": "stap"},
    ])
    assert [x["id"] for x in s["samen"]] == ["c"]
    assert s["jouw_beurt"][0]["waarom"] == "Resend-route" and s["jouw_beurt"][0]["is_stap"] is True
    assert s["ai_beurt"][0]["waarom"] == ""
    assert gl.stap_taak("Plan", "together", "x")["assignee"] == "samen"
