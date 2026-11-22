"""Device actions: the VPS agent's hands on Luka's Macs (BOUWLIJST 6.15).

Rabbit OS3's model: the cloud thinks, the devices act. The agent loop runs on
the VPS, so its shell is the VPS's shell. Anything that is about a Mac -- its
files, its apps, its screen -- has to go to the computer-worker on THAT Mac.

Transport is the one computerRelay.ts already uses: a `core_tasks` row with
capability `computer_use` and a `target_device`, claimed only by the worker on
that device. Nothing new listens on any port.

Tiers mirror src/domain/tools/riskTiers.ts (a test keeps the two in step).
The model never picks the tier; an unknown tool is refused.
"""
from __future__ import annotations

import json
import re
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable

CAPABILITY = "computer_use"
HEARTBEAT_STALE_S = 90
POLL_S = 1.5
TIMEOUT_S = 6 * 60
# Coding-agents (claude_code/codex/cursor.run) krijgen op de Mac 15 min (worker.mjs AGENT_TIMEOUT_MS);
# hier een minuut langer wachten, anders geeft de VPS op terwijl de Mac nog werkt (22 nov gemeten).
AGENT_TIMEOUT_S = 16 * 60

TOOL_TIERS: dict[str, str] = {
    "system.info": "observe",
    "files.list": "observe",
    "files.read": "observe",
    "files.search": "observe",
    "personal.files.list": "observe",
    "camera.snapshot": "observe",
    "computer.permissions": "observe",
    "screen.displays": "observe",
    "screen.observe": "observe",
    "pointer.position": "observe",
    "app.list": "observe",
    "app.frontmost": "observe",
    "axe.focus_log": "observe",
    "window.list": "observe",
    "git.status": "observe",
    "git.branch": "observe",
    "git.diff": "observe",
    "git.log": "observe",
    "memory.recall": "observe",
    "terminal.typecheck": "safe_execute",
    "terminal.lint": "safe_execute",
    "terminal.test": "safe_execute",
    "terminal.build": "safe_execute",
    "git.create_branch": "safe_execute",
    "computer.permissions.request_screen": "safe_execute",
    "computer.permissions.request_accessibility": "safe_execute",
    "pointer.move": "safe_execute",
    "app.open": "safe_execute",
    "app.focus": "safe_execute",
    "mac.schakel": "safe_execute",
    "files.write": "write",
    "terminal.install": "write",
    "claude_code.run": "write",
    "cursor.run": "write",
    "codex.run": "write",
    "memory.write": "write",
    "pointer.click": "write",
    "pointer.double_click": "write",
    "pointer.right_click": "write",
    "pointer.drag": "write",
    "pointer.scroll": "write",
    "keyboard.type": "write",
    "keyboard.key": "write",
    "git.commit": "consequential",
    "git.push": "consequential",
    "git.pr_open": "consequential",
    "git.merge": "consequential",
    "terminal.free": "consequential",
    "db.migrate": "consequential",
    "files.delete": "consequential",
}

WORKSPACES = ("AXE Core", "AXE Companion", "Trading OS")

LABELS = {
    "mac-mini-van-luka-5": "Mac mini (the brain: API, planner, Ollama)",
    "main-imac-luka": "iMac (the executor, Luka's big screen)",
}


ALIASES = {
    "mac mini": "mac-mini-van-luka-5", "macmini": "mac-mini-van-luka-5", "mini": "mac-mini-van-luka-5",
    "imac": "main-imac-luka",
}


# Welke worker-ids bij welke Mac horen. 15 nov: de Mac mini heette eerst
# mac-mini-van-luka-5 en nu mini-van-luka-6, de iMac main-imac-luka en nu imac;
# de vaste alias stuurde elke actie naar een worker die sinds 13 nov dood was.
FAMILIE = {"mac-mini-van-luka-5": re.compile(r"mini", re.I), "main-imac-luka": re.compile(r"imac", re.I)}


def levende_van(vast: str, apparaten: list[dict[str, Any]]) -> str:
    """De online worker van dezelfde Mac met de verste hartslag; anders de vaste naam."""
    familie = FAMILIE.get(vast)
    if not familie:
        return vast
    online = [d for d in apparaten if d.get("online") and familie.search(str(d.get("device") or ""))]
    if not online:
        return vast
    return min(online, key=lambda d: d.get("seconds_since_heartbeat") or 0)["device"]


def resolve_device(name: str, apparaten: list[dict[str, Any]] | None = None) -> str:
    """'Mac mini' and 'iMac' are how Luka (and the model) say it.

    Met de lijst van apparaten erbij wordt het de worker die nu echt leeft."""
    n = " ".join(str(name).replace("-", " ").lower().split())
    vast = ALIASES.get(n, str(name))
    return levende_van(vast, apparaten) if apparaten is not None else vast


# Velden zonder welke de Mac de actie toch weigert (worker.mjs). Hier al
# controleren: anders vraagt AXE Luka om goedkeuring voor iets dat gegarandeerd
# faalt, en staat er elk uur een rode "claude_code.run needs a prompt" in zijn
# lijst (18 nov: 6x per dag, de developer-agent vergat args.prompt).
VERPLICHT: dict[str, tuple[str, ...]] = {
    "claude_code.run": ("prompt",),
    "codex.run": ("prompt",),
    "cursor.run": ("prompt",),
    "terminal.free": ("command",),
}


def ontbrekend(tool: str, args: dict[str, Any] | None) -> str | None:
    """Een foutzin voor het model als een verplicht veld leeg is, anders None."""
    args = args or {}
    for veld in VERPLICHT.get(tool, ()):
        if not str(args.get(veld) or "").strip():
            return (f"{tool} needs args.{veld} (a non-empty string) -- nothing was sent to the Mac. "
                    f"Call run_on_device again with args.{veld} set"
                    + (": the full instruction for the coding agent, including repo/branch and what done looks like."
                       if veld == "prompt" else "."))
    return None


# ── Coding-worker als interne medewerker (BOUWLIJST "Eerst", punt 3) ─────────
# Een manager geeft Claude Code / Codex / Cursor een opdracht. Zonder vaste
# vorm kwam er ruwe JSON terug en wist niemand wat er af was. Nu: elke opdracht
# krijgt dezelfde werkbon (scope + "af is af" + drie vaste kopjes), en wat
# terugkomt wordt een oplevering: samenvatting, tests, risico's, plus de
# git-feiten die de Mac er zelf onder zet (branch, commits, diff).
AGENT_RUNS = frozenset({"claude_code.run", "codex.run", "cursor.run"})
WERKBON_KOP = "## Werkbon van AXE"
KOPJES = ("Samenvatting", "Tests", "Risico's")


def werkbon(opdracht: str) -> str:
    """De opdracht in de vaste vorm. Twee keer toepassen verandert niets."""
    if WERKBON_KOP in (opdracht or ""):
        return opdracht
    opdracht = (opdracht or "").strip()
    return (
        f"{WERKBON_KOP}\n\n"
        f"OPDRACHT:\n{opdracht}\n\n"
        "SCOPE: raak alleen de bestanden aan die voor deze opdracht nodig zijn. Niets hernoemen, "
        "opruimen of 'verbeteren' buiten de opdracht.\n\n"
        "AF IS AF als: (1) het gevraagde werkt, (2) er een test is die het nieuwe gedrag bewijst, "
        "(3) de bestaande tests van wat je raakte groen zijn en de typecheck geen nieuwe fouten geeft, "
        "(4) alles gecommit is op de huidige branch. Niet mergen, niet deployen, niet pushen naar "
        "orchestrator of main. Lukt iets niet, zeg dat eerlijk in plaats van het te verbergen.\n\n"
        "EINDIG je antwoord met precies deze drie kopjes:\n"
        "## Samenvatting\n(wat je veranderde, in gewone taal, 2-5 regels)\n"
        "## Tests\n(welke commando's je draaide en de uitkomst, letterlijk)\n"
        "## Risico's\n(wat er mis kan gaan of wat je niet kon controleren; 'geen' mag alleen als dat waar is)\n"
    )


def motor_fout(output: Any) -> str | None:
    """De echte reden als de coding-agent zelf faalde (claude -p: is_error + result).

    Gemeten 22 nov: Claude Code op de Mac mini gaf "You've hit your weekly limit ·
    resets 10pm" -- de manager maakte daar "429, kan het bestand niet lezen" van."""
    t = str(output or "").split("\n## Oplevering (Mac)")[0]
    try:
        d = json.loads(t)
    except ValueError:
        # Geen JSON: een CLI die meteen weigert (codex: "error: unexpected argument ... Usage:").
        eerste = next((r.strip() for r in t.splitlines() if r.strip()), "")
        if eerste.lower().startswith("error:") and "usage:" in t.lower():
            return " ".join(eerste.split())[:240]
        return None
    if isinstance(d, dict) and d.get("is_error"):
        return " ".join(str(d.get("result") or d.get("subtype") or "onbekende fout").split())[:240]
    return None


def _leeg(v: str) -> str:
    return "" if v.strip() in ("", "(no output)") else v.strip()


def _tekst_van(output: Any) -> str:
    """De leesbare tekst uit wat de Mac teruggeeft (claude -p geeft JSON)."""
    t = str(output or "")
    try:
        d = json.loads(t.split("\n## Oplevering (Mac)")[0])
        if isinstance(d, dict) and d.get("result"):
            return str(d["result"])
    except ValueError:
        pass
    return t


def _sectie(tekst: str, kop: str) -> str:
    import re
    m = re.search(rf"^##\s*{re.escape(kop)}\s*$(.*?)(?=^##\s|\Z)", tekst, re.M | re.S | re.I)
    return m.group(1).strip() if m else ""


def oplevering(output: Any) -> dict[str, Any]:
    """Samenvatting / tests / risico's van de agent + de git-feiten van de Mac."""
    ruw = str(output or "")
    tekst = _tekst_van(ruw)
    mac = ruw.split("## Oplevering (Mac)", 1)[1] if "## Oplevering (Mac)" in ruw else ""
    uit: dict[str, Any] = {k.lower().replace("'", ""): _sectie(tekst, k) for k in KOPJES}
    for regel in mac.splitlines():
        if ":" in regel and regel.split(":", 1)[0].strip() in ("branch", "worktree"):
            k, v = regel.split(":", 1)
            uit[k.strip()] = v.strip()
    na_commits = mac.split("\ncommits:", 1)[1] if "\ncommits:" in mac else ""
    uit["commits"] = _leeg(na_commits.split("\ndiff:", 1)[0].split("\nniet gecommit:", 1)[0])
    open_ = _leeg(mac.split("\nniet gecommit:", 1)[1].split("\ndiff:", 1)[0]) if "\nniet gecommit:" in mac else ""
    if open_:
        uit["niet_gecommit"] = open_  # "af is af" vraagt alles gecommit
    uit["diff"] = _leeg(mac.split("\ndiff:", 1)[1]) if "\ndiff:" in mac else ""
    if (fout := motor_fout(ruw)):
        uit["motor_fout"] = fout
    ontbreekt = [k for k in KOPJES if not uit[k.lower().replace("'", "")]]
    uit["compleet"] = (not ontbreekt and bool(uit.get("branch")) and not uit.get("niet_gecommit")
                       and not uit.get("motor_fout"))
    if ontbreekt:
        uit["ontbreekt"] = ontbreekt
    return uit


def oplevering_weigering(op: dict[str, Any] | None) -> str | None:
    """Mag de taak 'klaar' zeggen na deze oplevering? None = ja; anders waarom niet.

    Audit 22 nov: tot nu toe kwam de oplevering alleen als tool-antwoord terug en
    kon de lus 'klaar' zeggen terwijl er geen tests, geen branch of open wijzigingen
    waren. Geen coding-run in deze taak (op is None) = deze regel geldt niet."""
    if not isinstance(op, dict) or op.get("compleet"):
        return None
    if op.get("motor_fout"):
        andere = sorted(AGENT_RUNS - {str(op.get("tool") or "")})
        return (f"De coding-agent ({op.get('tool') or 'claude_code.run'}) werkte niet: \"{op['motor_fout']}\". "
                f"Dat is geen fout in de opdracht. Probeer dezelfde opdracht met {' of '.join(andere)} op dezelfde Mac; "
                "lukt dat ook niet, zeg Luka dan precies deze reden. Je bent NIET klaar.")
    mist: list[str] = [f"kopje {k}" for k in op.get("ontbreekt") or []]
    if not op.get("branch"):
        mist.append("een branch")
    if op.get("niet_gecommit"):
        mist.append("alles gecommit (er staat nog werk open)")
    return ("De oplevering van de coding-agent is niet compleet: " + ", ".join(mist or ["onbekend"])
            + ". Stuur hem terug met een kleinere, duidelijkere opdracht, of zeg eerlijk wat er mist. "
              "Je bent NIET klaar.")


def approval_key(device: str, tool: str, args: dict[str, Any]) -> str | None:
    """What Luka has to say yes to before this runs, or None if it may run.

    observe/safe_execute run unattended. A write-tier action is approved per
    device+tool for the whole task: one "yes, you may click on the iMac"
    instead of one card per click, which would make computer use unusable.
    Consequential actions are approved with their exact arguments, every time.
    """
    device = resolve_device(device)
    tier = TOOL_TIERS.get(tool)
    if tier in (None, "observe", "safe_execute"):
        return None
    if tier == "write":
        return f"device:{device} {tool}"
    return f"device:{device} {tool} {json.dumps(args, sort_keys=True)}"


def _client():
    from supabase import create_client

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE"])
    client.options.postgrest_client_timeout = 15
    return client


def list_devices(db=None, now: Callable[[], float] = time.time) -> list[dict[str, Any]]:
    db = db or _client()
    rows = db.table("core_computer_workers").select(
        "device_id,host,workspaces,heartbeat_at"
    ).execute().data or []
    out = []
    for r in rows:
        beat = r.get("heartbeat_at")
        try:
            age = now() - datetime.fromisoformat(str(beat).replace("Z", "+00:00")).timestamp()
        except ValueError:
            continue
        ws = r.get("workspaces") or []
        if isinstance(ws, str):
            ws = [w for w in ws.split(",") if w]
        out.append({
            "device": r["device_id"],
            "label": LABELS.get(r["device_id"]) or (
                "Mac mini" if "mini" in r["device_id"] else "iMac" if "imac" in r["device_id"] else r.get("host") or r["device_id"]),
            "online": age < HEARTBEAT_STALE_S,
            "seconds_since_heartbeat": int(age),
            "workspaces": ws,
        })
    return sorted(out, key=lambda d: (not d["online"], d["device"]))


def is_cancelled(db, task_id: str) -> bool:
    """Staat deze taak op cancelled?

    Twijfel is geen annulering: gaat de vraag mis (netwerk, time-out), dan
    blijven we gewoon wachten. Een valse "ja" zou een lopende actie op de Mac
    afbreken terwijl er niets aan de hand is.
    """
    try:
        rows = db.table("core_tasks").select("status").eq("id", task_id).limit(1).execute().data or []
    except Exception:
        return False
    return bool(rows) and rows[0].get("status") == "cancelled"


WORKTREES = "/.axe/worktrees/"
_GIT_VERZET = re.compile(r"\bgit\s+(checkout|switch|branch\s+-[mMdD]|reset\s+--hard|rebase|stash\s+(pop|apply)|merge|pull)\b")


def verzet_checkout(tool: str, args: dict[str, Any]) -> str | None:
    """Zou dit Luka's echte checkout van branch wisselen? Dan nooit (hard, niet per ok).

    Gemeten 22 nov 16:34: een managertaak deed `git.create_branch` (safe_execute, dus
    zonder vragen) op de AXE Core-checkout van de Mac mini -- de branch waar zijn
    autosync op draait. Branches maken mag alleen in een eigen worktree van AXE
    (~/.axe/worktrees/...); claude_code/codex/cursor.run maken die zelf aan."""
    pad = str(args.get("path") or args.get("cwd") or "")
    in_worktree = WORKTREES in pad
    if tool == "git.create_branch" and not in_worktree:
        return ("git.create_branch op Luka's eigen checkout is niet toegestaan (dat verzet de branch van zijn "
                "autosync). claude_code.run / codex.run / cursor.run maken zelf een eigen worktree op een nieuwe "
                "branch; werk daarin, of geef path=<die worktree>.")
    if tool == "terminal.free" and not in_worktree and _GIT_VERZET.search(str(args.get("command") or "")):
        return ("Branch wisselen, resetten of mergen in Luka's eigen checkout is niet toegestaan. Doe het in de "
                "worktree onder ~/.axe/worktrees/ (cwd=<worktree>), of laat Luka het doen.")
    return None


def run_on_device(
    device: str,
    tool: str,
    args: dict[str, Any] | None = None,
    workspace: str = "AXE Core",
    parent_task_id: str | None = None,
    read_only: bool = False,
    db=None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """Queue one action for one Mac and wait for its answer."""
    args = args or {}
    device = resolve_device(device)
    tier = TOOL_TIERS.get(tool)
    if tier is None:
        return {"error": f"unknown device tool {tool!r}. Known: {', '.join(sorted(TOOL_TIERS))}"}
    if read_only and tier in ("write", "consequential"):
        return {"error": "This is a read-only task. Observe and report instead of changing the Mac."}
    fout = ontbrekend(tool, args)
    if fout:
        return {"error": fout}
    if (verzet := verzet_checkout(tool, args)):
        return {"error": verzet}
    if tool in AGENT_RUNS:
        args = {**args, "prompt": werkbon(str(args.get("prompt") or ""))}
    if workspace not in WORKSPACES:
        return {"error": f"unknown workspace {workspace!r}. Use one of {', '.join(WORKSPACES)}."}

    db = db or _client()
    apparaten = list_devices(db)
    known = {d["device"]: d for d in apparaten}
    # "Mac mini" / de oude naam -> de worker van die Mac die nu leeft.
    device = levende_van(device, apparaten)
    if device not in known:
        return {"error": f"no such device {device!r}. Call list_devices."}
    if not known[device]["online"]:
        # Fail in a second rather than time out in six minutes: a long wait
        # tempts the model to answer from memory.
        return {"error": f"{known[device]['label']} is offline (last heartbeat "
                         f"{known[device]['seconds_since_heartbeat']}s ago)."}

    row = db.table("core_tasks").insert({
        "capability": CAPABILITY,
        "status": "pending",
        "source_app": "axe_core",
        "title": f"{tool} · {workspace} · {device}",
        "goal": tool,
        "execution_mode": "read" if tier == "observe" else "write",
        "target_device": device,
        "parent_task_id": parent_task_id,
        "payload": {
            "tool": tool, "tier": tier, "workspace": workspace, "args": args,
            # The VPS is a remote client: the native build-equality check is
            # only for the packaged app talking to its own local worker.
            "client_runtime": "remote",
        },
    }).execute().data[0]

    wacht_s = AGENT_TIMEOUT_S if tool in AGENT_RUNS else TIMEOUT_S
    deadline = time.monotonic() + wacht_s
    while time.monotonic() < deadline:
        sleep(POLL_S)
        # Stopt Luka de taak waar deze actie bij hoort, dan heeft doorwachten
        # geen zin meer: zonder deze controle blijft een geannuleerde taak nog
        # tot TIMEOUT_S minuten op een Mac hangen en komt het antwoord terug in
        # een gesprek dat allang gestopt is.
        if parent_task_id and is_cancelled(db, parent_task_id):
            # De rij van de Mac zelf blijft zoals hij is: TaskRepository.cancel
            # gaat over kindrijen, en een Mac die nog klikt is niet gestopt door
            # hem hier op cancelled te zetten.
            return {"device": device, "tool": tool, "ok": False, "cancelled": True,
                    "error": "cancelled: the task this action belongs to was cancelled."}
        found = db.table("core_tasks").select("status,result,error").eq(
            "id", row["id"]).limit(1).execute().data
        if not found:
            continue
        r = found[0]
        if r["status"] in ("completed", "done"):
            uit = (r.get("result") or {}).get("output")
            antwoord = {"device": device, "tool": tool, "ok": True, "output": uit}
            if tool in AGENT_RUNS:
                antwoord["oplevering"] = oplevering(uit)
            return antwoord
        if r["status"] in ("failed", "cancelled"):
            return {"device": device, "tool": tool, "ok": False,
                    "error": (r.get("error") or {}).get("message") or r["status"]}
    return {"device": device, "tool": tool, "ok": False,
            "error": f"no answer from {device} within {wacht_s}s"}
