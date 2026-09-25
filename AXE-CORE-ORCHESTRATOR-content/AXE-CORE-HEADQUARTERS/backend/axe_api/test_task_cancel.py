"""OS3 W2: de gebruiker kan een lopende taak stoppen.

Het hele punt van deze knop is dat hij werkt terwijl er iets draait -- dus
zonder de lease die de worker op een andere machine vasthoudt.
"""
import asyncio

import pytest

from task_runtime import TaskRepository


class NepDb:
    """Minimale Supabase-nabootsing: onthoudt elke select, update en insert.

    Chainable zoals de echte client: table().update().eq().in_().execute().
    """

    def __init__(self, taak=None, kinderen=None, vragen=None):
        self.taak = taak
        self.kinderen = list(kinderen or [])
        self.vragen = list(vragen or [])
        self.updates = []   # (tabel, wijzigingen, filters)
        self.inserts = []   # (tabel, rij)
        self._tabel = None
        self._op = "select"
        self._filters = {}
        self._payload = None

    # -- bouwers ---------------------------------------------------------
    def table(self, naam):
        self._tabel, self._op, self._filters, self._payload = naam, "select", {}, None
        return self

    def select(self, *_):
        self._op = "select"
        return self

    def update(self, wijzigingen):
        self._op, self._payload = "update", wijzigingen
        return self

    def insert(self, rij):
        self._op, self._payload = "insert", rij
        return self

    def eq(self, kolom, waarde):
        self._filters[kolom] = waarde
        return self

    def in_(self, kolom, waarden):
        self._filters[kolom] = list(waarden)
        return self

    def limit(self, *_):
        return self

    def order(self, *_, **__):
        return self

    # -- uitvoeren -------------------------------------------------------
    def execute(self):
        class Resultaat:
            pass

        r = Resultaat()
        r.data = self._data()
        return r

    def _data(self):
        tabel, filters, payload = self._tabel, dict(self._filters), self._payload
        if self._op == "insert":
            self.inserts.append((tabel, payload))
            return [{**payload, "id": "ev1", "sequence": 1}]
        if self._op == "select":
            if tabel == "core_tasks":
                return [self.taak] if self.taak else []
            return []
        # update
        self.updates.append((tabel, payload, filters))
        if tabel == "core_approvals":
            geraakt = [v for v in self.vragen if v["status"] == filters.get("status")]
            return [{**v, **payload} for v in geraakt]
        if "parent_task_id" in filters:
            toegestaan = filters.get("status") or []
            geraakt = [k for k in self.kinderen
                       if k["parent_task_id"] == filters["parent_task_id"]
                       and k["status"] in toegestaan]
            return [{**k, **payload} for k in geraakt]
        return [{**(self.taak or {}), **payload}]


TAAK_ID = "11111111-1111-4111-8111-111111111111"


def taak(status="running", **extra):
    return {
        "id": TAAK_ID, "status": status, "revision": 4,
        "worker_id": "vps-worker-1", "lease_token": "22222222-2222-4222-8222-222222222222",
        "lease_expires_at": "2026-09-25T10:00:00+00:00", **extra,
    }


def repo(db):
    return TaskRepository(lambda: db)


def wijziging(db, tabel, sleutel):
    """De eerste update op `tabel` die `sleutel` in zijn filters heeft."""
    for naam, payload, filters in db.updates:
        if naam == tabel and sleutel in filters:
            return payload, filters
    raise AssertionError(f"geen update op {tabel} met filter {sleutel}: {db.updates}")


def test_draaiende_taak_stopt_zonder_lease():
    db = NepDb(taak=taak("running"))
    uit = asyncio.run(repo(db).cancel(TAAK_ID, by="luka", reason="toch niet"))

    assert uit["status"] == "cancelled"
    payload, _ = wijziging(db, "core_tasks", "id")
    assert payload["status"] == "cancelled"
    assert payload["cancelled_at"]
    # de lease moet leeg: de worker mag hem niet blijven claimen
    assert payload["worker_id"] is None
    assert payload["lease_token"] is None
    assert payload["lease_expires_at"] is None
    assert payload["revision"] == 5


def test_annuleren_schrijft_een_gebruikersgebeurtenis():
    db = NepDb(taak=taak("in_progress"))
    asyncio.run(repo(db).cancel(TAAK_ID, by="luka", reason="verkeerde app"))

    tabel, rij = db.inserts[0]
    assert tabel == "core_task_events"
    assert rij["event_type"] == "task.cancelled"
    assert rij["actor_type"] == "user" and rij["actor_id"] == "luka"
    assert rij["data"]["reason"] == "verkeerde app"
    assert rij["data"]["from_status"] == "in_progress"


def test_al_voltooide_taak_geeft_valueerror():
    db = NepDb(taak=taak("completed"))
    with pytest.raises(ValueError):
        asyncio.run(repo(db).cancel(TAAK_ID))
    assert db.updates == []


def test_al_geannuleerde_taak_geeft_valueerror():
    db = NepDb(taak=taak("cancelled"))
    with pytest.raises(ValueError):
        asyncio.run(repo(db).cancel(TAAK_ID))


def test_onbekende_taak_geeft_lookuperror():
    db = NepDb(taak=None)
    with pytest.raises(LookupError):
        asyncio.run(repo(db).cancel(TAAK_ID))


def test_onmogelijke_id_geeft_lookuperror():
    db = NepDb(taak=taak())
    with pytest.raises(LookupError):
        asyncio.run(repo(db).cancel("geen-uuid"))


def test_wachtende_computer_use_kinderen_gaan_mee():
    kinderen = [
        {"id": "k1", "parent_task_id": TAAK_ID, "status": "pending", "capability": "computer_use"},
        {"id": "k2", "parent_task_id": TAAK_ID, "status": "queued", "capability": "computer_use"},
        {"id": "k3", "parent_task_id": TAAK_ID, "status": "running", "capability": "computer_use"},
    ]
    db = NepDb(taak=taak("running"), kinderen=kinderen)
    asyncio.run(repo(db).cancel(TAAK_ID, by="luka", reason="stop"))

    payload, filters = wijziging(db, "core_tasks", "parent_task_id")
    assert payload["status"] == "cancelled"
    assert filters["parent_task_id"] == TAAK_ID
    # alleen wat nog op een Mac ligt te wachten; een draaiend kind blijft
    assert sorted(filters["status"]) == ["pending", "queued"]

    _, rij = db.inserts[0]
    assert rij["data"]["cancelled_children"] == 2


def test_openstaande_vragen_vervallen():
    vragen = [
        {"id": "a1", "task_id": TAAK_ID, "status": "pending"},
        {"id": "a2", "task_id": TAAK_ID, "status": "approved"},
    ]
    db = NepDb(taak=taak("waiting_approval"), vragen=vragen)
    asyncio.run(repo(db).cancel(TAAK_ID, by="luka", reason="niet meer nodig"))

    payload, filters = wijziging(db, "core_approvals", "task_id")
    assert payload["status"] == "cancelled"
    assert payload["decided_by"] == "luka"
    assert payload["decision_reason"] == "niet meer nodig"
    assert payload["decided_at"]
    # alleen openstaande vragen; een al beantwoorde blijft zoals hij is
    assert filters["status"] == "pending"

    _, rij = db.inserts[0]
    assert rij["data"]["cancelled_approvals"] == 1
