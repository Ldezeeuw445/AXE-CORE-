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
