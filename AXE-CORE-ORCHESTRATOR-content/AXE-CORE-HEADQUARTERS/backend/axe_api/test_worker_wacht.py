"""G1: een stille Mac-worker geeft één melding op Home en telefoon."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import worker_wacht

NU = datetime(2026, 11, 1, 15, 0, tzinfo=timezone.utc)


class _Res:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.filters, self.rij = db, tabel, [], None

    def select(self, *_a):
        return self

    def eq(self, k, v):
        self.filters.append(lambda r: r.get(k) == v)
        return self

    def like(self, k, patroon):
        voor = patroon.rstrip("%")
        self.filters.append(lambda r: str(r.get(k, "")).startswith(voor))
        return self

    def gt(self, k, v):
        self.filters.append(lambda r: str(r.get(k, "")) > v)
        return self

    def limit(self, _n):
        return self

    def insert(self, rij):
        self.rij = rij
        return self

    def execute(self):
        rijen = self.db.tabellen.setdefault(self.tabel, [])
        if self.rij is not None:
            rijen.append({**self.rij, "read": False, "created_at": NU.isoformat()})
            return _Res([self.rij])
        return _Res([r for r in rijen if all(f(r) for f in self.filters)])


class NepDB:
    def __init__(self, workers):
        self.tabellen = {"core_computer_workers": workers, "core_notifications": []}

    def table(self, t):
        return _Q(self, t)


def w(host, sec_geleden):
    return {"device_id": host.lower(), "host": host, "heartbeat_at": (NU - timedelta(seconds=sec_geleden)).isoformat()}


def test_alleen_stil_tussen_drempel_en_week():
    rijen = [w("Live", 20), w("Grens", 180), w("MacMini", 600), w("OudeiMac", 8 * 86400), {"device_id": "x"}]
    assert [r["host"] for r in worker_wacht.stille_workers(rijen, NU)] == ["MacMini"]


def test_ronde_meldt_een_keer_per_machine():
    db = NepDB([w("MacMini", 600), w("Live", 10)])
    eerste = worker_wacht.ronde(db, NU)
    assert eerste["notified"] == ["MacMini"]
    tweede = worker_wacht.ronde(db, NU)
    assert tweede["notified"] == [] and tweede["silent"] == ["MacMini"]
    meldingen = db.tabellen["core_notifications"]
    assert len(meldingen) == 1
    assert meldingen[0]["type"] == "warning"
    assert meldingen[0]["message"].startswith("Computer offline: MacMini ")
    assert meldingen[0]["recipient"] == worker_wacht.LUKA_USER_ID


def test_na_lezen_weer_melden():
    db = NepDB([w("MacMini", 600)])
    worker_wacht.ronde(db, NU)
    db.tabellen["core_notifications"][0]["read"] = True
    assert worker_wacht.ronde(db, NU)["notified"] == ["MacMini"]


def test_db_fout_breekt_niets():
    class Kapot:
        def table(self, _t):
            raise RuntimeError("down")
    assert "error" in worker_wacht.ronde(Kapot(), NU)
