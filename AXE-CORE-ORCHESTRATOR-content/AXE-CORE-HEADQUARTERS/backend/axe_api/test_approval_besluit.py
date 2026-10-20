"""Een besluit op een approval: twee keer tikken is geen fout (19 okt: 200, dan 404)."""
import pytest

from task_runtime import TaskRepository

TAAK = "6f1a6e1a-0000-4000-8000-0000000000a1"
OK = "7a2b7f2b-0000-4000-8000-0000000000b1"


class _Tabel:
    def __init__(self, naam, db):
        self.naam, self.db = naam, db
        self.actie, self.filters, self.rij = "select", [], None

    def select(self, *_a):
        self.actie = "select"
        return self

    def insert(self, rij):
        self.actie, self.rij = "insert", dict(rij)
        return self

    def update(self, velden):
        self.actie, self.rij = "update", dict(velden)
        return self

    def eq(self, k, v):
        self.filters.append((k, v))
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def execute(self):
        rijen = self.db.setdefault(self.naam, [])
        if self.actie == "insert":
            rijen.append(self.rij)
            return type("R", (), {"data": [self.rij]})()
        uit = [r for r in rijen if all(str(r.get(k)) == str(v) for k, v in self.filters)]
        if self.actie == "update":
            for r in uit:
                r.update(self.rij)
        return type("R", (), {"data": [dict(r) for r in uit]})()


class _Db:
    def __init__(self):
        self.rijen = {
            "core_tasks": [{"id": TAAK, "status": "waiting_approval", "metadata": {}}],
            "core_approvals": [{"id": OK, "task_id": TAAK, "status": "pending", "revision": 0}],
            "core_task_events": [],
        }

    def table(self, naam):
        return _Tabel(naam, self.rijen)


def repo():
    db = _Db()
    return TaskRepository(lambda: db), db


def test_eerste_besluit_zet_approval_en_taak():
    r, db = repo()
    uit = r.decide_approval(TAAK, OK, True, "luka", "ok")
    assert uit["status"] == "approved" and "already_decided" not in uit
    assert db.rijen["core_tasks"][0]["status"] == "queued"


def test_hetzelfde_besluit_nog_eens_is_geen_fout_en_doet_niets():
    r, db = repo()
    r.decide_approval(TAAK, OK, True, "luka", "ok")
    gebeurtenissen = len(db.rijen["core_task_events"])
    db.rijen["core_tasks"][0]["status"] = "running"
    tweede = r.decide_approval(TAAK, OK, True, "luka", "ok")
    assert tweede["already_decided"] is True and tweede["status"] == "approved"
    # Geen tweede event, geen taak die terug naar queued springt.
    assert len(db.rijen["core_task_events"]) == gebeurtenissen
    assert db.rijen["core_tasks"][0]["status"] == "running"
    assert db.rijen["core_approvals"][0]["revision"] == 1


def test_een_ander_besluit_na_het_eerste_is_een_conflict():
    r, _ = repo()
    r.decide_approval(TAAK, OK, True, "luka", "ok")
    with pytest.raises(RuntimeError, match="already approved"):
        r.decide_approval(TAAK, OK, False, "luka", "nee")


def test_een_onbekende_approval_blijft_niet_gevonden():
    r, _ = repo()
    with pytest.raises(KeyError):
        r.decide_approval(TAAK, "00000000-0000-4000-8000-000000000000", True, "luka", None)
