"""NorthSea Manager: opruimen + voorstellen, en 'ok V1' in de chat."""
from __future__ import annotations

from datetime import datetime, timezone

import northsea_opruimen as no
from test_manager_draad import _Db

NU = datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)

PLAN = {"automatic": [], "proposals": [
    {"code": "V1", "title": "Sluit 8 ingekomen mails ouder dan 30 dagen", "why": "Het gesprek is koud.", "count": 8,
     "items": [{"label": "We don't accept bank instruments only T/T"}]},
    {"code": "V3", "title": "Stop 2 onderzoek(en) dat op budget vastliep", "why": "Al weken stil.", "count": 2, "items": []},
]}


class _Nep:
    def __init__(self):
        self.calls: list[dict] = []

    async def __call__(self, actie, params):
        assert actie == "tidy_desk"
        self.calls.append(params)
        if params["dry_run"]:
            return PLAN
        if params["apply"] == ["auto"]:
            return {"applied": [{"label": "Yes needed: DEAL-002 — Copper Cathode"}] * 5, **PLAN}
        return {"applied": [{"label": "x"}] * 8, "skipped": [], **PLAN}


def test_codes_uit_luka_zijn_woorden():
    assert no.codes_uit("ok V1") == ["V1"]
    assert no.codes_uit("Oké v1 en v3 graag") == ["V1", "V3"]
    assert no.codes_uit("ja, doe alles maar") == ["ALLES"]
    assert no.codes_uit("waarom V1?") == []
    assert no.codes_uit("hoe staat DEAL-002") == []


def test_dagelijks_ruimt_op_en_legt_voor_een_keer(tmp_path, monkeypatch):
    monkeypatch.setattr(no, "_MARKER", str(tmp_path / "m.json"))
    db, nep = _Db(), _Nep()
    uit = no.dagelijks(db, NU, nep)
    assert uit["opgeruimd"] == 5 and uit["voorstellen"] == ["V1", "V3"]
    tekst = [r for r in db.rijen if r["to_agent"] == "luka"][0]["body"]
    assert tekst.startswith("Opgeruimd (5):") and "V1: Sluit 8" in tekst and "ok V1" in tekst
    assert "DEAL-002 blijven bij jou" in tekst
    assert nep.calls[0]["apply"] == ["auto"] and nep.calls[0]["dry_run"] is False
    assert no.dagelijks(db, NU, nep) == {"overgeslagen": "vandaag al gedaan"}


def test_ok_v1_voert_alleen_v1_uit_en_zegt_het():
    db, nep = _Db(), _Nep()
    uit = no.voer_uit(db, ["V1"], nep)
    assert uit["uitgevoerd"] == ["V1"]
    assert nep.calls[-1] == {**nep.calls[-1], "dry_run": False, "apply": ["V1"]}
    assert "Gedaan: V1. 8 weggezet" in [r for r in db.rijen if r["to_agent"] == "luka"][0]["body"]


def test_onbekend_voorstel_zegt_wat_er_wel_is():
    db, nep = _Db(), _Nep()
    uit = no.voer_uit(db, ["V7"], nep)
    assert uit["uitgevoerd"] == [] and "V1, V3" in uit["tekst"]
    assert all(c["dry_run"] for c in nep.calls)  # niets uitgevoerd


def test_zonder_schrijfrecht_een_keer_per_dag(tmp_path, monkeypatch):
    monkeypatch.setattr(no, "_MARKER", str(tmp_path / "m.json"))

    async def geen_recht(actie, params):
        raise RuntimeError("Error executing tool northsea_tidy_desk: insufficient_scope: northsea.deal.write")
    import pytest
    with pytest.raises(RuntimeError):
        no.dagelijks(_Db(), NU, geen_recht)
    assert no.dagelijks(_Db(), NU, geen_recht) == {"overgeslagen": "vandaag al gedaan"}
