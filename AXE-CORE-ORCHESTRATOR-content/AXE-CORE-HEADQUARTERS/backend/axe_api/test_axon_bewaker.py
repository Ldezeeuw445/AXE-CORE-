"""AXON Memory Manager: met het echte geheugen van 8 november als voorbeeld.

Die dag zette de Obsidian-sync tussen 00:18 en 03:18 118 notities opnieuw in
rag_memories; de daglimiet van 120 was op en er kwamen nog 2 echte lessen bij.
De manager zei "memory seen 50, rag 20".
"""
from datetime import datetime, timezone

import axon_bewaker as ab
import grok_managers as gm
from test_projecten_bewaker import FakeDb, _Query

NU = datetime(2026, 11, 8, 12, 5, tzinfo=timezone.utc)


def notitie(i):
    return {"id": f"n{i}", "category": "system", "created_at": "2026-11-08T01:00:00+00:00",
            "metadata": {"source": "obsidian", "path": f"Trading/X{i % 37}-scorecard.md"}}


def les(i):
    return {"id": f"l{i}", "category": "agent", "created_at": "2026-11-08T02:12:00+00:00", "metadata": {}}


RAG_8NOV = [notitie(i) for i in range(118)] + [les(i) for i in range(2)]
MEMORY_8NOV = [{"id": f"m{i}", "agent": "global", "key": f"fact:{i}", "content": "Luka wil Nederlands.",
                "created_at": "2026-11-08T09:00:00+00:00"} for i in range(8)]


def codes(b):
    return [x.code for x in b]


def test_limiet_vol_door_notities_bereikt_luka_met_vaste_titel():
    b = ab.beoordeel(RAG_8NOV, MEMORY_8NOV, 13)
    assert codes(b) == ["limiet_vol_door_notities"] and b[0].voor == "luka"
    assert b[0].titel == "Geheugenlimiet vol door de notitiesync"
    assert "118 van de 120" in b[0].detail


def test_limiet_vol_door_echte_lessen_is_alleen_info():
    b = ab.beoordeel([les(i) for i in range(120)], [], 13)
    assert codes(b) == ["limiet_vol"] and b[0].voor == "info"


def test_ruis_langs_het_hek_bereikt_luka():
    ruis = [{"id": "r1", "agent": "trading", "key": "agent_run:trading:1731000000", "content": "ok"},
            {"id": "r2", "agent": "trading", "key": "x", "content": "HOLD score=0.4"}]
    b = ab.beoordeel([], MEMORY_8NOV + ruis, 9)
    assert codes(b) == ["ruis_in_geheugen"]
    assert ab.tel([], MEMORY_8NOV + ruis)["lessen"] == 8


def test_niets_geleerd_pas_na_de_middag():
    assert ab.beoordeel([notitie(1)], [], 9) == []
    assert codes(ab.beoordeel([notitie(1)], [], 13)) == ["niets_geleerd"]


class _GteQuery(_Query):
    def gte(self, k, v):
        self.na = (k, v)
        return self

    def execute(self):
        uit = super().execute()
        if self.op == "select" and getattr(self, "na", None):
            k, v = self.na
            uit.data = [r for r in uit.data if str(r.get(k) or "") >= v]
        return uit


class _Db(FakeDb):
    def table(self, name):
        return _GteQuery(self.db, name)


def test_pulse_meldt_luka_eenmaal_en_leest_alleen_vandaag():
    db = _Db()
    db.db["rag_memories"] = RAG_8NOV + [dict(notitie(999), created_at="2026-11-07T01:00:00+00:00")]
    db.db["memory"] = list(MEMORY_8NOV)
    uit = gm.run_axon(db, NU)
    assert uit["rag"] == 120 and uit["notities"] == 118 and uit["lessen"] == 10
    assert uit["voor_luka"] == ["limiet_vol_door_notities"]
    assert "Geheugenlimiet vol door de notitiesync" in [r.get("title") for r in db.rows("core_approvals")]
    gm.run_axon(db, NU)
    assert [r.get("title") for r in db.rows("core_approvals")].count("Geheugenlimiet vol door de notitiesync") == 1
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "axon" and r["to_agent"] != "luka"]
    assert len(rapporten) == 1 and "10 lessen, 118 notities" in rapporten[0]["body"]
