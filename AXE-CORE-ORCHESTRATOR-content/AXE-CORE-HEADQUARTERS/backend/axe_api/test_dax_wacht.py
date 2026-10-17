"""DAX-bots always-on: wakker houden, meten, vast werk, en nooit nep-klaar.

Gemeten 11 okt 2026: alleen een taak maakte een DAX wakker, alleen dán kwam er
een heartbeat, en niemand gaf de bots werk. Deze tests leggen het nieuwe gedrag
vast zonder database of Docker (een nepdatabase en een nep-runtime).
"""
from __future__ import annotations

import asyncio
import copy
import hashlib
import importlib.util
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest

import dax_wacht
from dax import altijd_aan, slaap_inactieven
from mission_engine import taak_extra
from missies import beslis, normaliseer_mijlpalen
from task_worker import blokkade_uit_rapport

NU = datetime(2026, 10, 11, 12, 0, tzinfo=timezone.utc)


# ── Een nepdatabase die precies doet wat dax_wacht/missies vragen ────────────

class _Q:
    def __init__(self, db, tabel):
        self.db, self.tabel, self.filters, self.actie, self.data = db, tabel, [], "select", None
        self._limit = None

    def select(self, *_a, **_k):
        self.actie = "select"
        return self

    def insert(self, rij):
        self.actie, self.data = "insert", rij
        return self

    def update(self, patch):
        self.actie, self.data = "update", patch
        return self

    def eq(self, kolom, waarde):
        self.filters.append((kolom, waarde))
        return self

    def gt(self, *_a):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _past(self, rij):
        for kolom, waarde in self.filters:
            if "->>" in kolom:
                veld, _, sleutel = kolom.partition("->>")
                if str((rij.get(veld) or {}).get(sleutel)) != str(waarde):
                    return False
            elif rij.get(kolom) != waarde:
                return False
        return True

    def execute(self):
        rijen = self.db.tabellen.setdefault(self.tabel, [])
        if self.actie == "insert":
            nieuw = dict(self.data)
            nieuw.setdefault("id", str(uuid.uuid4()))
            nieuw.setdefault("revision", 0)
            nieuw.setdefault("updated_at", NU.isoformat())
            rijen.append(nieuw)
            return type("R", (), {"data": [copy.deepcopy(nieuw)]})
        treffers = [r for r in rijen if self._past(r)]
        if self.actie == "update":
            for r in treffers:
                r.update(copy.deepcopy(self.data))
        uit = [copy.deepcopy(r) for r in treffers]
        if self._limit:
            uit = uit[: self._limit]
        return type("R", (), {"data": uit})


class NepDB:
    def __init__(self, **tabellen):
        self.tabellen = {k: list(v) for k, v in tabellen.items()}

    def table(self, naam):
        return _Q(self, naam)

    def rpc(self, *_a, **_k):
        return type("Q", (), {"execute": lambda self: type("R", (), {"data": []})})()


class NepRuntime:
    """Doet alsof hij een container is; onthoudt wat er gevraagd werd."""

    def __init__(self, hart: dict, status="exited", exec_fout=None):
        self.hart, self._status, self.exec_fout = hart, status, exec_fout
        self.gestart, self.commando = [], []

    def status(self, c):
        return self._status

    def ensure_running(self, c):
        actie = "none" if self._status == "running" else "started"
        self._status = "running"
        self.gestart.append(c.id)
        return {"status": "running", "action": actie}

    def stop(self, c):
        self._status = "exited"
        return {"status": "stopped"}

    def exec(self, c, command, cwd=None, timeout=60, stdin=None):
        self.commando.append((command, stdin))
        if self.exec_fout:
            return {"exit_code": 1, "stdout": "", "stderr": self.exec_fout}
        if command == "bash -s":
            return {"exit_code": 0, "stdout": "noise\n" + json.dumps(self.hart) + "\n", "stderr": ""}
        return {"exit_code": 0, "stdout": "", "stderr": ""}


def computer(agent="trading", **kw):
    rij = {"id": f"dax-{agent}-01", "owner_agent": agent, "members": [agent], "runtime": "docker",
           "host": "strato", "status": "provisioned", "metadata": {"always_on": True}, "volumes": {}}
    rij.update(kw)
    return rij


def gezond_hart(**kw):
    hart = {"dax_id": "dax-trading-01", "uptime_s": 30, "host_mem_available_mb": 9000, "container_mem_mb": 20,
            "disk_free_mb": 400000,
            "tools": {"python3": True, "git": True, "node": True, "curl": True, "chromium": True, "dax_browser": True},
            "net": {"github": 200, "public_api": 200},
            "engines": {"claude_installed": True, "claude_logged_in": False, "codex_installed": True,
                        "codex_logged_in": False},
            "routine_sha": ""}
    hart.update(kw)
    return hart


# ── Meten en eisen ───────────────────────────────────────────────────────────

def test_hartslag_leest_de_laatste_json_regel():
    assert dax_wacht.lees_hartslag("bash: warn\n{\"a\": 1}\n")["a"] == 1
    with pytest.raises(ValueError):
        dax_wacht.lees_hartslag("geen json")


def test_gezonde_bot_heeft_geen_blokkades():
    assert dax_wacht.blokkades(dax_wacht.ROUTINES["browser"], gezond_hart(), None) == []


def test_ontbrekende_chromium_netwerk_en_geheugen_zijn_eerlijke_blokkades():
    hart = gezond_hart(tools={"python3": True, "chromium": False, "dax_browser": False},
                       net={"github": 0, "public_api": 0}, host_mem_available_mb=600)
    mist = dax_wacht.blokkades(dax_wacht.ROUTINES["browser"], hart, None)
    tekst = " | ".join(mist)
    assert "no internet" in tekst and "Chromium is missing" in tekst and "low on memory" in tekst


def test_developer_zonder_github_is_geblokkeerd():
    mist = dax_wacht.blokkades(dax_wacht.ROUTINES["developer"], gezond_hart(net={"github": 0, "public_api": 200}), None)
    assert any("github.com unreachable" in m for m in mist)


def test_geen_model_blokkeert_elke_bot():
    mist = dax_wacht.blokkades(dax_wacht.ROUTINES["trading"], gezond_hart(), "no model for the agent loop: x")
    assert mist == ["no model for the agent loop: x"]


def test_model_check_modelbox_of_groq(monkeypatch):
    monkeypatch.setenv("AXE_AGENT_FALLBACK_MODEL", "llama3.1:8b-16k")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    goed = lambda url, t: (200, json.dumps({"models": [{"name": "llama3.1:8b-16k"}]}))  # noqa: E731
    assert dax_wacht.model_blokkade(goed) is None
    plat = lambda url, t: (_ for _ in ()).throw(OSError("down"))  # noqa: E731
    assert "no model" in dax_wacht.model_blokkade(plat)
    monkeypatch.setenv("GROQ_API_KEY", "x")
    assert dax_wacht.model_blokkade(plat) is None


# ── Always-on ────────────────────────────────────────────────────────────────

def test_always_on_wint_van_de_slaapronde(monkeypatch):
    monkeypatch.delenv("AXE_DAX_ALWAYS_ON", raising=False)
    assert altijd_aan({"metadata": {}}) is True
    assert altijd_aan({"metadata": {"always_on": False}}) is False

    class Reg:
        def bezette_slots(self):
            return []

        def rijen(self):
            oud = (NU - timedelta(hours=3)).isoformat()
            return [dict(computer("trading"), status="running", last_heartbeat_at=oud),
                    dict(computer("browser", metadata={"always_on": False}), status="running", last_heartbeat_at=oud)]

        def meld(self, *_a, **_k):
            pass

    rt = NepRuntime(gezond_hart(), status="running")
    gestopt = slaap_inactieven(Reg(), idle_seconden=60, runtime_factory=lambda c: rt)
    assert gestopt == ["dax-browser-01"]


# ── De ronde ─────────────────────────────────────────────────────────────────

def test_ronde_maakt_wakker_meet_installeert_en_geeft_vast_werk():
    db = NepDB(core_dax_computers=[computer("trading")], core_missions=[], core_mission_events=[], core_dax_slots=[])
    rt = NepRuntime(gezond_hart())
    uit = dax_wacht.ronde(lambda: db, runtime_factory=lambda c: rt, model_check=lambda: None, nu=NU)

    assert rt.gestart == ["dax-trading-01"]
    rij = db.tabellen["core_dax_computers"][0]
    assert rij["status"] == "running" and rij["last_heartbeat_at"]
    assert rij["stats"]["blockers"] == [] and rij["stats"]["routine"] == "markets"
    # het script ging erin, met precies de bron uit de repo
    installatie = [s for c, s in rt.commando if "dax-routine" in c and s]
    assert installatie and hashlib.sha256(installatie[0].encode()).hexdigest() == dax_wacht.routine_sha()
    missie = db.tabellen["core_missions"][0]
    assert missie["status"] == "active" and missie["recurring_interval_seconds"] == 6 * 3600
    assert missie["metadata"]["dax_routine"] == "trading" and missie["metadata"]["task_payload"] == {"crew": False, "free_models": True}
    assert "dax-routine markets" in missie["milestones"][0]["goal"]
    assert uit["bots"]["trading"]["mission"]["action"] == "created"
    assert dax_wacht.ronde_status(uit) == "ok"


def test_ronde_tweede_keer_maakt_geen_tweede_missie_maar_zet_wel_de_huidige_routine():
    db = NepDB(core_dax_computers=[computer("trading")], core_missions=[], core_mission_events=[])
    rt = NepRuntime(gezond_hart(routine_sha=dax_wacht.routine_sha()), status="running")
    dax_wacht.ronde(lambda: db, runtime_factory=lambda c: rt, model_check=lambda: None, nu=NU)
    dax_wacht.ronde(lambda: db, runtime_factory=lambda c: rt, model_check=lambda: None, nu=NU)
    assert len(db.tabellen["core_missions"]) == 1
    # 17 okt: altijd herschrijven, anders blijft een kapotte .venv-ci-routine staan.
    assert [c for c, _ in rt.commando if "cat > ~/.local/bin/dax-routine" in c]


def test_onbereikbare_computer_is_error_en_blokkeert_de_missie():
    db = NepDB(core_dax_computers=[computer("browser")], core_missions=[], core_mission_events=[])
    rt = NepRuntime(gezond_hart(), exec_fout="ssh: connect to host refused")
    uit = dax_wacht.ronde(lambda: db, runtime_factory=lambda c: rt, model_check=lambda: None, nu=NU)
    rij = db.tabellen["core_dax_computers"][0]
    assert rij["status"] == "error" and "refused" in rij["last_error"]
    missie = db.tabellen["core_missions"][0]
    assert missie["status"] == "blocked" and "not reachable" in missie["blocked_reason"]
    assert dax_wacht.ronde_status(uit) == "fail"


def test_blokkade_weg_dan_hervat_de_missie_vanzelf():
    db = NepDB(core_dax_computers=[computer("browser")], core_missions=[], core_mission_events=[], core_tasks=[])
    kapot = NepRuntime(gezond_hart(tools={"python3": True, "chromium": False, "dax_browser": True}), status="running")
    dax_wacht.ronde(lambda: db, runtime_factory=lambda c: kapot, model_check=lambda: None, nu=NU)
    m = db.tabellen["core_missions"][0]
    assert m["status"] == "blocked" and "Chromium" in m["blocked_reason"] and m["last_stop_reason"] == "dax_capability"

    heel = NepRuntime(gezond_hart(), status="running")
    uit = dax_wacht.ronde(lambda: db, runtime_factory=lambda c: heel, model_check=lambda: None, nu=NU)
    assert db.tabellen["core_missions"][0]["status"] == "active"
    assert uit["bots"]["browser"]["mission"]["action"] == "resumed"


def test_andere_blokkade_wordt_na_een_interval_opnieuw_geprobeerd():
    m = dax_wacht.missie_rij("thinktank", dax_wacht.ROUTINES["thinktank"])
    m.update(id=str(uuid.uuid4()), status="blocked", last_stop_reason="agent_blocked", revision=3,
             blocked_reason="Hacker News HTTP 503", updated_at=(NU - timedelta(hours=1)).isoformat())
    db = NepDB(core_missions=[m], core_mission_events=[], core_tasks=[])
    r = dax_wacht.ROUTINES["thinktank"]
    assert dax_wacht.zorg_voor_missie(db, "thinktank", r, [], NU)["action"] == "none"
    later = NU + timedelta(seconds=r.interval_s)
    uit = dax_wacht.zorg_voor_missie(db, "thinktank", r, [], later)
    assert uit["action"] == "retried"
    nieuw = db.tabellen["core_missions"][0]
    assert nieuw["status"] == "active" and "Hacker News HTTP 503" in nieuw["milestones"][0]["next_action"]


def test_gepauzeerde_missie_blijft_van_luka():
    m = dax_wacht.missie_rij("trading", dax_wacht.ROUTINES["trading"])
    m.update(id=str(uuid.uuid4()), status="paused")
    db = NepDB(core_missions=[m], core_mission_events=[])
    assert dax_wacht.zorg_voor_missie(db, "trading", dax_wacht.ROUTINES["trading"], [], NU)["status"] == "paused"


def test_northsea_schrijft_geen_bestand_maar_verifieert_wel():
    tekst = dax_wacht.opdracht(dax_wacht.ROUTINES["northsea"])
    assert "do not write files" in tekst and "verify energy`" in tekst and "--report" not in tekst


# ── Nooit nep-klaar ──────────────────────────────────────────────────────────

def test_bewezen_maar_geblokkeerd_is_geen_voltooide_taak():
    assert blokkade_uit_rapport({"summary": "Ran it.\nMILESTONE: done"}) is None
    b = blokkade_uit_rapport({"summary": "ERROR markets: HTTP 503\nMILESTONE: blocked REASON: Yahoo HTTP 503"})
    assert b == {"code": "agent_blocked", "message": "Yahoo HTTP 503"}
    assert blokkade_uit_rapport({"summary": "MILESTONE: human REASON: pick one"})["code"] == "needs_human"


def test_worker_zet_geblokkeerde_stap_op_blocked_niet_completed():
    from task_worker import TaskWorker

    class Repo:
        def __init__(self):
            self.overgangen = []

        def transition(self, task_id, status, **kw):
            self.overgangen.append((status, kw.get("error")))
            return {"id": task_id, "status": status, "lease_token": "L", "checkpoint": {}}

        def append_event(self, *a, **k):
            pass

        def heartbeat(self, *a, **k):
            return {"id": "t", "lease_token": "L", "checkpoint": {}}

    async def handler(task, ctx):
        return {"summary": "ERROR ideas\nMILESTONE: blocked REASON: HN down",
                "verification": {"passed": True, "checks": []}}

    repo = Repo()
    w = TaskWorker(repo, {"agentic": handler}, worker_id="w")
    asyncio.run(w._draai({"id": "t", "capability": "agentic", "lease_token": "L", "attempt": 1, "max_attempts": 3}))
    statussen = [s for s, _ in repo.overgangen]
    assert statussen == ["verifying", "blocked"]
    assert repo.overgangen[-1][1]["message"] == "HN down"


def test_missie_ziet_geblokkeerde_taak_en_blokkeert_met_reden():
    m = {"id": "m1", "title": "Idea scan (thinktank)", "goal": "g", "owner_agent": "thinktank",
         "status": "active", "current_milestone": 0, "metadata": {},
         "milestones": normaliseer_mijlpalen([{"title": "Idea scan", "task_id": "t1"}])}
    taak = {"id": "t1", "status": "blocked", "error": {"code": "agent_blocked", "message": "HN down"},
            "result": {"summary": "x", "verification": {"passed": True}}}
    b = beslis(m, taak, NU)
    assert b.status == "blocked" and b.velden["blocked_reason"] == "HN down"
    assert b.velden["last_stop_reason"] == "agent_blocked"


def test_taak_extra_laat_alleen_crew_door():
    assert taak_extra({"metadata": {"task_payload": {"crew": False, "verification": "skip"}}}) == {"crew": False}
    assert taak_extra({"metadata": {"task_payload": {"free_models": True}}}) == {"free_models": True}
    assert taak_extra({"metadata": {}}) == {}


# ── Het script in de container ───────────────────────────────────────────────

def _laad_routine(tmp_path, monkeypatch):
    monkeypatch.setenv("DAX_ARTIFACTS", str(tmp_path))
    spec = importlib.util.spec_from_file_location("dax_routine_test", dax_wacht.ROUTINE_BRON)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_routine_verify_eist_vers_artefact_en_verslag_met_bonnetje(tmp_path, monkeypatch, capsys):
    mod = _laad_routine(tmp_path, monkeypatch)
    monkeypatch.setitem(mod.WERK, "ideas", lambda: {"stories": [{"id": 1, "title": "x"}] * 10})
    assert mod.main(["ideas"]) == 0
    bon = json.loads(capsys.readouterr().out.strip())
    assert bon["ok"] and os.path.exists(bon["artifact"])

    assert mod.main(["verify", "ideas"]) == 0
    assert mod.main(["verify", "ideas", "--report", bon["report_path"]]) == 1   # geen verslag = niet klaar
    with open(bon["report_path"], "w") as f:
        f.write("Een verslag zonder bonnetje, dat lang genoeg is om de lengtecontrole te halen maar niets citeert.")
    assert mod.main(["verify", "ideas", "--report", bon["report_path"]]) == 1
    with open(bon["report_path"], "w") as f:
        f.write(f"Receipt: {bon['id']}\n\nTien verhalen gelezen; het artefact bevat ze met id en titel, zie hierboven.")
    assert mod.main(["verify", "ideas", "--report", bon["report_path"]]) == 0


def test_routine_verify_weigert_achteraf_bewerkt_artefact(tmp_path, monkeypatch):
    mod = _laad_routine(tmp_path, monkeypatch)
    monkeypatch.setitem(mod.WERK, "markets", lambda: {"instruments": [{"symbol": "GC=F", "last_close": 2400}]})
    assert mod.main(["markets"]) == 0
    pad = json.load(open(tmp_path / "markets" / "latest.json"))["path"]
    art = json.load(open(pad))
    art["data"]["instruments"][0]["last_close"] = 9999   # verzonnen koers
    json.dump(art, open(pad, "w"))
    assert mod.main(["verify", "markets"]) == 1


def test_routine_fout_schrijft_geen_artefact_maar_een_eerlijke_fout(tmp_path, monkeypatch, capsys):
    mod = _laad_routine(tmp_path, monkeypatch)

    def plat():
        raise mod.Mislukt("Yahoo HTTP 503")

    monkeypatch.setitem(mod.WERK, "energy", plat)
    assert mod.main(["energy"]) == 2
    assert not (tmp_path / "energy" / "latest.json").exists()
    capsys.readouterr()
    assert mod.main(["last-error", "energy"]) == 0
    assert "Yahoo HTTP 503" in capsys.readouterr().out
    assert mod.main(["verify", "energy"]) == 1


def test_alleen_gratis_slaat_betaalde_aanbieders_over(monkeypatch):
    import agent_loop
    monkeypatch.setenv("GROQ_API_KEY", "g")
    monkeypatch.setenv("OPENAI_API_KEY", "o")
    monkeypatch.setattr(agent_loop, "_AFKOELING", {})
    gevraagd = []

    async def nep_compat(contents, url, key, model):
        gevraagd.append(model)
        raise RuntimeError("429")

    async def nep_ollama(contents):
        gevraagd.append("ollama")
        return {"parts": [{"text": "ok"}]}

    async def nep_gemini(contents, key):
        gevraagd.append("gemini")
        raise RuntimeError("402")

    monkeypatch.setattr(agent_loop, "_call_openai_compat", nep_compat)
    monkeypatch.setattr(agent_loop, "_call_ollama_begrensd", nep_ollama)
    monkeypatch.setattr(agent_loop, "_call_gemini", nep_gemini)

    async def draai(gratis):
        gevraagd.clear()
        fiche = agent_loop._ALLEEN_GRATIS.set(gratis)
        try:
            await agent_loop._call_model([], "gemini-key")
            return list(gevraagd), agent_loop.motor_velden()
        finally:
            agent_loop._ALLEEN_GRATIS.reset(fiche)

    stappen, motor = asyncio.run(draai(True))
    assert "gemini" not in stappen and agent_loop.OPENAI_MODEL not in stappen
    assert stappen[-1] == "ollama" and agent_loop.GROQ_KLEIN_MODEL in stappen
    assert motor["engine"] == "ollama"
    stappen, _ = asyncio.run(draai(False))
    assert "gemini" in stappen and agent_loop.OPENAI_MODEL in stappen
