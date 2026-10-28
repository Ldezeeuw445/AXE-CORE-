"""Android-poller mag core_notifications niet meer met de anon-sleutel lezen."""
from __future__ import annotations

from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import device_notify

TOKEN = "axe_dev_" + "ab" * 32
HASH = device_notify.token_hash(TOKEN)


class NepQuery:
    def __init__(self, db, naam):
        self.db = db
        self.naam = naam
        self._eq = {}
        self._gte = {}

    def select(self, *_a, **_k):
        return self

    def eq(self, kolom, waarde):
        self._eq[kolom] = waarde
        return self

    def gte(self, kolom, waarde):
        self._gte[kolom] = waarde
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, *_a, **_k):
        return self

    def update(self, velden):
        self.db.updates.append((self.naam, velden, dict(self._eq)))
        return self

    def execute(self):
        if self.naam == "core_axe_devices" and "device_token_hash" in self._eq:
            if self._eq["device_token_hash"] == HASH:
                return SimpleNamespace(data=[{"device_id": "samsung-a17", "device_token_hash": HASH}])
            return SimpleNamespace(data=[])
        if self.naam == "core_notifications":
            return SimpleNamespace(data=self.db.meldingen)
        return SimpleNamespace(data=[])


class NepDB:
    def __init__(self, meldingen=None):
        self.meldingen = meldingen or []
        self.updates = []

    def table(self, naam):
        return NepQuery(self, naam)


def app_met(db: NepDB) -> TestClient:
    api = FastAPI()
    api.include_router(device_notify.maak_router(lambda: db))
    return TestClient(api)


def test_zonder_token_is_401():
    r = app_met(NepDB()).get("/device/notifications")
    assert r.status_code == 401


def test_verkeerde_token_is_401():
    r = app_met(NepDB()).get(
        "/device/notifications",
        headers={"Authorization": "Bearer axe_dev_fout"},
    )
    assert r.status_code == 401


def test_api_sleutel_vorm_is_geen_device_token():
    r = app_met(NepDB()).get(
        "/device/notifications",
        headers={"Authorization": "Bearer test-sleutel"},
    )
    assert r.status_code == 401


def test_geldig_token_leest_ongelezen_meldingen():
    db = NepDB(meldingen=[{"id": "n1", "type": "info", "message": "Done: x", "read": False, "created_at": "t"}])
    r = app_met(db).get(
        "/device/notifications",
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["device_id"] == "samsung-a17"
    assert body["notifications"][0]["id"] == "n1"
    assert any(u[0] == "core_axe_devices" for u in db.updates)
