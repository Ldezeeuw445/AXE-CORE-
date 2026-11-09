"""Managers-tab als Grok Bot: gedeelde draad en gewone taal."""
from __future__ import annotations

from datetime import datetime, timezone

import manager_draad as md


class _Q:
    def __init__(self, db):
        self.db, self.f, self.op, self.body = db, {}, "select", None

    def select(self, *_a):
        return self

    def insert(self, rij):
        self.op, self.body = "insert", rij
        return self

    def update(self, body):
        self.op, self.body = "update", body
        return self

    def eq(self, k, v):
        self.f[k] = v
        return self

    def is_(self, k, _v):
        self.f[k] = None
        return self

    def or_(self, *_a):
        self.f["_luka"] = True
        return self

    def gt(self, *_a):
        return self

    def order(self, _k, desc=False):
        self.desc = desc
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        if self.op == "insert":
            rij = {"id": f"m{len(self.db.rijen) + 1}", "created_at": f"2026-11-09T20:{len(self.db.rijen):02d}:00+00:00",
                   "read_at": None, **self.body}
            self.db.rijen.append(rij)
            return type("R", (), {"data": [rij]})()
        hits = [r for r in self.db.rijen if all(
            (k == "_luka" and md.LUKA in (r["from_agent"], r["to_agent"])) or r.get(k) == v
            for k, v in self.f.items())]
        if self.op == "update":
            for r in hits:
                r.update(self.body)
            return type("R", (), {"data": hits})()
        hits = sorted(hits, key=lambda r: r["created_at"], reverse=getattr(self, "desc", False))
        return type("R", (), {"data": hits})()


class _Db:
    def __init__(self):
        self.rijen: list = []

    def table(self, _t):
        return _Q(self)


def test_bericht_leest_als_een_mens():
    t = md.bericht(gedaan=["NorthSea Engine opnieuw gestart"], nodig=["log Claude 2 opnieuw in"],
                   gezien=["1 feed staat stil"])
    assert t.startswith("Wat ik gedaan heb:\n- NorthSea Engine opnieuw gestart.")
    assert t.index("Wat ik van jou nodig heb") < t.index("Wat ik verder zie")
    assert md.bericht() == "Alles loopt, ik hoef je nergens voor."


def test_manager_herhaalt_zichzelf_niet():
    db = _Db()
    assert md.vertel_luka(db, "companionmgr", "Alle vaste jobs draaien.") is True
    assert md.vertel_luka(db, "companionmgr", "Alle vaste jobs draaien.") is False
    assert md.vertel_luka(db, "companionmgr", "Wat ik gedaan heb:\n- X opnieuw gestart.") is True
    assert len(db.rijen) == 2


def test_draad_is_het_gesprek_en_niet_het_managersoverleg():
    db = _Db()
    md.schrijf(db, "northseamgr", "user", "Hoe staat de desk?")
    md.vertel_luka(db, "northseamgr", "De desk loopt.")
    db.rijen.append({"id": "x", "from_agent": "companionmgr", "to_agent": "axemanager", "kind": "report",
                     "body": "Vaste jobs: alles draait.", "created_at": "2026-11-09T19:00:00+00:00", "read_at": None})
    d = md.draad(db)
    assert [(b["agent"], b["role"]) for b in d] == [("northseamgr", "user"), ("northseamgr", "assistant")]
    assert d[0]["read"] is True and d[1]["read"] is False


def test_gelezen_markeren_per_manager():
    db = _Db()
    md.vertel_luka(db, "axon", "Geheugen in orde.")
    md.vertel_luka(db, "tradingos", "Feeds vers.")
    md.markeer_gelezen(db, "axon")
    gelezen = {b["agent"]: b["read"] for b in md.draad(db)}
    assert gelezen == {"axon": True, "tradingos": False}


def test_schrijf_weigert_onzin():
    import pytest
    with pytest.raises(ValueError):
        md.schrijf(_Db(), "luka", "user", "x")
    with pytest.raises(ValueError):
        md.schrijf(_Db(), "axon", "system", "x")


def test_companion_manager_vertelt_in_gewone_taal(monkeypatch):
    import grok_managers as gm
    db = _Db()
    monkeypatch.setattr(gm, "_rijen", lambda *a, **k: [])
    monkeypatch.setattr(gm, "_herkans_vroeg", lambda db, rijen, nu: [{"name": "NorthSea Engine"}])
    monkeypatch.setattr(gm, "_rapporteer_bij_verandering", lambda *a, **k: False)
    monkeypatch.setattr(gm, "_dagoverzicht", lambda *a, **k: False)
    import sleutels
    monkeypatch.setattr(sleutels, "lees", lambda db, nu=None: {"apps": []})
    uit = gm.run_companionmgr(db, datetime(2026, 11, 9, 20, 0, tzinfo=timezone.utc))
    assert uit["chat"] is True
    body = [r for r in db.rijen if r["to_agent"] == md.LUKA][0]["body"]
    assert "NorthSea Engine opnieuw gestart" in body and body.startswith("Wat ik gedaan heb")
