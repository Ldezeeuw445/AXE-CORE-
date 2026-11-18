"""Eén managercontext (audit 19 nov): compact, per manager, nooit blokkerend."""
from datetime import datetime, timezone

import manager_context as mc

NU = datetime(2026, 11, 19, 10, 0, tzinfo=timezone.utc)


def test_namen_horen_bij_hun_manager():
    assert mc.groep_van("northseamgr")[0] == "northsea"
    assert mc.groep_van("axe-core")[0] == "axe"
    assert "tradingos" in mc.groep_van("trading")[1]
    assert mc.groep_van("thinktank") == ("thinktank", ("thinktank",))
    assert mc.groep_van(None) == ("", ())


def test_context_is_kort_en_bevat_wat_telt():
    tekst = mc.bouw_context(
        "northsea",
        taken=[{"title": "Vervolgmail Rotterdam", "status": "running", "created_at": "2026-11-19T09:30:00+00:00"}],
        mislukt=[{"title": "claude_code.run", "error": {"message": "needs a prompt"}}],
        eigen=[{"body": "Ik heb 3 deals bijgewerkt", "created_at": "2026-11-19T08:00:00+00:00"}],
        wacht=[{"title": "Mail aan Shell"}],
        nu=NU,
    )
    assert "Vervolgmail Rotterdam · running · 30 min" in tekst
    assert "Wacht op Luka (1)" in tekst and "needs a prompt" in tekst
    assert "2 u geleden: Ik heb 3 deals bijgewerkt" in tekst
    assert "Eerst Luka's ja" in tekst
    assert len(tekst) <= 2500


def test_niets_open_zegt_dat_ook():
    assert "Jouw open taken: geen." in mc.bouw_context("axe", [], [], [], [], NU)


def test_leesfout_blokkeert_nooit():
    class Kapot:
        def table(self, *_):
            raise RuntimeError("database weg")
    tekst = mc.lees_context(Kapot(), "northseamgr", NU)
    assert tekst.startswith("Jouw wereld nu (northsea)") and "geen" in tekst
