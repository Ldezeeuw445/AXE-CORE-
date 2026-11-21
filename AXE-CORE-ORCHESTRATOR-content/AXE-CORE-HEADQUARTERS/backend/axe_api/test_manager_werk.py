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


def test_eigen_ronde_pakt_een_ding_op_en_wacht_dan_2_uur(monkeypatch):
    monkeypatch.setattr(mw, "_context", lambda db, a: "context")
    monkeypatch.setattr(mw, "metingen", lambda db, a, nu, http=None: ["Faalt NU: feed X"])
    mw._RUSTIG.clear()
    db = DB({"core_manager_messages": [], "core_tasks": []})
    chat = lambda b: ('{"antwoord": "Feed X ververst niet.", "taken": ["Repareer feed X"]}', "groq")
    assert mw.eigen_ronde(db, "tradingos", NU, chat=chat) == "Repareer feed X"
    taak = db.data["core_tasks"][0]
    assert taak["metadata"]["eigen_ronde"] and taak["assignee"] == "tradingos"
    assert "Ik pak dit nu zelf op" in db.data["core_manager_messages"][0]["body"]
    # open taak / binnen 2 uur: niet nog een
    assert mw.eigen_ronde(db, "tradingos", NU + timedelta(minutes=30), chat=chat) is None


def test_rustige_ronde_maakt_niets_en_meldt_niets(monkeypatch):
    monkeypatch.setattr(mw, "_context", lambda db, a: "context")
    monkeypatch.setattr(mw, "metingen", lambda db, a, nu, http=None: ["alles ok"])
    mw._RUSTIG.clear()
    db = DB({"core_manager_messages": [], "core_tasks": []})
    chat = lambda b: ('{"antwoord": "rustig", "taken": []}', "groq")
    assert mw.eigen_ronde(db, "axon", NU, chat=chat) is None
    assert db.data["core_tasks"] == [] and db.data["core_manager_messages"] == []
    assert mw.eigen_ronde(db, "axon", NU + timedelta(minutes=10), chat=lambda b: 1 / 0) is None  # niet opnieuw gevraagd


def test_overleg_vraag_antwoord_in_gesprek_van_de_vrager(monkeypatch):
    monkeypatch.setattr(mw, "_context", lambda db, a: "context")
    monkeypatch.setattr(mw, "metingen", lambda db, a, nu, http=None: ["-"])
    db = DB({"core_manager_messages": [
        {"from_agent": "luka", "to_agent": "tradingos", "kind": "directive", "body": "Waarom staan de feeds stil?",
         "created_at": t(5)},
    ], "core_tasks": []})
    eerst = lambda b: ('{"antwoord": "Ik kijk.", "taken": [], "overleg": [{"met": "companionmgr", '
                       '"vraag": "Draait intel-proxy nog?"}, {"met": "tradingos", "vraag": "zelf"}]}', "groq")
    mw.run(db, NU, chat=eerst)
    ask = [m for m in db.data["core_manager_messages"] if m["kind"] == "ask"]
    assert len(ask) == 1 and ask[0]["from_agent"] == "tradingos" and ask[0]["to_agent"] == "companionmgr"
    assert any("Ik vraag het AXE Companion Manager" in m["body"] for m in db.data["core_manager_messages"]
               if m["from_agent"] == "tradingos")
    # volgende run: de collega antwoordt, één keer
    tweede = lambda b: ('{"antwoord": "intel-proxy geeft 502 sinds gisteren.", "taken": [], '
                        '"overleg": [{"met": "axon", "vraag": "keten"}]}', "groq")
    uit = mw.run(db, NU, chat=tweede)
    assert uit["overleg"]["van"] == "tradingos" and uit["overleg"]["met"] == "companionmgr"
    rapport = [m for m in db.data["core_manager_messages"] if m.get("in_reply_to") == ask[0]["id"]]
    assert len(rapport) == 1 and "502" in rapport[0]["body"]
    assert any(m["from_agent"] == "tradingos" and m["to_agent"] == "luka" and "502" in m["body"]
               for m in db.data["core_manager_messages"])
    assert len([m for m in db.data["core_manager_messages"] if m["kind"] == "ask"]) == 1  # geen ketting
    assert mw.open_overleg(db.data["core_manager_messages"], NU) == []


def test_lees_overleg_alleen_bestaande_collega():
    assert mw.lees_overleg('{"overleg": [{"met": "onbekend", "vraag": "x"}]}', "axon") == []
    assert mw.lees_overleg('{"overleg": [{"met": "AXON", "vraag": "x"}]}', "tradingos") == [("axon", "x")]
    assert mw.lees_overleg("geen json", "axon") == []


# ── eigen sleutels per manager (21 nov) ────────────────────────────────────

def test_elke_manager_heeft_eigen_sleutels_en_nooit_de_chat_groq():
    import manager_werk as mw
    for agent in mw.NAAM:
        v = mw.sleutel_volgorde(agent)
        namen = [env for _, env in v]
        assert namen[0] == mw.MANAGER_SLEUTELS[agent][0][0]  # eigen OpenRouter eerst
        assert "GROQ_API_KEY" not in namen                    # de chat-sleutel nooit
        assert v[-1][0] == "ollama"                            # modelbox als laatste
    # de drie OpenRouter-accounts zijn eerlijk verdeeld: elk de eerste keus van twee managers
    eerste = [mw.MANAGER_SLEUTELS[a][0][0] for a in mw.NAAM]
    assert sorted(eerste.count(k) for k in set(eerste)) == [2, 2, 2]


def test_keten_slaat_ontbrekende_sleutels_over_en_rust_per_sleutel(monkeypatch):
    import asyncio
    import llm_cascade as llm
    import manager_werk as mw
    for env in ("OPENROUTER4_API_KEY", "OPENROUTER5_API_KEY",
                "GROQ_LIGHT_API_KEY", "GROQ_RESERVE_API_KEY", "GROQ_API_KEY"):
        monkeypatch.delenv(env, raising=False)
    monkeypatch.setenv("OPENROUTER4_API_KEY", "x")
    monkeypatch.setenv("OPENROUTER5_API_KEY", "y")
    monkeypatch.setenv("GROQ_API_KEY", "chat")
    llm.vergeet_alles()
    gezien = []

    class Antw:
        def __init__(self, code, body):
            self.status_code, self._b, self.text = code, body, str(body)

        def json(self):
            return self._b

    class Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers, json):
            gezien.append((url, headers["Authorization"], json["model"]))
            if headers["Authorization"] == "Bearer x":
                return Antw(429, {"error": {"message": "rate limit"}})
            return Antw(200, {"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(llm.httpx, "AsyncClient", Client)
    tekst, model = asyncio.run(llm.chat([{"role": "user", "content": "hi"}], keten=mw.manager_keten("northseamgr")))
    assert (tekst, model) == ("ok", "openrouter/OPENROUTER5")
    assert [g[1] for g in gezien] == ["Bearer x", "Bearer y"]          # eigen OpenRouter, dan de tweede
    assert all(g[2] == mw.OPENROUTER_GRATIS_MODEL for g in gezien)       # alleen het gratis model
    assert "Bearer chat" not in [g[1] for g in gezien]
    # OPENROUTER4 rust nu, maar alleen die sleutel: een manager met OPENROUTER5 eerst merkt niets
    assert llm._rust_tot.get("openrouter/OPENROUTER4", 0) > 0
    assert "openrouter" not in llm._rust_tot
    llm.vergeet_alles()
