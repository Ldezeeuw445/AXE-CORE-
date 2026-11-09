"""ADR-01: één stem in de kamer."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import stem_vloer as sv

T = datetime(2026, 11, 9, 19, 0, tzinfo=timezone.utc)


def c(id_, dev, naam, idle, ms=0, won=None):
    return {"id": id_, "device_id": dev, "device_name": naam, "idle_s": idle,
            "created_at": (T + timedelta(milliseconds=ms)).isoformat(), "won": won}


MINI = ("mini", "Mac mini")
IMAC = ("imac", "Main-iMac-Luka")


def test_waar_luka_typt_wint_ook_als_de_ander_eerst_was():
    a = c("a", *MINI, idle=300, ms=0)
    b = c("b", *IMAC, idle=3, ms=120)
    assert sv.kies(a, [a, b])["winner"] is False
    assert sv.kies(b, [a, b])["winner"] is True


def test_beide_ver_weg_dan_vaste_volgorde():
    a = c("a", *IMAC, idle=900, ms=0)
    b = c("b", *MINI, idle=600, ms=50)
    # Niemand actief: kortst stilliggend wint (de mini, 600 s).
    assert sv.kies(b, [a, b])["winner"] is True
    a2 = c("a", *IMAC, idle=None, ms=0)
    b2 = c("b", *MINI, idle=None, ms=50)
    assert sv.kies(b2, [a2, b2])["winner"] is True  # volgorde: mini voor imac


def test_zelfde_besluit_op_beide_workers():
    a = c("a", *MINI, idle=40, ms=0)
    b = c("b", *IMAC, idle=50, ms=200)
    ra, rb = sv.kies(a, [a, b]), sv.kies(b, [a, b])
    assert ra["winner_device"] == rb["winner_device"] == "mini"
    assert ra["winner"] != rb["winner"]


def test_vloer_blijft_12_seconden_bij_de_winnaar():
    eerder = c("a", *MINI, idle=2, ms=0, won=True)
    nu = c("b", *IMAC, idle=1, ms=8000)
    r = sv.kies(nu, [eerder, nu])
    assert r["winner"] is False and r["reden"] == "floor" and r["winner_device"] == "mini"
    later = c("c", *IMAC, idle=1, ms=13000)
    assert sv.kies(later, [eerder, later])["winner"] is True


def test_alleen_ik_dan_win_ik():
    a = c("a", *IMAC, idle=None)
    assert sv.kies(a, [a])["winner"] is True


class _Q:
    def __init__(self, db, faal):
        self.db, self.faal = db, faal

    def insert(self, rij):
        if self.faal:
            raise RuntimeError("relation core_voice_claims does not exist")
        self.db.rijen.append({"id": "x", "created_at": T.isoformat(), "won": None, **rij})
        return self

    def select(self, *_a):
        return self

    def update(self, body):
        self.db.rijen[-1].update(body)
        return self

    def gte(self, *_a):
        return self

    def order(self, *_a):
        return self

    def limit(self, *_a):
        return self

    def eq(self, *_a):
        return self

    def execute(self):
        return type("R", (), {"data": [self.db.rijen[-1]] if self.db.rijen else []})()


class _Db:
    def __init__(self, faal=False):
        self.rijen, self.faal = [], faal

    def table(self, _t):
        return _Q(self, self.faal)


def test_claim_schrijft_en_beslist():
    db = _Db()
    r = sv.claim(db, "imac", "Main-iMac-Luka", "wake", 2.0, slaap=lambda s: None)
    assert r["winner"] is True and db.rijen[0]["won"] is True


def test_zonder_tabel_luistert_het_apparaat_gewoon():
    r = sv.claim(_Db(faal=True), "imac", "iMac", "wake", None, slaap=lambda s: None)
    assert r["winner"] is True and r["reden"] == "fallback"
