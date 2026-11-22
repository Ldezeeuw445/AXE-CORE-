"""De manager-lus als betrouwbaar systeem (audit 22 nov): scenario's uit de audit."""
from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from typing import Any

import manager_betrouwbaar as mb
import manager_werk as mw
import manager_context as mc
import taak_verslag as tv

NU = datetime(2026, 11, 22, 12, 0, tzinfo=timezone.utc)


class Q:
    def __init__(self, db, naam):
        self.db, self.naam, self.f, self._ins, self._upd = db, naam, [], None, None

    def select(self, *_a): return self
    def order(self, *_a, **_k): return self
    def limit(self, *_a): return self
    def gte(self, *_a): return self
    def or_(self, *_a): return self
    def eq(self, k, v): self.f.append((k, lambda x, v=v: x == v)); return self
    def in_(self, k, vs): self.f.append((k, lambda x, vs=vs: x in vs)); return self
    def insert(self, rij): self._ins = rij; return self
    def update(self, rij): self._upd = rij; return self

    def execute(self):
        rijen = self.db.rijen.setdefault(self.naam, [])
        if self._ins is not None:
            rij = {"id": f"{self.naam}-{len(rijen)}", "created_at": NU.isoformat(), **self._ins}
            rijen.append(rij)
            return type("R", (), {"data": [rij]})()
        hit = [r for r in rijen if all(fn(r.get(k)) for k, fn in self.f)]
        if self._upd is not None:
            for r in hit:
                r.update(self._upd)
        return type("R", (), {"data": [dict(r) for r in hit]})()


class DB:
    def __init__(self): self.rijen: dict[str, list[dict[str, Any]]] = {}
    def table(self, n): return Q(self, n)


def taken(db): return [r for r in db.rijen.get("core_tasks", []) if r.get("capability") == "agentic"]


# ── 1. dubbel ─────────────────────────────────────────────────────────────

def test_zelfde_opdracht_twee_keer_is_een_taak():
    db = DB()
    assert mw.maak_taak(db, "tradingos", "Zoek uit waarom feed X niet ververst", NU, "msg-1")
    assert mw.maak_taak(db, "tradingos", "Zoek uit waarom feed X niet ververst", NU, "msg-1") is None
    assert len(taken(db)) == 1


def test_zelfde_probleem_andere_woorden_terwijl_het_loopt():
    db = DB()
    mw.maak_taak(db, "tradingos", "Onderzoek waarom de corporateJets intellect-feed niet ververst", NU, "a")
    assert mw.maak_taak(db, "tradingos", "Repareer de corporateJets intellect-feed die niet ververst", NU, "b") is None
    assert len(taken(db)) == 1


# ── 2. herhaling ──────────────────────────────────────────────────────────

def test_twee_keer_mislukt_blokkeert_en_escaleert_een_keer():
    db = DB()
    opdracht = "Repareer sleutel dax-northsea-01 die weigert"
    for i in range(2):
        t = mw.maak_taak(db, "northseamgr", opdracht, NU, f"m{i}")
        assert t
        t["status"] = "failed"
        db.rijen["core_tasks"][-1]["status"] = "failed"
    assert mw.maak_taak(db, "northseamgr", opdracht, NU, "m3") is None
    assert mw.maak_taak(db, "northseamgr", opdracht, NU, "m4") is None
    stappen = [r for r in db.rijen["core_tasks"] if r.get("capability") == "stap"]
    assert len(stappen) == 1 and stappen[0]["assignee"] == "luka"
    assert sum("twee keer niet" in str(r.get("body")) for r in db.rijen["core_manager_messages"]) == 1
    assert db.rijen["core_tasks"][1]["metadata"]["poging"] == 2


def test_net_opgelost_koelt_af():
    bestaand = [{"status": "completed", "completed_at": (NU - timedelta(hours=2)).isoformat(),
                 "metadata": {"vinger": "v", "idem": "x"}}]
    assert mb.beslis(bestaand, "y", "v", NU)[0] == "afkoelen"
    bestaand[0]["completed_at"] = (NU - timedelta(hours=30)).isoformat()
    assert mb.beslis(bestaand, "y", "v", NU)[0] == "maak"


def test_vingerafdruk_negeert_werkwoorden_en_volgorde():
    a = mb.vingerafdruk("x", "Zoek uit waarom de intel-proxy functie faalt")
    b = mb.vingerafdruk("x", "Repareer de intel-proxy functie, die faalt")
    assert a == b


# ── 3. model-uitvoer ──────────────────────────────────────────────────────

def test_strikte_json():
    assert mb.lees_model_json('```json\n{"antwoord": "ok", "taken": []}\n```') == {"antwoord": "ok", "taken": []}
    assert mb.lees_model_json('Uitleg {niet json} en dan {"antwoord": "ja", "taken": ["a"]}')["taken"] == ["a"]
    assert mb.lees_model_json('{"antwoord": "ok", "taken": "geen lijst"}') is None
    assert mb.lees_model_json("gewoon tekst") is None


def test_ongeldige_json_een_herstelpoging_daarna_geen_taak():
    db = DB()
    vragen: list[int] = []

    def kapot(msgs):
        vragen.append(len(msgs))
        return "Ik ga de feed repareren {taken: [feed]}", "m"

    antwoord, tk, _m, _o = mw.denk(db, "axon", [{"body": "doe iets"}], [], chat=kapot)
    assert tk == [] and len(vragen) == 2
    assert mb.TELLERS["axon"]["ongeldige_json"] >= 1

    beurt = iter(['nee', '{"antwoord": "Ik pak het op", "taken": ["Repareer feed"]}'])
    antwoord, tk, _m, _o = mw.denk(db, "axon", [{"body": "doe iets"}], [], chat=lambda m: (next(beurt), "m"))
    assert tk == ["Repareer feed"] and mb.TELLERS["axon"]["json_hersteld"] >= 1


# ── 4. één ronde tegelijk ─────────────────────────────────────────────────

def test_tweede_ronde_tegelijk_wordt_overgeslagen():
    mw._RONDE.acquire()
    try:
        assert mw.run(DB(), NU, chat=lambda m: ('{"antwoord": "x"}', "m"))["overgeslagen"]
    finally:
        mw._RONDE.release()
    assert "overgeslagen" not in mw.run(DB(), NU, chat=lambda m: ('{"antwoord": "x"}', "m"))


def test_gezondheid_geeft_alarm_bij_stilstand():
    mb.TELLERS.clear()
    g = mb.gezondheid(("axon",), [{"requested_by": "axon", "status": "completed"},
                                  {"requested_by": "axon", "status": "failed"}], NU, None, None)
    assert g["managers"]["axon"]["succes_24u"] == 0.5
    assert not g["ok"] and any("draaide" in a for a in g["alarmen"])
    g = mb.gezondheid(("axon",), [], NU, NU - timedelta(minutes=1), None)
    assert g["ok"]


# ── 5. lessen ─────────────────────────────────────────────────────────────

def test_mislukte_managertaak_wordt_een_les_die_terugkomt():
    db = DB()
    taak = {"title": "NorthSea Manager: Repareer planner", "requested_by": "northseamgr",
            "metadata": {"manager": True, "agent": "northseamgr", "app_naam": "NorthSea"}}
    assert tv.ervaring(db, taak, "failed", {"faalde": "timeout op Supabase", "volgende": "kleinere query"})
    assert not tv.ervaring(db, taak, "failed", {"faalde": "timeout op Supabase", "volgende": "kleinere query"})
    les = db.rijen["core_manager_messages"][0]
    assert les["to_agent"] == "ervaring" and "Waarom: timeout op Supabase" in les["body"]
    tekst = mc.lees_context(db, "northseamgr", NU)
    assert "ervaring: Mislukt: Repareer planner" in tekst


def test_gewone_taak_geeft_geen_ervaring():
    assert not tv.ervaring(DB(), {"title": "x", "metadata": {}}, "failed", {"faalde": "y"})


def test_tellers_staan_in_de_database_voor_beide_workers():
    db = DB()
    mw.maak_taak(db, "axon", "Repareer de axon sync", NU, "x")
    mw.maak_taak(db, "axon", "Repareer de axon sync", NU, "x")   # dubbel
    db.rijen["core_schedules"] = [{"job_key": "axe_core:staande-managerwerk",
                                   "last_run_at": (NU - timedelta(minutes=1)).isoformat()}]
    mw._STAND["laatste_run"] = None
    g = mw.gezondheid(db, NU)
    assert g["managers"]["axon"]["dubbel_tegengehouden"] == 1
    assert g["ok"], g["alarmen"]
    ev = db.rijen["core_agent_events"][0]
    assert ev["agent"] == "managerwerk" and ev["message"].startswith("axon|dubbel|")
