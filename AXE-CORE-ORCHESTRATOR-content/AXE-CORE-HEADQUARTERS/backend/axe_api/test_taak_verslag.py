"""Punt 4: na elke taak een verslag in het gedeelde log, gelukt of mislukt."""
import taak_verslag as tv

TAAK = {"id": "t1", "title": "Alerts-tab afmaken", "assignee": "developer",
        "metadata": {"chat_manager": "companionmgr"}}


def test_gelukt_met_oplevering():
    result = {"summary": "Alerts-tab toont live meldingen",
              "oplevering": {"tests": "vitest src/alerts -> 12 passed", "branch": "axe/20261119-abc",
                             "risicos": "niet op de telefoon getest", "compleet": True}}
    v = tv.verslag(TAAK, "completed", result)
    assert v == {"gedaan": "Alerts-tab toont live meldingen", "werkte": "tests: vitest src/alerts -> 12 passed",
                 "faalde": "", "besluit": "branch axe/20261119-abc", "volgende": "niet op de telefoon getest"}
    tekst = tv.als_tekst(TAAK, "completed", v)
    assert tekst.startswith("Taakverslag ✓ Alerts-tab afmaken | gedaan: Alerts-tab toont")
    assert "faalde" not in tekst and len(tekst) <= tv.MAX


def test_mislukt_zegt_wat_faalde_en_wat_nu():
    v = tv.verslag(TAAK, "failed", error={"code": "handler_error", "message": "tests rood: 3 failed"})
    assert v["faalde"] == "tests rood: 3 failed" and v["volgende"].startswith("opnieuw proberen")
    assert tv.als_tekst(TAAK, "failed", v).startswith("Taakverslag ✗ Alerts-tab afmaken")


def test_onvolledige_oplevering_is_geen_succes_in_het_verslag():
    v = tv.verslag(TAAK, "completed", {"oplevering": {"compleet": False, "ontbreekt": ["Tests"]}})
    assert v["faalde"] == "niet compleet: Tests"


def test_schrijft_in_het_gedeelde_log_onder_de_manager_van_het_gesprek():
    rijen = []

    class DB:
        def table(self, _):
            return self

        def insert(self, rij):
            rijen.append(rij)
            return self

        def execute(self):
            return self

    assert tv.schrijf(DB(), TAAK, "completed", {"summary": "klaar"})
    assert rijen[0]["from_agent"] == "companionmgr" and rijen[0]["to_agent"] == "log"
    assert rijen[0]["body"].startswith("Taakverslag ✓")


def test_een_kapotte_database_breekt_niets():
    class Kapot:
        def table(self, _):
            raise RuntimeError("weg")

    assert tv.schrijf(Kapot(), TAAK, "failed") is False


def test_elke_taak_sluit_een_episode_onder_zijn_eigen_agent():
    """Leerlus voor alle agents (punt 7): verslag + episode, ook voor managers."""
    import taak_verslag as tv

    class Q:
        def __init__(self, db, t): self.db, self.t = db, t
        def insert(self, r): self.db.rijen.append((self.t, r)); return self
        def execute(self): return type("R", (), {"data": []})()

    class DB:
        def __init__(self): self.rijen = []
        def table(self, t): return Q(self, t)

    db = DB()
    goed = {"id": "a", "title": "Deal checken", "assignee": "northseamgr", "metadata": {}}
    assert tv.schrijf(db, goed, "completed", {"summary": "ok", "verification": {"passed": True}})
    mis = {"id": "b", "title": "Bouwen", "payload": {"agent": "developer"}, "metadata": {}}
    assert tv.schrijf(db, mis, "failed", None, {"message": "kapot"})
    half = {"id": "c", "title": "Fix", "assignee": "projectsmgr", "metadata": {}}
    tv.schrijf(db, half, "completed", {"oplevering": {"compleet": False, "ontbreekt": ["tests"]}})
    vreemd = {"id": "d", "title": "x", "assignee": "spook", "metadata": {}}
    tv.schrijf(db, vreemd, "completed", {})
    eps = [r for t, r in db.rijen if t == "agent_learning_episodes"]
    assert [(e["agent"], e["verdict"]) for e in eps] == [
        ("northseamgr", "good"), ("code-editor", "poor"), ("projectsmgr", "poor"), ("task", "good")]
    assert all(e["closed_at"] and e["outcome_note"].startswith("Taakverslag") for e in eps)


def test_lus_namen_gelijk_aan_de_app():
    """Een naam die de app niet kent, telt niet mee in loop-health."""
    import re
    from pathlib import Path
    import taak_verslag as tv
    ts = (Path(__file__).resolve().parents[2] / "src/domain/memory/agentLoop.ts").read_text()
    blok = ts.split("export const LOOP_AGENTS = [", 1)[1].split("]", 1)[0]
    blok = "\n".join(r.split("//", 1)[0] for r in blok.splitlines())
    assert set(re.findall(r"'([a-z-]+)'", blok)) == set(tv.LOOP_AGENTS)
