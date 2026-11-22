"""'Doe de rij' (rij.py): wat erin mag, en dat hij één voor één gaat."""
from __future__ import annotations

from typing import Any

import rij


def taak(i: int, **kw: Any) -> dict[str, Any]:
    t = {"id": f"t{i}", "title": f"Stap {i}", "goal": "", "status": "pending", "capability": "agentic",
         "assignee": "code-agent", "metadata": {}, "revision": 0, "created_at": f"2026-11-{10 + i:02d}"}
    t.update(kw)
    return t


class Q:
    def __init__(self, db: "DB"):
        self.db, self.f, self.upd = db, [], None

    def select(self, *_a): return self
    def order(self, *_a, **_k): return self
    def limit(self, *_a): return self
    def eq(self, k, v): self.f.append((k, lambda x, v=v: x == v)); return self
    def in_(self, k, vs): self.f.append((k, lambda x, vs=vs: x in vs)); return self
    def update(self, velden): self.upd = velden; return self

    def _match(self, t): return all(fn(t.get(k)) for k, fn in self.f)

    def execute(self):
        rijen = [t for t in self.db.taken if self._match(t)]
        if self.upd is not None:
            for t in rijen:
                t.update(self.upd)
        return type("R", (), {"data": [dict(t) for t in rijen]})()


class DB:
    def __init__(self, taken): self.taken, self.log = taken, []
    def table(self, naam): return Q(self) if naam == "core_tasks" else Log(self)


class Log:
    def __init__(self, db): self.db = db
    def insert(self, rij): self.db.log.append(rij); return self
    def execute(self): return type("R", (), {"data": [{}]})()


def test_wat_nooit_in_de_rij_komt():
    assert rij.waarom_niet(taak(1)) is None
    assert rij.waarom_niet(taak(1, assignee="luka")) == "van Luka"
    assert rij.waarom_niet(taak(1, capability="trading")) == "trading/NorthSea"
    assert rij.waarom_niet(taak(1, title="Continue: Yes needed: DEAL-001")) is not None
    assert rij.waarom_niet(taak(1, title="Verwijder oude backups")) is not None
    assert rij.waarom_niet(taak(1, status="queued")) == "niet open"


def test_een_stap_krijgt_een_handler():
    assert rij.start_velden(taak(1, capability="stap"))["capability"] == "agentic"
    assert "capability" not in rij.start_velden(taak(1, capability="code"))


def test_een_voor_een():
    db = DB([taak(2), taak(1), taak(3, assignee="luka"), taak(4, capability="trading")])
    uit = rij.begin(db)
    assert uit["toegevoegd"] == 2
    assert uit["stand"] == "gestart" and uit["taak"] == "Stap 1"
    statussen = {t["id"]: t["status"] for t in db.taken}
    assert statussen == {"t1": "queued", "t2": "pending", "t3": "pending", "t4": "pending"}

    # Stap 1 draait nog: niets nieuws.
    assert rij.tik(db)["stand"] == "bezig"
    # Stap 1 klaar: de volgende.
    db.taken[1]["status"] = "completed"
    assert rij.tik(db)["taak"] == "Stap 2"
    db.taken[0]["status"] = "completed"
    assert rij.tik(db)["stand"] == "leeg"
    assert any("ik pak op" in str(r) for r in db.log)


def test_stop_haalt_open_stappen_terug():
    db = DB([taak(1), taak(2)])
    rij.begin(db)
    assert rij.stop(db)["gestopt"] == 1
    assert "rij" not in db.taken[1]["metadata"]
    assert rij.stand(db)["open"] == 0


def test_dubbel_beginnen_nummert_niet_opnieuw():
    db = DB([taak(1), taak(2)])
    rij.begin(db)
    assert rij.begin(db)["toegevoegd"] == 0
