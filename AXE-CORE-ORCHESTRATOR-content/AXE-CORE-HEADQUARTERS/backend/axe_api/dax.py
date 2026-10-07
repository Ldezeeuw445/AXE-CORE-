"""DAX — Dedicated Agent eXecutor: de vaste computer waarop een agent werkt.

Agent Workspace (agent_workspace.py) = WIE de agent is: rol, prompt, tools,
geheugen, crew. DAX = WAAR hij uitvoert: shell, bestanden, browserprofiel,
processen, geïnstalleerde software, resourcegrenzen. Die twee worden niet
gemengd; een werkplek wijst alleen naar een DAX-id.

## Waar draait een DAX

Achter één interface (DaxRuntime), zodat de computer kan verhuizen zonder dat
iets erboven verandert:

  * DockerDaxRuntime -- een container op de STRATO-VPS (de compute plane). De
    control plane praat met die Docker via DOCKER_HOST=ssh://... -- de docker
    CLI kan dat zelf, er hoeft op STRATO geen eigen API te draaien.
  * LocalDaxRuntime  -- een map op de machine zelf (Mac mini, test, noodgeval).

Een andere server, een cloud-VM of een Mac Mini met Docker is dezelfde
DockerDaxRuntime met een andere AXE_DAX_DOCKER_HOST_<HOST>.

## Wat blijft bestaan

Per computer vier named volumes: workspace, browser-profiel, artifacts en
home (daar staan ook de CLI-logins van Claude Code/Codex als je die in de
container doet). Een container stoppen, herstarten of opnieuw aanmaken raakt
ze niet. Niets hier verwijdert ooit een volume.

## Hoeveel tegelijk

Zware taken (een agent met een DAX, browser, builds) vragen eerst een slot
via acquire_dax_slot: globaal AXE_DAX_MAX_HEAVY (default 3, voor 16 GB) en
per computer heavy_slots. Geen plek → de taak gaat terug in de rij zonder dat
het een poging kost (defer_core_task) en start vanzelf als er plek komt.
"""
from __future__ import annotations

import json
import logging
import os
import posixpath
import shlex
import subprocess
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol

log = logging.getLogger("axe_dax")

DAX_WORKSPACE = "/dax/workspace"
DAX_BROWSER = "/dax/browser-profile"
DAX_ARTIFACTS = "/dax/artifacts"
DAX_HOME = "/home/dax"
EXEC_TIMEOUT = int(os.environ.get("AXE_DAX_EXEC_TIMEOUT", "600"))


def dax_aan() -> bool:
    """DAX staat pas aan als Luka het aanzet. Zonder dit gedraagt alles zich als voorheen."""
    return os.environ.get("AXE_DAX_ENABLED", "0").strip().lower() in ("1", "true", "yes", "on")


def max_zwaar() -> int:
    return max(1, int(os.environ.get("AXE_DAX_MAX_HEAVY", "3")))


@dataclass
class DaxComputer:
    id: str
    owner_agent: str
    members: list[str] = field(default_factory=list)
    runtime: str = "docker"
    host: str = "strato"
    container_name: str | None = None
    image: str = "axe-dax-base:latest"
    status: str = "unknown"
    cpu_limit: float = 2
    memory_limit_mb: int = 3072
    heavy_slots: int = 1
    volumes: dict[str, str] = field(default_factory=dict)

    @classmethod
    def uit_rij(cls, rij: dict[str, Any]) -> "DaxComputer":
        return cls(
            id=rij["id"], owner_agent=rij.get("owner_agent") or "",
            members=list(rij.get("members") or []), runtime=rij.get("runtime") or "docker",
            host=rij.get("host") or "strato", container_name=rij.get("container_name") or rij["id"],
            image=rij.get("image") or "axe-dax-base:latest", status=rij.get("status") or "unknown",
            cpu_limit=float(rij.get("cpu_limit") or 2), memory_limit_mb=int(rij.get("memory_limit_mb") or 3072),
            heavy_slots=int(rij.get("heavy_slots") or 1), volumes=dict(rij.get("volumes") or {}),
        )

    def volume(self, soort: str) -> str:
        return self.volumes.get(soort) or f"{self.id}-{soort}"

    @property
    def naam(self) -> str:
        return self.container_name or self.id


# ── Runtime-interface ────────────────────────────────────────────────────────

class DaxRuntime(Protocol):
    def ensure_running(self, c: DaxComputer) -> dict[str, Any]: ...
    def stop(self, c: DaxComputer) -> dict[str, Any]: ...
    def status(self, c: DaxComputer) -> str: ...
    def exec(self, c: DaxComputer, command: str, cwd: str | None = None,
             timeout: int = EXEC_TIMEOUT, stdin: str | None = None) -> dict[str, Any]: ...
    def stats(self, c: DaxComputer) -> dict[str, Any]: ...


def _uitkomst(proc: subprocess.CompletedProcess) -> dict[str, Any]:
    return {"exit_code": proc.returncode, "stdout": (proc.stdout or "")[-20000:], "stderr": (proc.stderr or "")[-8000:]}


class DockerDaxRuntime:
    """Docker via de CLI. DOCKER_HOST bepaalt waar: lokaal of ssh://root@strato."""

    def __init__(self, docker_host: str | None = None, extra_run_args: list[str] | None = None,
                 runner: Callable[..., subprocess.CompletedProcess] = subprocess.run):
        self.docker_host = docker_host
        self.extra_run_args = list(extra_run_args or [])
        self._run = runner

    def _docker(self, *args: str, timeout: int = 120, stdin: str | None = None) -> subprocess.CompletedProcess:
        env = dict(os.environ)
        if self.docker_host:
            env["DOCKER_HOST"] = self.docker_host
        return self._run(["docker", *args], capture_output=True, text=True, timeout=timeout, env=env, input=stdin)

    def status(self, c: DaxComputer) -> str:
        p = self._docker("inspect", "-f", "{{.State.Status}}", c.naam, timeout=30)
        if p.returncode != 0:
            return "missing"
        return (p.stdout or "").strip() or "unknown"

    def _host_cpus(self) -> float | None:
        if not hasattr(self, "_ncpu"):
            p = self._docker("info", "--format", "{{.NCPU}}", timeout=30)
            try:
                self._ncpu = float((p.stdout or "").strip())
            except ValueError:
                self._ncpu = None
        return self._ncpu

    def run_args(self, c: DaxComputer) -> list[str]:
        # Docker weigert --cpus boven het aantal cores van de host. Het register
        # zegt wat een DAX mag; de host bepaalt wat er is.
        cpus = c.cpu_limit
        host = self._host_cpus()
        if host:
            cpus = min(cpus, host)
        return [
            "run", "-d", "--name", c.naam, "--hostname", c.naam,
            "--restart", "unless-stopped",
            "--cpus", f"{cpus:g}", "--memory", f"{c.memory_limit_mb}m",
            "--memory-swap", f"{c.memory_limit_mb}m", "--pids-limit", "1024",
            "--label", "axe.dax=1", "--label", f"axe.dax.id={c.id}",
            "-e", f"DAX_ID={c.id}", "-e", f"DAX_BROWSER_PROFILE={DAX_BROWSER}",
            "-v", f"{c.volume('workspace')}:{DAX_WORKSPACE}",
            "-v", f"{c.volume('browser')}:{DAX_BROWSER}",
            "-v", f"{c.volume('artifacts')}:{DAX_ARTIFACTS}",
            "-v", f"{c.volume('home')}:{DAX_HOME}",
            *self.extra_run_args,
            c.image,
        ]

    def ensure_running(self, c: DaxComputer) -> dict[str, Any]:
        huidig = self.status(c)
        if huidig == "running":
            return {"status": "running", "action": "none"}
        if huidig == "missing":
            p = self._docker(*self.run_args(c), timeout=300)
            actie = "created"
        else:
            p = self._docker("start", c.naam, timeout=120)
            actie = "started"
        if p.returncode != 0:
            raise RuntimeError(f"DAX {c.id} could not start: {(p.stderr or p.stdout)[-500:]}")
        return {"status": "running", "action": actie}

    def stop(self, c: DaxComputer) -> dict[str, Any]:
        """Slapen: container stopt, volumes blijven. Nooit `rm -v`."""
        p = self._docker("stop", "-t", "20", c.naam, timeout=60)
        return {"status": "stopped" if p.returncode == 0 else "error", "detail": (p.stderr or "")[-300:]}

    def exec(self, c: DaxComputer, command: str, cwd: str | None = None,
             timeout: int = EXEC_TIMEOUT, stdin: str | None = None) -> dict[str, Any]:
        werkmap = cwd or DAX_WORKSPACE
        args = ["exec"]
        if stdin is not None:
            args.append("-i")
        args += ["-w", "/", c.naam, "bash", "-lc",
                 f"mkdir -p {shlex.quote(werkmap)} && cd {shlex.quote(werkmap)} && {command}"]
        try:
            return _uitkomst(self._docker(*args, timeout=timeout, stdin=stdin))
        except subprocess.TimeoutExpired:
            return {"exit_code": 124, "stdout": "", "stderr": f"Timed out after {timeout}s in {c.id}."}

    def stats(self, c: DaxComputer) -> dict[str, Any]:
        p = self._docker("stats", "--no-stream", "--format", "{{json .}}", c.naam, timeout=30)
        if p.returncode != 0 or not (p.stdout or "").strip():
            return {"state": self.status(c)}
        try:
            ruw = json.loads(p.stdout.strip().splitlines()[0])
        except json.JSONDecodeError:
            return {"state": "unknown"}
        return {"state": "running", "cpu": ruw.get("CPUPerc"), "memory": ruw.get("MemUsage"),
                "memory_pct": ruw.get("MemPerc"), "pids": ruw.get("PIDs"), "net": ruw.get("NetIO"),
                "block": ruw.get("BlockIO")}

    def schijf(self) -> dict[str, Any]:
        """Docker-schijfgebruik van de hele host (images, volumes, build cache)."""
        p = self._docker("system", "df", "--format", "{{json .}}", timeout=60)
        rijen = []
        for regel in (p.stdout or "").splitlines():
            try:
                rijen.append(json.loads(regel))
            except json.JSONDecodeError:
                pass
        return {"docker": rijen}


class LocalDaxRuntime:
    """Een DAX als gewone map. Voor de Mac mini, tests, of als Docker er niet is."""

    def __init__(self, root: str | None = None):
        self.root = root or os.environ.get("AXE_DAX_LOCAL_ROOT", "/opt/axe-dax")

    def _pad(self, c: DaxComputer, pad: str) -> str:
        # /dax/workspace/x → <root>/<id>/workspace/x ; relatieve paden in workspace.
        if pad.startswith("/dax/"):
            rest = pad[len("/dax/"):]
            soort, _, sub = rest.partition("/")
            soort = {"browser-profile": "browser"}.get(soort, soort)
            return os.path.join(self.root, c.id, soort, sub)
        if pad.startswith(DAX_HOME):
            return os.path.join(self.root, c.id, "home", pad[len(DAX_HOME):].lstrip("/"))
        if os.path.isabs(pad):
            return pad
        return os.path.join(self.root, c.id, "workspace", pad)

    def status(self, c: DaxComputer) -> str:
        return "running" if os.path.isdir(os.path.join(self.root, c.id)) else "missing"

    def ensure_running(self, c: DaxComputer) -> dict[str, Any]:
        bestond = self.status(c) == "running"
        for soort in ("workspace", "browser", "artifacts", "home"):
            os.makedirs(os.path.join(self.root, c.id, soort), exist_ok=True)
        return {"status": "running", "action": "none" if bestond else "created"}

    def stop(self, c: DaxComputer) -> dict[str, Any]:
        return {"status": "stopped"}

    def exec(self, c: DaxComputer, command: str, cwd: str | None = None,
             timeout: int = EXEC_TIMEOUT, stdin: str | None = None) -> dict[str, Any]:
        werkmap = self._pad(c, cwd or DAX_WORKSPACE)
        os.makedirs(werkmap, exist_ok=True)
        env = dict(os.environ, DAX_ID=c.id, DAX_BROWSER_PROFILE=self._pad(c, DAX_BROWSER),
                   HOME=self._pad(c, DAX_HOME))
        try:
            return _uitkomst(subprocess.run(command, shell=True, cwd=werkmap, capture_output=True,
                                            text=True, timeout=timeout, input=stdin, env=env))
        except subprocess.TimeoutExpired:
            return {"exit_code": 124, "stdout": "", "stderr": f"Timed out after {timeout}s in {c.id}."}

    def stats(self, c: DaxComputer) -> dict[str, Any]:
        return {"state": self.status(c)}


def runtime_voor(c: DaxComputer) -> DaxRuntime:
    if c.runtime == "local":
        return LocalDaxRuntime()
    sleutel = f"AXE_DAX_DOCKER_HOST_{c.host.upper().replace('-', '_')}"
    host = os.environ.get(sleutel) or os.environ.get("AXE_DAX_DOCKER_HOST") or None
    extra = shlex.split(os.environ.get("AXE_DAX_DOCKER_EXTRA_ARGS", ""))
    return DockerDaxRuntime(docker_host=host, extra_run_args=extra)


# ── Uitvoerder voor de agent-lus ─────────────────────────────────────────────

class DaxUitvoerder:
    """Eén taak op één DAX: wat agent_loop._shell/_read/_write gebruiken.

    `werkmap` is de privémap van deze taak binnen de persistente workspace, zodat
    parallelle taken op dezelfde computer elkaars bestanden niet raken maar
    wel alles van eerder terugvinden (/dax/workspace blijft).
    """

    def __init__(self, computer: DaxComputer, runtime: DaxRuntime, werkmap: str):
        self.computer = computer
        self.runtime = runtime
        self.werkmap = werkmap

    def pad(self, pad: str) -> str:
        return pad if pad.startswith("/") else posixpath.join(self.werkmap, pad)

    def shell(self, command: str, cwd: str | None = None) -> dict[str, Any]:
        return self.runtime.exec(self.computer, command, cwd=self.pad(cwd) if cwd else self.werkmap)

    def lees(self, pad: str, max_bytes: int = 60000) -> dict[str, Any]:
        uit = self.runtime.exec(self.computer, f"head -c {max_bytes + 1} {shlex.quote(self.pad(pad))}", cwd=self.werkmap)
        if uit["exit_code"] != 0:
            return {"error": uit["stderr"][-500:] or f"cannot read {pad}"}
        data = uit["stdout"]
        return {"content": data[:max_bytes], "truncated": len(data) > max_bytes}

    def schrijf(self, pad: str, inhoud: str) -> dict[str, Any]:
        doel = self.pad(pad)
        uit = self.runtime.exec(
            self.computer,
            f"mkdir -p {shlex.quote(posixpath.dirname(doel) or '/')} && cat > {shlex.quote(doel)}",
            cwd=self.werkmap, stdin=inhoud,
        )
        if uit["exit_code"] != 0:
            return {"error": uit["stderr"][-500:] or f"cannot write {pad}"}
        return {"bytes_written": len(inhoud.encode()), "path": doel, "dax": self.computer.id}


# ── Register en capaciteit ───────────────────────────────────────────────────

class DaxRegister:
    def __init__(self, client_factory: Callable[[], Any]):
        self._client_factory = client_factory

    def _db(self) -> Any:
        return self._client_factory()

    def lijst(self) -> list[DaxComputer]:
        return [DaxComputer.uit_rij(r) for r in (self._db().table("core_dax_computers").select("*").order("id").execute().data or [])]

    def rijen(self) -> list[dict[str, Any]]:
        return self._db().table("core_dax_computers").select("*").order("id").execute().data or []

    def haal(self, dax_id: str) -> DaxComputer | None:
        rijen = self._db().table("core_dax_computers").select("*").eq("id", dax_id).limit(1).execute().data
        return DaxComputer.uit_rij(rijen[0]) if rijen else None

    def voor_agent(self, agent: str) -> DaxComputer | None:
        from agent_workspace import laad_workspace
        dax_id = laad_workspace(agent).get("dax_computer")
        return self.haal(dax_id) if dax_id else None

    def meld(self, dax_id: str, *, status: str | None = None, stats: dict[str, Any] | None = None,
             fout: str | None = None) -> None:
        from datetime import datetime, timezone
        patch: dict[str, Any] = {"last_heartbeat_at": datetime.now(timezone.utc).isoformat(),
                                 "updated_at": datetime.now(timezone.utc).isoformat()}
        if status:
            patch["status"] = status
        if stats is not None:
            patch["stats"] = stats
        if fout is not None:
            patch["last_error"] = fout[:1000]
        self._db().table("core_dax_computers").update(patch).eq("id", dax_id).execute()

    def slot(self, task_id: str, dax_id: str | None, worker_id: str, *, weight: str = "heavy",
             lease_seconds: int = 900) -> bool:
        return bool(self._db().rpc("acquire_dax_slot", {
            "p_task_id": task_id, "p_computer_id": dax_id, "p_worker_id": worker_id,
            "p_global_max": max_zwaar(), "p_lease_seconds": lease_seconds, "p_weight": weight,
        }).execute().data)

    def geef_vrij(self, task_id: str) -> None:
        self._db().rpc("release_dax_slot", {"p_task_id": task_id}).execute()

    def bezette_slots(self) -> list[dict[str, Any]]:
        return self._db().table("core_dax_slots").select("*").execute().data or []


def zwaar(task: dict[str, Any]) -> bool:
    """Telt deze taak als zware DAX-taak? Zelfde regel in worker en motor."""
    payload = task.get("payload") or {}
    if payload.get("weight") in ("heavy", "light"):
        return payload["weight"] == "heavy"
    if task.get("capability") in ("browser", "build"):
        return True
    try:
        from agent_workspace import laad_workspace
        return bool(laad_workspace(str(task.get("assignee") or payload.get("agent") or "axe")).get("dax_computer"))
    except Exception:
        return False


# ── Slapen als er niets te doen is ───────────────────────────────────────────

def slaap_inactieven(register: DaxRegister, *, idle_seconden: int | None = None,
                     runtime_factory: Callable[[DaxComputer], DaxRuntime] = runtime_voor) -> list[str]:
    """Stop DAX-containers zonder slot die al `idle_seconden` niets deden.

    Stoppen, niet verwijderen: de volumes (workspace, browserprofiel, home)
    blijven, en ensure_running maakt hem bij de volgende taak weer wakker.
    Zo draaien op de 16 GB STRATO niet vijf containers voor niets.
    """
    from datetime import datetime, timedelta, timezone
    grens = datetime.now(timezone.utc) - timedelta(
        seconds=idle_seconden if idle_seconden is not None else int(os.environ.get("AXE_DAX_IDLE_SLEEP", "1800")))
    bezet = {s.get("computer_id") for s in register.bezette_slots()}
    gestopt = []
    for rij in register.rijen():
        if rij.get("status") != "running" or rij["id"] in bezet:
            continue
        laatst = rij.get("last_heartbeat_at")
        try:
            moment = datetime.fromisoformat(str(laatst).replace("Z", "+00:00")) if laatst else None
        except ValueError:
            moment = None
        if moment and moment > grens:
            continue
        computer = DaxComputer.uit_rij(rij)
        uit = runtime_factory(computer).stop(computer)
        register.meld(computer.id, status="sleeping" if uit.get("status") == "stopped" else "error",
                      fout=None if uit.get("status") == "stopped" else str(uit.get("detail")))
        gestopt.append(computer.id)
    return gestopt
