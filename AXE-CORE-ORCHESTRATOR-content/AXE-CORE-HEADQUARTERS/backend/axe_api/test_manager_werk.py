"""Managers die werken: antwoorden zonder app, taken starten, terugmelden."""
from datetime import datetime, timedelta, timezone

import manager_werk as mw

NU = datetime(2026, 11, 20, 22, 0, tzinfo=timezone.utc)


def t(min_geleden):
    return (NU - timedelta(minutes=min_geleden)).isoformat()


def test_onbeantwoord_alleen_na_3_min_en_na_het_laatste_antwoord():
    draad = [
        {"from_agent": "luka", "to_agent": "projectsmgr", "kind": "directive", "body": "oud", "created_at": t(60)},
        {"from_agent": "projectsmgr", "to_agent": "luka", "kind": "report", "body": "ok", "created_at": t(50)},
        {"from_agent": "luka", "to_agent": "projectsmgr", "kind": "directive", "body": "fix X", "created_at": t(10)},
        {"from_agent": "luka", "to_agent": "projectsmgr", "kind": "directive", "body": "net", "created_at": t(1)},
        {"from_agent": "luka", "to_agent": "axon", "kind": "directive", "body": "ander", "created_at": t(10)},
    ]
    assert [b["body"] for b in mw.onbeantwoord(draad, "projectsmgr", NU)] == ["fix X"]
    # app antwoordde al: niets meer te doen
    draad.append({"from_agent": "projectsmgr", "to_agent": "luka", "kind": "report", "body": "doe ik", "created_at": t(0)})
    assert mw.onbeantwoord(draad, "projectsmgr", NU) == []


def test_lees_antwoord_json_en_vrije_tekst():
    a, taken = mw.lees_antwoord('bla {"antwoord": "Ik ga nu X fixen", "taken": ["fix X in main.py", ""]} bla')
    assert a == "Ik ga nu X fixen" and taken == ["fix X in main.py"]
    assert mw.lees_antwoord("gewoon tekst") == ("gewoon tekst", [])


class Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.filters, self._insert, self._update = db, tabel, [], None, None
    def select(self, *_): return self
    def eq(self, k, v): self.filters.append((k, "eq", v)); return self
    def in_(self, k, v): self.filters.append((k, "in", v)); return self
    def gte(self, *_): return self
    def or_(self, *_): return self
    def order(self, *_, **__): return self
    def limit(self, *_): return self
    def insert(self, rij): self._insert = rij; return self
    def update(self, rij): self._update = rij; return self
    def execute(self):
        rijen = self.db.data.setdefault(self.tabel, [])
        if self._insert is not None:
            rij = {"id": f"{self.tabel}-{len(rijen)}", **self._insert}
            rijen.append(rij)
            self.data = [rij]
            return self
        sel = [r for r in rijen if all((r.get(k) == v) if op == "eq" else (r.get(k) in v) for k, op, v in self.filters)]
        if self._update is not None:
            for r in sel:
                r.update(self._update)
        self.data = sel
        return self


class DB:
    def __init__(self, data): self.data = data
    def table(self, n): return Q(self, n)


def test_run_beantwoordt_start_taak_en_meldt_terug(monkeypatch):
    monkeypatch.setattr(mw, "_context", lambda db, a: "context")
    monkeypatch.setattr(mw, "_http_status", lambda url, timeout=8.0: "HTTP 200")
    db = DB({"core_manager_messages": [
        {"from_agent": "luka", "to_agent": "companionmgr", "kind": "directive", "body": "Fix de login", "created_at": t(5)},
    ], "core_tasks": []})
    chat = lambda berichten: ('{"antwoord": "Ik ga nu de login fixen.", "taken": ["Repareer de login-route"]}', "groq")
    uit = mw.run(db, NU, chat=chat)
    assert uit["beantwoord"] == [{"agent": "companionmgr", "model": "groq", "taken": 1}]
    taak = db.data["core_tasks"][0]
    assert taak["assignee"] == "companionmgr" and taak["capability"] == "agentic" and taak["metadata"]["manager"]
    zeg = [m for m in db.data["core_manager_messages"] if m["from_agent"] == "companionmgr"]
    assert "Ik ga nu de login fixen." in zeg[0]["body"] and "Gestart" in zeg[0]["body"]
    # tweede ronde: al beantwoord → geen tweede antwoord
    assert mw.run(db, NU, chat=chat)["beantwoord"] == []
    # taak klaar → één keer terugmelden
    taak.update(status="completed", completed_at=NU.isoformat(), result={"summary": "Route gerepareerd"})
    assert mw.meld_klaar(db, NU) == 1
    assert mw.meld_klaar(db, NU) == 0
    assert any("Klaar" in m["body"] and "Route gerepareerd" in m["body"] for m in db.data["core_manager_messages"])


def test_metingen_zijn_feiten_en_breken_niet():
    db = DB({"intel_sync_log": [
        {"feed_id": "energyFlows", "last_sync_at": t(60), "last_error": None},
        {"feed_id": "oud", "last_sync_at": t(60 * 48), "last_error": "401"},
    ]})
    r = mw.metingen(db, "companionmgr", NU, http=lambda url, timeout=8.0: "HTTP 200")
    assert any("1 van 2 ververst" in x and "oud" in x for x in r)
    assert any("axecompanion.com: HTTP 200" in x for x in r)
    # een kapotte bron geeft een regel, geen crash
    class Kapot:
        def table(self, n): raise RuntimeError("weg")
    assert mw.metingen(Kapot(), "projectsmgr", NU)


def test_eigen_oude_verslagen_gaan_niet_mee():
    ctx = ("Jouw wereld nu (companion):\n\nJouw open taken: geen.\n\nWacht op Luka (1):\n- iets\n\n"
           "Je laatste taakverslagen:\n- 7 u geleden: Companion draait niet\n\n"
           "Wat je zelf laatst zei/deed:\n- 1 u geleden: database leeg\n\nZelf doen (niet vragen): lezen")
    uit = mw.zonder_eigen_verslagen(ctx)
    assert "draait niet" not in uit and "database leeg" not in uit
    assert "Wacht op Luka" in uit and "Zelf doen" in uit


def test_gestopte_fouten_staan_apart():
    db = DB({"core_tasks": [
        {"status": "failed", "error": {"message": "oude fout"}, "created_at": t(60 * 20)},
        {"status": "failed", "error": {"message": "oude fout"}, "created_at": t(60 * 21)},
        {"status": "failed", "error": {"message": "verse fout"}, "created_at": t(10)},
    ]})
    r = next(x for x in mw.metingen(db, "projectsmgr", NU) if x.startswith("Taken"))
    nu_deel, gestopt_deel = r.split("Gestopt")
    assert "verse fout" in nu_deel and "oude fout" not in nu_deel and "oude fout" in gestopt_deel
