"""Projects Manager: met de echte takenlijst van 8 november als voorbeeld.

Die dag zei hij elk kwartier "31 open rows", terwijl een DAX-taak drie dagen
in de wachtrij stond en hetzelfde voorstel zeven keer open lag.
"""
from datetime import datetime, timezone

import grok_managers as gm
import projecten_bewaker as pb
from test_northsea_bewaker import FakeDb as _Db, _Query as _Q

NU = datetime(2026, 11, 8, 10, 0, tzinfo=timezone.utc)


class _Query(_Q):
    """Plus in_, en order/insert zoals de echte database: met created_at."""

    teller = 0

    def insert(self, body):
        _Query.teller += 1
        return super().insert({"created_at": f"2026-11-08T10:00:{_Query.teller:05d}", **body})

    def order(self, k, desc=False):
        self.volgorde = (k, desc)
        return self

    def in_(self, k, waarden):
        self.binnen = (k, set(waarden))
        return self

    def execute(self):
        uit = super().execute()
        if self.op == "select" and getattr(self, "binnen", None):
            k, w = self.binnen
            uit.data = [r for r in uit.data if r.get(k) in w]
        if self.op == "select" and getattr(self, "volgorde", None):
            k, desc = self.volgorde
            rijen = sorted((r for r in self.db.get(self.table, []) if all(r.get(f) == v for f, v in self.filters.items())),
                           key=lambda r: str(r.get(k) or ""), reverse=desc)
            uit.data = rijen[: getattr(self, "limit_n", len(rijen))]
        return uit


class FakeDb(_Db):
    def table(self, name):
        return _Query(self.db, name)


def taak(tid, status, titel, dag, assignee="code-agent", uur=9):
    return {"id": tid, "status": status, "title": titel, "assignee": assignee,
            "updated_at": f"2026-{dag}T{uur:02d}:00:00+00:00", "metadata": {}}


TAKEN_8NOV = [
    taak("q1", "queued", "DAX build: next task in axon-memory", "11-05T16", "developer", 39),
    taak("p1", "pending", "PWA‑manifest‑scope corrigeren in axe‑companion", "09-16"),
    taak("p2", "pending", "PWA-manifest-scope corrigeren in axe-companion", "09-18"),
    taak("p3", "pending", "PWA‑manifest‑scope corrigeren in axe-companion", "09-16"),
    taak("p4", "pending", "Fix: NorthSea Deal & Operations Crews", "11-07", "axe-core"),
    taak("w1", "waiting_approval", "NorthSea: er komt geen mail meer binnen", "11-06", "northseamgr"),
    taak("c1", "completed", "PWA-manifest-scope corrigeren in axe-companion", "11-01"),
]


def _fix(rijen):
    # "11-05T16" + uur 39 is geen geldige tijd; maak er echte tijden van.
    for r in rijen:
        if "T16T" in r["updated_at"]:
            r["updated_at"] = "2026-11-05T16:39:00+00:00"
    return rijen


def codes(b):
    return [x.code for x in b]


def test_vastgelopen_wachtrij_bereikt_luka():
    b = pb.beoordeel(_fix([dict(t) for t in TAKEN_8NOV]), NU)
    assert codes(b)[0] == "wachtrij_vast" and b[0].voor == "luka"
    assert "DAX build" in b[0].detail and "2 dagen" in b[0].detail
    assert b[0].titel == "Taken staan vast in de wachtrij"  # vast: geen tweede kaart bij een nieuwe telling


def test_dubbels_herkend_los_van_streepjes_en_de_nieuwste_blijft():
    weg = pb.dubbele_voorstellen(_fix([dict(t) for t in TAKEN_8NOV]))
    assert {r["id"] for r in weg} == {"p1", "p3"}  # p2 (18 sep) is de nieuwste en blijft


def test_alleen_pending_wordt_ooit_aangewezen():
    rijen = [taak("a", "queued", "Zelfde", "11-08"), taak("b", "queued", "Zelfde", "11-07"),
             taak("c", "waiting_approval", "Zelfde", "11-06"), taak("d", "running", "Zelfde", "11-08")]
    assert pb.dubbele_voorstellen(rijen) == []


def test_verse_wachtrij_is_geen_storing():
    rijen = [taak("q", "queued", "Net gestart", "11-08", uur=9)]
    assert "wachtrij_vast" not in codes(pb.beoordeel(rijen, NU))


def test_pulse_ruimt_op_vraagt_luka_en_zwijgt_als_er_niets_verandert():
    db = FakeDb()
    db.db["core_tasks"] = _fix([dict(t) for t in TAKEN_8NOV])
    uit = gm.run_projectsmgr(db, NU)
    assert uit["opgeruimd"] == 2 and uit["voor_luka"] == ["wachtrij_vast"]
    status = {r["id"]: r["status"] for r in db.rows("core_tasks")}
    assert status["p1"] == status["p3"] == "cancelled"
    assert status["p2"] == "pending" and status["c1"] == "completed" and status["q1"] == "queued"
    assert db.rows("core_tasks")[1]["metadata"]["reden"] == "dubbel voorstel"
    assert "Taken staan vast in de wachtrij" in [r.get("title") for r in db.rows("core_approvals")]
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] != "luka"]
    assert len(rapporten) == 1 and "2 dubbele voorstellen opgeruimd" in rapporten[0]["body"]

    # Tweede pulse: niets nieuws opgeruimd, maar de stand verschilt (geen
    # "opgeruimd" meer) -> één rapport. Derde pulse: zelfde stand -> stil.
    gm.run_projectsmgr(db, NU)
    gm.run_projectsmgr(db, NU)
    rapporten = [r for r in db.rows("core_manager_messages") if r["from_agent"] == "projectsmgr" and r["to_agent"] != "luka"]
    assert len(rapporten) == 2
    assert [r.get("title") for r in db.rows("core_approvals")].count("Taken staan vast in de wachtrij") == 1


def test_lege_lijst_zegt_dat_niets_stilstaat():
    db = FakeDb()
    uit = gm.run_projectsmgr(db, NU)
    assert uit["bevindingen"] == [] and uit["opgeruimd"] == 0
    assert "niets staat stil" in db.rows("core_manager_messages")[0]["body"]
