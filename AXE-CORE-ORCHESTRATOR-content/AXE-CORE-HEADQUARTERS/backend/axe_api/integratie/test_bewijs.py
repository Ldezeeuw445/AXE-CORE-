"""Definition of done, bewezen tegen een echte Postgres, echte workers en echte containers.

    B  autonoom doorwerken zonder frontend
    C  DAX-persistentie over container-herstart (bestand + browserprofiel)
    D  resourcegrens: nooit meer zware taken dan toegestaan, rest wacht en start vanzelf
    E  goedkeuring: niets verbodens draait, na akkoord hervat de missie zelf
    F  Home-status en tijdlijn komen uit echte rijen
    G  crash: worker sterft midden in een stap, niets wordt onterecht 'klaar'

Draait alleen als AXE_INTEGRATIE_PGRST/KEY/PSQL gezet zijn (bash integratie/start_testdb.sh).
C en de DAX-variant van B/E/G hebben ook een werkende `docker` nodig.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import pytest

HIER = Path(__file__).resolve().parent
sys.path.insert(0, str(HIER.parent))
sys.path.insert(0, str(HIER))

import omgeving  # noqa: E402

pytestmark = pytest.mark.skipif(not omgeving.beschikbaar(), reason="geen integratie-database (bash integratie/start_testdb.sh)")

DOCKER = shutil.which("docker") is not None and subprocess.run(
    ["docker", "info"], capture_output=True).returncode == 0
TEST_IMAGE = os.environ.get("AXE_INTEGRATIE_IMAGE", "axe-dax-test:latest")
LOGS = Path(os.environ.get("AXE_INTEGRATIE_LOGS", "/tmp/axe-integratie"))


# ── Hulpjes ──────────────────────────────────────────────────────────────────

def wacht_tot(voorwaarde, timeout: float = 90, stap: float = 0.5, wat: str = ""):
    eind = time.time() + timeout
    laatste = None
    while time.time() < eind:
        laatste = voorwaarde()
        if laatste:
            return laatste
        time.sleep(stap)
    raise AssertionError(f"timeout na {timeout}s: {wat} (laatste: {laatste!r})")


class Server:
    """De VPS-kant als los proces: worker-slots + missielus."""

    def __init__(self, naam: str, **env: str):
        self.naam = naam
        self.env = dict(os.environ, **{k: str(v) for k, v in env.items()})
        self.proc: subprocess.Popen | None = None

    def start(self) -> "Server":
        LOGS.mkdir(parents=True, exist_ok=True)
        log = open(LOGS / f"{self.naam}.log", "a")
        self.proc = subprocess.Popen([sys.executable, str(HIER / "server.py")], env=self.env,
                                     stdout=log, stderr=subprocess.STDOUT, cwd=str(HIER.parent))
        return self

    def kill9(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.send_signal(signal.SIGKILL)
            self.proc.wait(10)

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.kill9()


def basis_env(dax: bool, workspaces: Path) -> dict[str, str]:
    env = {
        "AXE_TASK_WORKSPACES": str(workspaces), "AXE_TASK_CONCURRENCY": "4", "TASK_LEASE_SECONDS": "12",
        "AXE_DAX_ENABLED": "1" if dax else "0", "AXE_DAX_MAX_HEAVY": "3", "AXE_TEST_STEP": "1",
        "AXE_DAX_DOCKER_EXTRA_ARGS": omgeving.docker_extra(),
    }
    return env


@pytest.fixture()
def db():
    omgeving.leeg()
    omgeving.sql(f"update core_dax_computers set image = '{TEST_IMAGE}'")
    return omgeving.db_factory()


@pytest.fixture()
def werkmap(tmp_path):
    p = tmp_path / "ws"
    p.mkdir()
    return p


def missie_rij(mission_id: str) -> dict[str, Any]:
    from missies import MissieRepository
    return MissieRepository(omgeving.db_factory()).haal(mission_id)["mission"]


def ruim_dax_op(*ids: str) -> None:
    for d in ids:
        subprocess.run(["docker", "rm", "-f", d], capture_output=True)
        for soort in ("workspace", "browser", "artifacts", "home"):
            subprocess.run(["docker", "volume", "rm", "-f", f"{d}-{soort}"], capture_output=True)


# ── B + F: autonoom doorwerken, en Home ziet het echt ────────────────────────

@pytest.mark.parametrize("met_dax", [False, pytest.param(True, marks=pytest.mark.skipif(not DOCKER, reason="geen docker"))])
def test_B_missie_loopt_door_zonder_frontend(db, werkmap, met_dax):
    from agent_activiteit import Activiteit
    from missies import MissieRepository

    if met_dax:
        ruim_dax_op("dax-developer-01")
    server = Server(f"B-{'dax' if met_dax else 'vps'}", **basis_env(met_dax, werkmap)).start()
    try:
        repo = MissieRepository(db)
        m = repo.maak({
            "title": "Finish AXON Memory", "goal": "Ship the three parts", "owner_agent": "developer",
            "milestones": ["Schema", "API", "UI"],
        })
        # Vanaf hier geen frontend, geen "ga door". Alleen kijken.
        klaar = wacht_tot(lambda: missie_rij(m["id"])["status"] == "completed" and missie_rij(m["id"]),
                          timeout=150, wat="missie completed")
        assert float(klaar["progress"]) == 1
        assert all((x.get("evidence") or {}).get("verification", {}).get("passed") for x in klaar["milestones"])

        data = repo.haal(m["id"])
        taken = data["tasks"]
        assert len(taken) == 3 and all(t["status"] == "completed" for t in taken)
        soorten = [e["event_type"] for e in data["events"]]
        assert soorten.count("milestone.completed") == 3
        assert "mission.completed" in soorten
        # Elke volgende stap werd door de lus gekozen, niet door een mens.
        gekozen = [e for e in data["events"] if e["event_type"] == "mission.action_chosen"]
        assert len(gekozen) == 3 and any("Continuing automatically" in (e["message"] or "") for e in gekozen)

        # Het werk staat echt op de computer waar het hoorde.
        if met_dax:
            uit = subprocess.run(["docker", "exec", "dax-developer-01", "bash", "-lc",
                                  "cat /dax/workspace/tasks/*/schema.txt"], capture_output=True, text=True)
            assert "done-schema" in uit.stdout and "dax-developer-01" in uit.stdout
            dax_events = omgeving.sql("select count(*) from core_task_events where event_type='dax.ready'")
            assert int(dax_events) == 3
        else:
            assert list(werkmap.rglob("schema.txt"))

        # F: Home-tijdlijn = echte rijen.
        act = Activiteit(db)
        dev = next(a for a in act.overzicht(["developer", "browser"]) if a["agent"] == "developer")
        assert dev["status"] == "MISSION_COMPLETE"
        for ev in dev["events"]:
            tabel = "core_task_events" if ev["source"] == "task" else "core_mission_events"
            kolom = "task_id" if ev["source"] == "task" else "mission_id"
            sleutel = ev["task_id"] if ev["source"] == "task" else ev["mission_id"]
            assert int(omgeving.sql(f"select count(*) from {tabel} where {kolom}='{sleutel}' "
                                    f"and event_type='{ev['event_type']}'")) >= 1
        browser = next(a for a in act.overzicht(["browser"]) if a["agent"] == "browser")
        assert browser["status"] == "SLEEPING"
    finally:
        server.stop()
        if met_dax:
            ruim_dax_op("dax-developer-01")


# ── C: DAX-persistentie ──────────────────────────────────────────────────────

@pytest.mark.skipif(not DOCKER, reason="geen docker")
def test_C_dax_bestand_en_browserprofiel_overleven_herstart(db):
    from dax import DaxRegister, DockerDaxRuntime

    ruim_dax_op("dax-developer-01")
    computer = DaxRegister(db).haal("dax-developer-01")
    rt = DockerDaxRuntime(extra_run_args=omgeving.docker_extra().split())
    try:
        assert rt.ensure_running(computer)["action"] == "created"
        assert rt.exec(computer, "echo blijft-bestaan > /dax/workspace/bewijs.txt")["exit_code"] == 0
        # Een lokale pagina, zodat cookies en localStorage een echte origin hebben.
        server = "cd /dax/artifacts && (python3 -m http.server 8765 >/dev/null 2>&1 &) && sleep 1"
        browser = "python3 /dax-bin/dax-browser"
        assert rt.exec(computer, server)["exit_code"] == 0
        zet = rt.exec(computer, f"{browser} eval http://127.0.0.1:8765/ "
                                "\"localStorage.setItem('axe','dax-profiel'); document.cookie='axe=1; max-age=86400; path=/'; 'gezet'\"",
                      timeout=120)
        assert zet["exit_code"] == 0, zet

        # Herstart: stop + start (DAX gaat slapen en wordt weer wakker).
        assert rt.stop(computer)["status"] == "stopped"
        assert rt.status(computer) == "exited"
        assert rt.ensure_running(computer)["action"] == "started"
        assert "blijft-bestaan" in rt.exec(computer, "cat /dax/workspace/bewijs.txt")["stdout"]
        rt.exec(computer, server)
        lees = rt.exec(computer, f"{browser} eval http://127.0.0.1:8765/ \"localStorage.getItem('axe') + '|' + document.cookie\"",
                       timeout=120)
        assert "dax-profiel|axe=1" in lees["stdout"], lees

        # Zelfs de container weggooien en opnieuw maken raakt de volumes niet.
        subprocess.run(["docker", "rm", "-f", "dax-developer-01"], check=True, capture_output=True)
        assert rt.ensure_running(computer)["action"] == "created"
        assert "blijft-bestaan" in rt.exec(computer, "cat /dax/workspace/bewijs.txt")["stdout"]
        rt.exec(computer, server)
        cookies = rt.exec(computer, f"{browser} cookies http://127.0.0.1:8765/", timeout=120)
        assert '"name": "axe"' in cookies["stdout"], cookies
        assert rt.stats(computer)["state"] == "running"
    finally:
        ruim_dax_op("dax-developer-01")


# ── D: resourcegrens ─────────────────────────────────────────────────────────

def test_D_nooit_meer_zware_taken_dan_toegestaan(db, monkeypatch):
    from dax import DaxRegister
    from task_runtime import TaskRepository
    from task_worker import run_slots

    monkeypatch.setenv("AXE_DAX_MAX_HEAVY", "3")
    repo = TaskRepository(db)
    agents = ["developer", "developer", "developer", "browser", "browser", "thinktank", "trading", "northsea"]
    for i, a in enumerate(agents):
        repo.create({"title": f"build {i}", "goal": "zwaar werk", "capability": "build", "assignee": a,
                     "payload": {"weight": "heavy", "agent": a}})

    tegelijk = {"nu": 0, "max": 0, "per": {}, "max_per": {}}
    slot = threading.Lock()
    klaar = []

    async def zwaar(task, ctx):
        a = task["assignee"]
        with slot:
            tegelijk["nu"] += 1
            tegelijk["per"][a] = tegelijk["per"].get(a, 0) + 1
            tegelijk["max"] = max(tegelijk["max"], tegelijk["nu"])
            tegelijk["max_per"][a] = max(tegelijk["max_per"].get(a, 0), tegelijk["per"][a])
        await asyncio.sleep(2)
        with slot:
            tegelijk["nu"] -= 1
            tegelijk["per"][a] -= 1
            klaar.append(task["id"])
        return {"summary": "built", "verification": {"passed": True, "checks": []}}

    import task_worker
    monkeypatch.setattr(task_worker, "DAX_DEFER_SECONDS", 1)
    monkeypatch.setattr(task_worker, "IDLE_MAX", 1)
    monkeypatch.setattr(task_worker, "SLEEPING_SECONDS", 1)
    stop = {"nu": False}

    async def draai():
        werk = asyncio.ensure_future(run_slots(repo, {"build": zwaar}, concurrency=8, lease_seconds=30,
                                               stop=lambda: stop["nu"], dax=DaxRegister(db)))
        eind = time.time() + 90
        while len(klaar) < len(agents) and time.time() < eind:
            await asyncio.sleep(0.3)
        stop["nu"] = True
        await asyncio.wait_for(werk, 30)

    asyncio.run(draai())
    assert len(klaar) == len(agents), "niet alles is uiteindelijk gedraaid"
    assert tegelijk["max"] == 3, tegelijk                     # globaal maximum gehaald, nooit overschreden
    assert tegelijk["max_per"].get("browser", 0) <= 1         # heavy_slots per computer
    assert tegelijk["max_per"].get("developer", 0) <= 2
    uitgesteld = int(omgeving.sql("select count(*) from core_task_events where event_type='task.deferred'"))
    assert uitgesteld >= 1                                     # de rest wachtte echt in de rij
    assert omgeving.sql("select count(*) from core_tasks where status='completed'") == str(len(agents))
    # Uitstellen kost geen poging.
    assert omgeving.sql("select max(attempt) from core_tasks") == "1"
    assert omgeving.sql("select count(*) from core_dax_slots") == "0"


# ── E: goedkeuring ───────────────────────────────────────────────────────────

@pytest.mark.parametrize("met_dax", [False, pytest.param(True, marks=pytest.mark.skipif(not DOCKER, reason="geen docker"))])
def test_E_goedkeuring_pauzeert_en_hervat_zelf(db, werkmap, met_dax):
    from agent_activiteit import Activiteit
    from missies import MissieRepository
    from task_runtime import TaskRepository

    if met_dax:
        ruim_dax_op("dax-developer-01")
    server = Server(f"E-{'dax' if met_dax else 'vps'}", **basis_env(met_dax, werkmap)).start()
    try:
        repo = MissieRepository(db)
        m = repo.maak({"title": "Ship iPad build", "goal": "Deploy and confirm", "owner_agent": "developer",
                       "milestones": ["Deploy the build", "Confirm"]})
        wacht_tot(lambda: missie_rij(m["id"])["status"] == "waiting_approval", 90, wat="waiting_approval")

        def marker_bestaat() -> bool:
            if met_dax:
                return subprocess.run(["docker", "exec", "dax-developer-01", "bash", "-lc",
                                       "ls /dax/workspace/tasks/*/APPROVED_STEP_RAN"], capture_output=True).returncode == 0
            return bool(list(werkmap.rglob("APPROVED_STEP_RAN")))

        time.sleep(3)
        assert not marker_bestaat(), "de verboden stap draaide zonder akkoord"
        missie = missie_rij(m["id"])
        assert missie["milestones"][0]["task_id"]     # staat bewaard
        dev = Activiteit(db).overzicht(["developer"])[0]
        assert dev["status"] == "WAITING_APPROVAL"     # F: Home ziet de wachtstand

        trepo = TaskRepository(db)
        vraag = trepo.list_approvals()[0]
        assert "git commit" in vraag["title"]
        trepo.decide_approval(vraag["task_id"], vraag["id"], True, "luka", "ok")

        klaar = wacht_tot(lambda: missie_rij(m["id"])["status"] == "completed" and missie_rij(m["id"]), 120,
                          wat="missie hervat en klaar")
        assert marker_bestaat()
        soorten = [e["event_type"] for e in repo.haal(m["id"])["events"]]
        assert "mission.waiting_approval" in soorten and "mission.resumed" in soorten
        assert klaar["milestones"][0]["task_id"] == vraag["task_id"]   # dezelfde taak hervat, geen nieuwe
    finally:
        server.stop()
        if met_dax:
            ruim_dax_op("dax-developer-01")


# ── G: crash ─────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("met_dax", [False, pytest.param(True, marks=pytest.mark.skipif(not DOCKER, reason="geen docker"))])
def test_G_crash_midden_in_een_stap(db, werkmap, met_dax):
    from missies import MissieRepository

    if met_dax:
        ruim_dax_op("dax-developer-01")
    env = dict(basis_env(met_dax, werkmap), AXE_TEST_SLOW="20")
    eerste = Server(f"G1-{'dax' if met_dax else 'vps'}", **env).start()
    tweede = None
    try:
        repo = MissieRepository(db)
        m = repo.maak({"title": "Long build", "goal": "Survive a crash", "owner_agent": "developer",
                       "milestones": ["Slow build", "Package"]})
        taak_id = wacht_tot(lambda: (missie_rij(m["id"])["milestones"][0].get("task_id")), 60, wat="taak gekozen")
        wacht_tot(lambda: omgeving.sql(f"select status from core_tasks where id='{taak_id}'") == "running", 60,
                  wat="taak draait")
        time.sleep(4)   # midden in de sleep van 20s
        eerste.kill9()

        assert omgeving.sql(f"select status from core_tasks where id='{taak_id}'") == "running"
        assert missie_rij(m["id"])["status"] == "active"           # niet onterecht klaar
        assert missie_rij(m["id"])["milestones"][0]["status"] == "working"

        tweede = Server(f"G2-{'dax' if met_dax else 'vps'}", **env).start()
        klaar = wacht_tot(lambda: missie_rij(m["id"])["status"] == "completed" and missie_rij(m["id"]), 150,
                          wat="herstel na crash")
        pogingen = omgeving.sql(f"select attempt from core_tasks where id='{taak_id}'")
        assert pogingen == "2", f"verwacht herclaim door de nieuwe worker, attempt={pogingen}"
        claims = omgeving.sql(f"select count(*) from core_task_events where task_id='{taak_id}' and event_type='task.claimed'")
        assert claims == "2"
        assert klaar["milestones"][0]["task_id"] == taak_id
    finally:
        eerste.kill9()
        if tweede:
            tweede.stop()
        if met_dax:
            ruim_dax_op("dax-developer-01")


# ── HTTP: de router die Home leest ───────────────────────────────────────────

def test_http_router(db):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from missie_api import maak_router

    app = FastAPI()
    app.include_router(maak_router(db))
    c = TestClient(app)
    r = c.post("/missions", json={"title": "NorthSea sourcing", "goal": "Find counterparties",
                                  "owner_agent": "northsea", "milestones": ["Scan"], "recurring_interval_seconds": 3600})
    assert r.status_code == 202, r.text
    mid = r.json()["mission"]["id"]
    assert c.post("/missions", json={"title": "x", "goal": "y", "owner_agent": "ghost"}).status_code == 422
    assert c.get(f"/missions/{mid}").json()["events"][0]["event_type"] == "mission.assigned"
    assert c.post(f"/missions/{mid}/pause", json={"reason": "test"}).json()["mission"]["status"] == "paused"
    assert c.post(f"/missions/{mid}/resume", json={"note": "go"}).json()["mission"]["status"] == "active"
    act = c.get("/agents/activity").json()["agents"]
    assert {a["agent"] for a in act} >= {"developer", "northsea", "browser"}
    assert all(a["status"] in ("SLEEPING", "QUEUED", "MONITORING") for a in act)
    assert c.get("/observability").json()["dax"]["computers"]
    assert "summary" in c.get("/axe/since?hours=1").json()
    assert c.get("/dax").json()["computers"][0]["id"] == "dax-browser-01"
    assert c.get("/agents/ghost/events").status_code == 404


# ── De axe-CLI, end-to-end: CLI → HTTP → Postgres ────────────────────────────

def test_cli_missie_aanmaken_en_volgen(db):
    import json
    import socket

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        poort = s.getsockname()[1]
    env = dict(os.environ, AXE_API_KEY="cli-test-sleutel")
    api = subprocess.Popen([sys.executable, "-m", "uvicorn", "api_server:app", "--port", str(poort), "--log-level", "warning"],
                           cwd=str(HIER), env=env)
    cli = HIER.parents[2] / "cli" / "axe"
    cli_env = dict(env, AXE_API_URL=f"http://127.0.0.1:{poort}")

    def axe(*args: str) -> dict[str, Any]:
        p = subprocess.run([sys.executable, str(cli), *args], capture_output=True, text=True, env=cli_env, timeout=30)
        return json.loads(p.stdout)

    try:
        wacht_tot(lambda: subprocess.run(["curl", "-s", f"http://127.0.0.1:{poort}/missions"],
                                         capture_output=True).returncode == 0, 20, wat="api up")
        zonder = axe("missions", "create", "--title", "AXON", "--goal", "ship", "--agent", "developer", "--steps", "a; b")
        assert zonder["status"] == "usage"                      # schrijven vraagt --write
        uit = axe("missions", "create", "--write", "--title", "Finish AXON Memory", "--goal", "ship it",
                  "--agent", "developer", "--steps", "Schema; API; UI")
        assert uit["ok"], uit
        mid = uit["result"]["mission"]["id"]
        assert len(uit["result"]["mission"]["milestones"]) == 3
        assert axe("missions", "show", mid)["result"]["events"][0]["event_type"] == "mission.assigned"
        assert axe("missions", "pause", "--write", mid)["result"]["mission"]["status"] == "paused"
        assert axe("missions", "resume", "--write", mid, "--note", "go on")["result"]["mission"]["next_action"] == "go on"
        act = axe("agents", "activity")["result"]["agents"]
        assert any(a["agent"] == "developer" for a in act)
        assert axe("observe")["ok"] and axe("dax", "list")["result"]["computers"]
    finally:
        api.terminate()
        api.wait(10)


@pytest.mark.skipif(not DOCKER, reason="geen docker")
def test_dax_gaat_slapen_en_wordt_wakker(db):
    from dax import DaxRegister, DockerDaxRuntime, slaap_inactieven

    ruim_dax_op("dax-browser-01")
    reg = DaxRegister(db)
    rt = DockerDaxRuntime(extra_run_args=omgeving.docker_extra().split())
    c = reg.haal("dax-browser-01")
    try:
        rt.ensure_running(c)
        rt.exec(c, "echo wakker > /dax/workspace/w.txt")
        reg.meld(c.id, status="running")
        omgeving.sql("update core_dax_computers set last_heartbeat_at = now() - interval '2 hours' where id='dax-browser-01'")
        assert slaap_inactieven(reg, idle_seconden=600, runtime_factory=lambda _c: rt) == ["dax-browser-01"]
        assert rt.status(c) == "exited"
        assert reg.haal("dax-browser-01").status == "sleeping"
        assert rt.ensure_running(c)["action"] == "started"
        assert "wakker" in rt.exec(c, "cat /dax/workspace/w.txt")["stdout"]
    finally:
        ruim_dax_op("dax-browser-01")
