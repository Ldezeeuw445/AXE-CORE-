"""DAX-wacht: houdt elke DAX-bot wakker, meet hem, en geeft hem zijn vaste werk.

## Waarom dit bestaat (gemeten 11 okt 2026)

De DAX-laag (dax.py) startte een computer pas als er een taak voor die agent
kwam, schreef alleen dán een heartbeat, en legde hem na 30 minuten weer te
slapen. Er gaf alleen niemand de bots werk: in core_missions stonden er twee
missies, allebei eenmalig en klaar sinds 7 okt. Dus: browser/northsea/thinktank
"sleeping", developer en trading "provisioned" zonder ooit een heartbeat, want
voor hen was er nooit één taak geweest. Niets automatisch.

## Wat dit doet, elke ronde (core_schedules-job `axe_core:dax-wacht`, VPS, via /cron/tick)

Per computer in core_dax_computers:
  1. always-on → container draaiend houden (ensure_running; volumes blijven).
  2. heartbeat: een korte meting ÍN de container (uptime, geheugen van de host,
     schijf, Chromium/git/python, netwerk, of Claude/Codex daar zijn ingelogd)
     → last_heartbeat_at + stats. Geen meting = status error met de reden.
  3. dax-routine (dax_routine.py) in de container zetten of bijwerken (sha).
  4. eisen van de bot naast de meting leggen. Ontbreekt er iets (geen netwerk,
     geen Chromium, geen model, de modelbox heeft te weinig geheugen vrij), dan
     wordt zijn vaste missie BLOCKED met precies die reden -- er wordt dan geen
     taak gestart die alleen maar kan doen alsof.
  5. de vaste missie bestaan laten: een doorlopende missie (recurring) per bot.
     De bestaande missielus maakt daar gewone core_tasks van; de bestaande worker
     voert ze uit op déze computer. Geblokkeerd door een eis die terug is → weer
     actief. Geblokkeerd om een andere reden → na één interval nog eens proberen
     (always-on), en weer eerlijk blocked als het opnieuw niet lukt.

Geen tweede scheduler, geen eigen lus: dit is één job op de bestaande planner.
Geen LLM in deze ronde. Gepauzeerd of "beslissing nodig" blijft van Luka.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from dax import DaxComputer, DaxRegister, altijd_aan, runtime_voor

log = logging.getLogger("axe_dax_wacht")

ROUTINE_PAD = "/home/dax/.local/bin/dax-routine"
ROUTINE_BRON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dax_routine.py")
# Onder deze grens start een bot geen nieuw werk: Ollama op dezelfde modelbox gaat voor.
MIN_VRIJ_MB = int(os.environ.get("AXE_DAX_MIN_FREE_MB", "1500"))
EINDE = {"completed", "failed", "cancelled"}
RUNNABLE = {"active", "monitoring", "waiting_agent", "waiting_approval"}

# Meting in de container. Alles met een standaardwaarde, zodat een ontbrekend
# hulpmiddel een false/0 wordt en nooit kapotte JSON.
HARTSLAG = r"""
set +e
b(){ command -v "$1" >/dev/null 2>&1 && echo true || echo false; }
f(){ [ -s "$1" ] && echo true || echo false; }
code(){ c=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$1" 2>/dev/null); echo "${c:-0}"; }
mem_av=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
mem_tot=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null)
cg=$(cat /sys/fs/cgroup/memory.current 2>/dev/null)
disk=$(df -Pm /dax/workspace 2>/dev/null | awk 'NR==2{print $4}')
start=$(stat -c %Y /proc/1 2>/dev/null)
up=$(( $(date +%s) - ${start:-$(date +%s)} ))
chrom=$(ls -d /ms-playwright/chromium* >/dev/null 2>&1 && echo true || echo false)
gh=$(code https://github.com)
hn=$(code https://hacker-news.firebaseio.com/v0/maxitem.json)
rsha=$(sha256sum "$HOME/.local/bin/dax-routine" 2>/dev/null | cut -c1-64)
printf '{"dax_id":"%s","uptime_s":%s,"host_mem_available_mb":%s,"host_mem_total_mb":%s,"container_mem_mb":%s,"disk_free_mb":%s,"tools":{"python3":%s,"git":%s,"node":%s,"curl":%s,"chromium":%s,"dax_browser":%s},"net":{"github":%s,"public_api":%s},"engines":{"claude_installed":%s,"claude_logged_in":%s,"codex_installed":%s,"codex_logged_in":%s},"routine_sha":"%s"}\n' \
  "${DAX_ID:-?}" "${up:-0}" "${mem_av:-0}" "${mem_tot:-0}" "$(( ${cg:-0} / 1048576 ))" "${disk:-0}" \
  "$(b python3)" "$(b git)" "$(b node)" "$(b curl)" "$chrom" "$(b dax-browser)" \
  "$gh" "$hn" \
  "$(b claude)" "$(f "$HOME/.claude/.credentials.json")" "$(b codex)" "$(f "$HOME/.codex/auth.json")" \
  "${rsha:-}"
"""


@dataclass(frozen=True)
class Routine:
    """Het vaste werk van één bot."""
    naam: str               # dax-routine <naam>
    titel: str
    wat: str                # wat het script echt doet (voor de opdracht en de UI)
    focus: str              # waar het verslag over gaat
    interval_s: int
    eisen: tuple[str, ...] = ("net", "python3")
    verslag: bool = True    # False = alleen-lezen agent: verslag in de samenvatting, geen bestand
    notities: tuple[str, ...] = field(default_factory=tuple)


ROUTINES: dict[str, Routine] = {
    "browser": Routine(
        "sites", "Site watch",
        "open Luka's public sites in the persistent DAX browser, record HTTP status, page title and a screenshot",
        "which sites are up, their status codes, titles and response times", 6 * 3600,
        eisen=("net", "python3", "chromium", "dax_browser")),
    "trading": Routine(
        "markets", "Market data check",
        "fetch 3 months of daily closes for gold, EUR/USD and the S&P 500 and compute SMA20/SMA50/RSI14",
        "last close, 1d/5d change, SMA20 vs SMA50 and RSI14 per instrument (facts only, no trade advice)", 6 * 3600),
    "northsea": Routine(
        "energy", "Energy market snapshot",
        "fetch daily closes for Brent, WTI, Henry Hub gas and heating oil and compute changes and averages",
        "last close and 1d/5d change per contract, read-only context for the desk", 6 * 3600,
        verslag=False),
    "thinktank": Routine(
        "ideas", "Idea scan",
        "read the current Hacker News top 20 (title, url, score)",
        "three concrete ideas for AXE, each citing the HN story id it came from", 12 * 3600),
    "developer": Routine(
        "ci", "Orchestrator health check",
        "fetch the public orchestrator branch, run compileall on backend/axe_api and the pure backend tests",
        "commit sha, compile result, pytest summary and every failing test by name (no fixes, nothing pushed)", 12 * 3600,
        eisen=("net", "python3", "git", "github"),
        notities=("Code changes need Claude Code or Codex logged in inside this DAX; pushing always needs Luka's OK.",)),
}


def routine_sha() -> str:
    with open(ROUTINE_BRON, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def lees_hartslag(stdout: str) -> dict[str, Any]:
    for regel in reversed((stdout or "").strip().splitlines()):
        regel = regel.strip()
        if regel.startswith("{"):
            return json.loads(regel)
    raise ValueError(f"heartbeat printed no JSON: {(stdout or '')[-300:]!r}")


def _ok_http(code: Any) -> bool:
    try:
        return 200 <= int(code) < 500
    except (TypeError, ValueError):
        return False


def blokkades(routine: Routine | None, hart: dict[str, Any], model: str | None) -> list[str]:
    """Wat deze bot nu NIET kan, in gewone woorden. Leeg = alles wat hij nodig heeft is er."""
    if routine is None:
        return []
    uit: list[str] = []
    tools = hart.get("tools") or {}
    net = hart.get("net") or {}
    if "net" in routine.eisen and not (_ok_http(net.get("github")) or _ok_http(net.get("public_api"))):
        uit.append("no internet from this DAX (github and the public API did not answer)")
    if "github" in routine.eisen and not _ok_http(net.get("github")):
        uit.append(f"github.com unreachable from this DAX (HTTP {net.get('github')})")
    for eis, wat in (("python3", "python3"), ("git", "git"), ("chromium", "Chromium"), ("dax_browser", "dax-browser")):
        if eis in routine.eisen and not tools.get(eis):
            uit.append(f"{wat} is missing in this DAX image")
    vrij = int(hart.get("host_mem_available_mb") or 0)
    if vrij and vrij < MIN_VRIJ_MB:
        uit.append(f"modelbox is low on memory ({vrij} MB free < {MIN_VRIJ_MB} MB); Ollama goes first")
    if model:
        uit.append(model)
    return uit


def model_blokkade(http_get: Callable[[str, float], tuple[int, str]] | None = None) -> str | None:
    """None als de agent-lus een gratis model heeft (modelbox-Ollama of Groq), anders de reden.

    Abonnementen (Claude/Codex/Cursor) tellen hier bewust niet: de vaste routines
    draaien op sleutels/modelbox, nooit op Luka's abonnementen.
    """
    host = os.environ.get("OLLAMA_HOST", "https://ollama.axecompanion.com").rstrip("/")
    model = os.environ.get("AXE_AGENT_FALLBACK_MODEL", "llama3.1:8b-32k")
    if http_get is None:
        http_get = _http_get
    try:
        status, body = http_get(f"{host}/api/tags", 8.0)
        if status == 200:
            namen = {m.get("name") for m in (json.loads(body).get("models") or [])}
            if model in namen or f"{model}:latest" in namen:
                return None
            ollama_fout = f"model {model} is not on the modelbox"
        else:
            ollama_fout = f"modelbox Ollama HTTP {status}"
    except Exception as exc:  # noqa: BLE001
        ollama_fout = f"modelbox Ollama unreachable ({str(exc)[:80]})"
    if os.environ.get("GROQ_API_KEY"):
        return None
    return f"no model for the agent loop: {ollama_fout} and no GROQ_API_KEY"


def _http_get(url: str, timeout: float) -> tuple[int, str]:
    import urllib.request
    headers = {}
    sleutel = os.environ.get("OLLAMA_PROXY_KEY", "").strip()
    if sleutel:
        headers["Authorization"] = f"Bearer {sleutel}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 — vaste host uit de config
        return r.status, r.read().decode("utf-8", "replace")


# ── De vaste missie ──────────────────────────────────────────────────────────

def opdracht(r: Routine) -> str:
    """De mijlpaal-opdracht. Het script doet het werk; het model leest en rapporteert."""
    regels = [
        f"Routine '{r.naam}' on your own DAX computer. The script does the real work: {r.wat}.",
        "Steps, in order:",
        f"1. Run: {ROUTINE_PAD} {r.naam}",
        '   It prints one JSON receipt with "ok", "id", "artifact" and "report_path".',
        f'2. If it printed "ok": false, do NOT invent any result. Run `{ROUTINE_PAD} last-error {r.naam}`,',
        f"   then call finish with verify_command `{ROUTINE_PAD} last-error {r.naam}` and expect_in_output `ERROR`,",
        "   and end the summary with `MILESTONE: blocked REASON: <the exact error line>`.",
        "3. Otherwise read the artifact file with read_file.",
    ]
    if r.verslag:
        regels += [
            "4. Write a short factual report (markdown) with write_file to the receipt's report_path.",
            "   First line exactly: `Receipt: <id>`. Then only facts that are in the artifact: "
            f"{r.focus}. No advice, no orders, nothing sent anywhere.",
            f"5. Call finish with verify_command `{ROUTINE_PAD} verify {r.naam} --report <report_path>` and "
            "expect_in_output `VERIFIED`.",
        ]
    else:
        regels += [
            "4. You are read-only: do not write files. Put the facts in your finish summary instead: "
            f"{r.focus}. Quote the receipt id.",
            f"5. Call finish with verify_command `{ROUTINE_PAD} verify {r.naam}` and expect_in_output `VERIFIED`.",
        ]
    regels.append("Finish summary: 2-5 sentences with the key numbers from the artifact and the receipt id, "
                  "then `MILESTONE: done`.")
    return "\n".join(regels)


def missie_rij(agent: str, r: Routine) -> dict[str, Any]:
    from missies import normaliseer_mijlpalen
    mijlpalen = normaliseer_mijlpalen([{"key": r.naam, "title": f"{r.titel}: run dax-routine {r.naam} and report",
                                        "goal": opdracht(r)}])
    return {
        "title": f"{r.titel} ({agent})",
        "goal": f"Always-on routine for the {agent} bot on its own DAX: {r.wat}. Report only what the artifact proves.",
        "owner_agent": agent, "supporting_agents": [], "priority": "low",
        "milestones": mijlpalen, "continue_until": "complete",
        "recurring_interval_seconds": r.interval_s, "requested_by": "dax-wacht",
        "next_action": f"Start: {mijlpalen[0]['title']}",
        # crew=False: geen CrewAI-ronde op de VPS voor een vaste routine; het werk zit in het script.
        # free_models: alleen Groq + modelbox; een lus die elke paar uur draait maakt geen tegoed op.
        "metadata": {"dax_routine": agent, "routine": r.naam, "task_payload": {"crew": False, "free_models": True}},
    }


def _nu() -> datetime:
    return datetime.now(timezone.utc)


def _tijd(v: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else None
    except ValueError:
        return None


def _houd_bij(db: Any, m: dict[str, Any], vers: dict[str, Any], nu: datetime) -> None:
    """Houdt de bestaande always-on-missie bij de huidige routine-tekst.

    Status, lease en updated_at blijven: die horen bij wat er nu loopt, niet
    bij een tekstupdate. Een lopende taak houdt zijn mijlpaal.
    """
    patch: dict[str, Any] = {
        "title": vers["title"],
        "goal": vers["goal"],
        "recurring_interval_seconds": vers.get("recurring_interval_seconds"),
        "metadata": {**(m.get("metadata") or {}), **(vers.get("metadata") or {})},
    }
    if not _taak_loopt(db, m):
        oud = m.get("milestones") or []
        if not oud or not (oud[0] or {}).get("task_id"):
            patch["milestones"] = vers.get("milestones")
    db.table("core_missions").update(patch).eq("id", m["id"]).execute()
    m.update(patch)


def zorg_voor_missie(db: Any, agent: str, r: Routine, eisen_mis: list[str],
                     nu: datetime | None = None) -> dict[str, Any]:
    """Eén vaste missie per bot, met een status die klopt met wat hij nu kan."""
    from missies import MissieRepository
    nu = nu or _nu()
    repo = MissieRepository(lambda: db)
    rijen = (db.table("core_missions").select("*").eq("metadata->>dax_routine", agent)
             .order("created_at", desc=True).limit(5).execute().data or [])
    m = next((x for x in rijen if x.get("status") not in EINDE), None)
    reden = "Can't run: " + "; ".join(eisen_mis) if eisen_mis else None

    if m is None:
        rij = missie_rij(agent, r)
        if reden:
            rij.update(status="blocked", blocked_reason=reden, last_stop_reason="dax_capability")
        else:
            rij["status"] = "active"
        m = db.table("core_missions").insert(rij).execute().data[0]
        repo.event(m["id"], "mission.assigned", f"Always-on routine assigned to {agent}: {r.titel}",
                   agent=agent, data={"routine": r.naam, "interval_seconds": r.interval_s})
        if reden:
            repo.event(m["id"], "mission.blocked", reden, agent=agent, data={"cause": "dax_capability"})
        return {"mission": m["id"], "action": "created", "status": m["status"]}

    _houd_bij(db, m, missie_rij(agent, r), nu)
    status = m.get("status")
    if reden:
        if status in RUNNABLE and not _taak_loopt(db, m):
            db.table("core_missions").update({
                "status": "blocked", "blocked_reason": reden, "last_stop_reason": "dax_capability",
                "updated_at": nu.isoformat(), "revision": int(m.get("revision") or 0) + 1,
                "lease_owner": None, "lease_token": None, "lease_expires_at": None,
            }).eq("id", m["id"]).execute()
            repo.event(m["id"], "mission.blocked", reden, agent=agent, data={"cause": "dax_capability"})
            return {"mission": m["id"], "action": "blocked", "status": "blocked", "reason": reden}
        if status == "blocked" and m.get("blocked_reason") != reden and m.get("last_stop_reason") == "dax_capability":
            db.table("core_missions").update({"blocked_reason": reden, "updated_at": nu.isoformat()}).eq("id", m["id"]).execute()
        return {"mission": m["id"], "action": "none", "status": status, "reason": reden}

    if status == "blocked":
        oorzaak = m.get("last_stop_reason")
        sinds = _tijd(m.get("updated_at")) or nu
        if oorzaak == "dax_capability":
            repo.zet_status(m["id"], "active", door="dax-wacht", reden="Capabilities are back; resuming.")
            return {"mission": m["id"], "action": "resumed", "status": "active"}
        if nu - sinds >= timedelta(seconds=r.interval_s):
            notitie = (f"The previous cycle was blocked: {str(m.get('blocked_reason') or '')[:300]}. "
                       "Run the routine again; if the same problem is still there, report blocked again.")
            repo.zet_status(m["id"], "active", door="dax-wacht", reden="Always-on retry after a block.", notitie=notitie)
            return {"mission": m["id"], "action": "retried", "status": "active"}
        return {"mission": m["id"], "action": "none", "status": status,
                "retry_at": (sinds + timedelta(seconds=r.interval_s)).isoformat()}
    return {"mission": m["id"], "action": "none", "status": status}


def _taak_loopt(db: Any, missie: dict[str, Any]) -> bool:
    i = int(missie.get("current_milestone") or 0)
    mijlpalen = missie.get("milestones") or []
    taak_id = mijlpalen[i].get("task_id") if 0 <= i < len(mijlpalen) else None
    if not taak_id:
        return False
    rij = db.table("core_tasks").select("status").eq("id", taak_id).limit(1).execute().data
    return bool(rij) and rij[0].get("status") in {"queued", "running", "in_progress", "planning", "verifying",
                                                  "retrying", "waiting_approval"}


# ── De ronde ─────────────────────────────────────────────────────────────────

def ronde(client_factory: Callable[[], Any], *, runtime_factory: Callable[[DaxComputer], Any] = runtime_voor,
          model_check: Callable[[], str | None] = model_blokkade, nu: datetime | None = None) -> dict[str, Any]:
    """Eén ronde over alle DAX-computers. Geeft per bot wat er gemeten en gedaan is."""
    nu = nu or _nu()
    register = DaxRegister(client_factory)
    db = client_factory()
    model = model_check()
    try:
        bezet = {s.get("computer_id") for s in register.bezette_slots()}
    except Exception:  # noqa: BLE001
        bezet = set()
    sha = routine_sha()
    with open(ROUTINE_BRON, encoding="utf-8") as fh:
        script = fh.read()
    uit: dict[str, Any] = {"at": nu.isoformat(), "model": model or "ok", "bots": {}}

    for rij in register.rijen():
        c = DaxComputer.uit_rij(rij)
        agent = c.owner_agent
        r = ROUTINES.get(agent)
        verslag: dict[str, Any] = {"dax": c.id}
        rt = runtime_factory(c)
        try:
            if altijd_aan(rij):
                verslag["start"] = rt.ensure_running(c).get("action")
            elif rt.status(c) != "running":
                verslag["state"] = "asleep (not always-on)"
                uit["bots"][agent] = verslag
                continue
            meting = rt.exec(c, "bash -s", cwd="/dax/workspace", timeout=60, stdin=HARTSLAG)
            if meting.get("exit_code") != 0:
                raise RuntimeError(f"heartbeat exit {meting.get('exit_code')}: {(meting.get('stderr') or '')[-300:]}")
            hart = lees_hartslag(meting.get("stdout") or "")
            # Altijd de huidige routine schrijven. Een oude container met een
            # kapotte .venv-ci bleef anders op de sha van gisteren hangen.
            inst = rt.exec(c, "mkdir -p ~/.local/bin && cat > ~/.local/bin/dax-routine && chmod +x ~/.local/bin/dax-routine",
                           cwd="/dax/workspace", timeout=60, stdin=script)
            if inst.get("exit_code") != 0:
                raise RuntimeError(f"installing dax-routine failed: {(inst.get('stderr') or '')[-300:]}")
            hart["routine_sha"] = sha
            verslag["routine_installed"] = True
        except Exception as exc:  # noqa: BLE001 — één kapotte computer mag de rest niet stoppen
            fout = str(exc)[:500]
            register.meld(c.id, status="error", fout=fout)
            verslag["error"] = fout
            if r is not None:
                try:
                    verslag["mission"] = zorg_voor_missie(db, agent, r, [f"its DAX computer is not reachable: {fout[:200]}"], nu)
                except Exception as mexc:  # noqa: BLE001
                    verslag["mission_error"] = str(mexc)[:300]
            uit["bots"][agent] = verslag
            continue

        mist = blokkades(r, hart, model)
        stats = {**hart, "checked_at": nu.isoformat(), "working": c.id in bezet, "always_on": altijd_aan(rij),
                 "routine": r.naam if r else None, "routine_title": r.titel if r else None,
                 "interval_s": r.interval_s if r else None, "blockers": mist,
                 "notes": list(r.notities) if r else []}
        register.meld(c.id, status="running", stats=stats, fout="; ".join(mist))
        verslag.update(heartbeat=nu.isoformat(), working=c.id in bezet, blockers=mist,
                       mem_free_mb=hart.get("host_mem_available_mb"), container_mb=hart.get("container_mem_mb"))
        if r is not None:
            try:
                verslag["mission"] = zorg_voor_missie(db, agent, r, mist, nu)
            except Exception as exc:  # noqa: BLE001
                verslag["mission_error"] = str(exc)[:300]
        uit["bots"][agent] = verslag
    return uit


def ronde_status(uitkomst: dict[str, Any]) -> str:
    """'ok' als elke computer een heartbeat gaf, anders 'fail' (dan ziet het grootboek het)."""
    bots = uitkomst.get("bots") or {}
    return "fail" if any("error" in v for v in bots.values()) else "ok"
