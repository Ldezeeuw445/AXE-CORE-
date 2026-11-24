"""A real agentic loop for durable AXE tasks.

Replaces the previous `agentic_handler`, which delegated the whole request to
OpenHands in ONE call and recorded whatever text came back as the result. Two
things went wrong with that, both visible in core_tasks:

  * A request to build an Obsidian vault returned a numbered *plan*
    ("1. Create a folder named Trading, 2. Organize subfolders...") and the
    worker stored the plan as the finished work. Nothing was created.
  * Every smoke test 504'd on the OpenHands sandbox, and one was still marked
    `completed` because the agent called finish() with "Task completed
    successfully" while the error field held the timeout.

The cause of the second one is that verification only ever asked "is there a
summary string?". Any sentence passed. An agent graded that way cannot learn:
saying "done" scores the same as being done.

So this module does the two things that were missing:

  1. It LOOPS. The model gets real tools (shell, file read/write) and keeps
     going until the job is actually finished, not until it has produced one
     paragraph.
  2. Finishing requires EVIDENCE. `finish` must supply a command that proves
     the work exists, and this worker runs that command itself. If the proof
     fails, the failure is handed back to the model and the loop continues.
     The model cannot mark its own homework.
"""

from __future__ import annotations

import asyncio
import contextvars
import json
import os
import re
import logging
import subprocess
import time
from itertools import cycle
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

import device_actions
import klaar_regels
from agent_workspace import (
    AGENT_BRIEFS,
    crew_voor,
    laad_workspace,
    tools_voor,
)
from provider_router import (
    WaitingForCapacity,
    api_namen,
    kaart_voor,
    kies_stoel,
    lees_stoelen,
    mag_stoel,
    meld_tegoed_eenmaal,
    parse_seat_antwoord,
    provider_uit_fout,
    roep_stoel,
    seat_prompt,
    vroegste_stoel_vrij,
    stoel_vrij,
)

# Budget. The old loop allowed 10 steps and 2 minutes, which is not enough to
# do anything real -- a single "read the file, change it, check it built" cycle
# is already three. These are the numbers for a background task, not a chat
# reply; the durable worker holds a lease and heartbeats, so a long run is fine.
MAX_STEPS = 40
MAX_ZONDER_ACTIE = 3
ACCEPTATIE_ELKE_N = 5
WALL_CLOCK_SECONDS = 1800

# Per-command ceiling. Long enough for an install or a build, short enough that
# one hung command cannot eat the whole task budget.
SHELL_TIMEOUT_SECONDS = 240

log = logging.getLogger("axe_agent_loop")

WORKSPACE = os.environ.get("WORKSPACE_DIR", "/opt/axe-workspace")

# A stable alias on purpose. Pinning an exact version (this was gemini-2.5-pro)
# broke on the very first run: Google had already closed that model to new
# callers, so the loop 404'd before doing anything. ListModels still advertised
# it -- being listed and being callable are not the same thing. An alias follows
# Google's current pro model instead of rotting the moment they move on.
MODEL = os.environ.get("AXE_AGENT_MODEL", "gemini-2.5-flash")

# The fallback. Not a downgrade to tolerate -- measured on Hetzner while warm:
# a correct tool call in ~13s, and a plain answer in 2.3s. Slower per step than
# Gemini, fast enough for a background agent with a 30-minute budget, and it
# costs nothing and cannot have its key revoked.
#
# Note the ":cloud" models Ollama advertises (kimi, glm, deepseek, minimax) are
# NOT on this box -- they proxy to Ollama's own service and answer 401 without
# an account there. Of the 15 names /api/tags reports, 5 are really local.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "https://ollama.axecompanion.com").rstrip("/")

# De modelbox staat sinds 2 okt 2026 achter een slot (nginx, zie
# infra/vps-bootstrap.sh stap 4). De API-box mag er op IP bij -- dat is de weg
# die werkt zonder hier iets te zetten. Deze sleutel is de tweede weg, zodat een
# IP-wissel (een nieuwe VPS, een verhuizing) de agentlus niet stilletjes op 401
# zet. Niet gezet = geen header, precies als voorheen.
OLLAMA_PROXY_KEY = os.environ.get("OLLAMA_PROXY_KEY", "").strip()


def _ollama_headers() -> dict[str, str]:
    kop = {"Content-Type": "application/json"}
    if OLLAMA_PROXY_KEY:
        kop["Authorization"] = f"Bearer {OLLAMA_PROXY_KEY}"
    return kop

OLLAMA_MODEL = os.environ.get("AXE_AGENT_FALLBACK_MODEL", "llama3.1:8b-32k")


def _ollama_keep_alive() -> str | int:
    """Hoe lang het model na gebruik in het geheugen blijft.

    Tot 8 nov stond hier -1 (voor altijd). Ollama is de LAATSTE terugval (na
    Groq en OpenAI) en hield de modelbox zo permanent onder de 1500 MB vrij
    (AXE_DAX_MIN_FREE_MB, sinds de OOM van 29 sep), waardoor geen enkele
    DAX-bot nog draaide. 30 minuten: warm zolang hij gebruikt wordt, daarna
    vrij. Een getal (bv. "-1") gaat als getal mee, zoals Ollama het verwacht.
    """
    v = os.environ.get("AXE_OLLAMA_KEEP_ALIVE", "30m").strip() or "30m"
    try:
        return int(v)
    except ValueError:
        return v
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Groq eerst, OpenAI als reserve (25 sep). Gemini gaf 402 "prepayment credits
# are depleted" en de llama-terugval op deze box deed over één `df` minuten,
# met de swap vol. Gemeten vanaf de VPS: gpt-oss-120b op Groq geeft een goede
# tool-call in 0,23s, gpt-4.1-mini op OpenAI in 1,3s. Zonder key slaat de lus
# die stap gewoon over.
GROQ_MODEL = os.environ.get("AXE_AGENT_GROQ_MODEL", "openai/gpt-oss-120b")
OPENAI_MODEL = os.environ.get("AXE_AGENT_OPENAI_MODEL", "gpt-4.1-mini")
CEREBRAS_MODEL = os.environ.get("AXE_AGENT_CEREBRAS_MODEL", "gpt-oss-120b")
XAI_MODEL = os.environ.get("AXE_AGENT_XAI_MODEL", "grok-4.5")
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions"
_XAI_URL = "https://api.x.ai/v1/chat/completions"
# OpenRouter: OpenAI-compat gateway to many models (incl. free Claude/Gemini
# routes when the key has balance). Already configured on the VPS for probes.
OPENROUTER_MODEL = os.environ.get("AXE_AGENT_OPENROUTER_MODEL", "openrouter/auto")
_OPENROUTER_URL = os.environ.get(
    "AXE_AGENT_OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions"
).rstrip("/")
# Short cool-down for a minute/TPM 429 so we do not hammer the same bucket
# every step, but still retry soon (unlike a day quota).
_AFKOEL_MINUUT = 60.0

# Cheap insurance on a box that also serves the API. This is not a security
# boundary -- the agent legitimately has shell here -- it only catches the
# catastrophic typo that would take the VPS down with it.
_REFUSED = (
    "rm -rf /", "rm -rf /*", "mkfs", "shutdown", "reboot", "halt",
    "dd if=", ":(){", "> /dev/sda", "chmod -R 000 /",
)


def _refuse(command: str) -> str | None:
    lowered = " ".join(command.lower().split())
    for pattern in _REFUSED:
        if pattern in lowered:
            return f"Refused: command matches the destructive pattern {pattern!r}."
    return None


# Two tiers, not one gate. Asking a human before every `ls` would turn the agent
# back into a remote keyboard and defeat the point of it running unattended --
# but letting it restart services or push to git unattended is a different
# proposition. So: looking around, and working inside its own workspace, is
# free; anything that reaches beyond that asks first.
#
# This is also what finally gives core_approvals a reason to exist. That table
# has never held a single row, because nothing in the system ever requested an
# approval. These commands are the thing that requests one.
_NEEDS_APPROVAL = (
    "systemctl", "service ", "docker", "apt ", "apt-get", "dpkg", "pip install",
    "npm install", "yarn add", "git push", "git commit", "ssh ", "scp ",
    "crontab", "useradd", "usermod", "passwd", "ufw", "iptables", "nginx",
    "certbot", "psql", "supabase",
)

# Binnen een DAX-container vrij (zie approval_reason).
_DAX_VRIJ = ("pip install", "npm install", "yarn add")

# Mail en berichten gaan nooit zonder Luka's ok de deur uit, welke taak het
# ook is (25 sep). Taken uit het gesprek komen nu echt hier aan, en een shell
# op de box waar NorthSea en de mailbox draaien kan anders met één curl mailen.
_OUTBOUND_NEEDS_APPROVAL = (
    "sendmail", "smtplib", "resend", "mail -s", "mailx",
    "northsea_verstuur", "/send", "send_email", "send-email",
)

# Alleen-lezen taken (NorthSea vanuit het gesprek): niets schrijven, niets
# posten. Lezen blijft vrij.
_READ_ONLY_NEEDS_APPROVAL = (
    "curl -x post", "curl -x put", "curl -x patch", "curl -x delete",
    "curl -d", "curl --data", "--data-raw", "requests.post", "requests.put",
    "requests.delete", "httpx.post", "httpx.put", "httpx.delete",
    "rm ", "mv ", "cp ", "tee ", "truncate", "chmod", "chown", ">",
)
# 20 nov: die lijst werd als losse tekst gezocht, dus "cp " zat in
# "northsea-mcp --since" en "rm " in "form ": elk leescommando op de NorthSea-
# dienst werd een goedkeuringsvraag (13 in 8 minuten). En `curl -s -X POST`
# ontsnapte, omdat alleen `curl -x post` direct achter elkaar telde. Nu: echte
# commando's (begin van de regel of na ; & | ( ), en curl met POST/data ergens.
_SCHRIJF_COMMANDO = re.compile(r"(?:^|[\s;&|(])(rm|mv|cp|tee|truncate|chmod|chown)(?=\s|$)")
_CURL_SCHRIJFT = re.compile(r"\bcurl\b[^|;&]*\s(?:-x\s*(?:post|put|patch|delete)\b|-d\b|--data(?:-raw|-binary)?\b|-f\b|--form\b)")
_PY_SCHRIJFT = re.compile(r"\b(?:requests|httpx)\.(?:post|put|patch|delete)\b")


def schrijft_in_leestaak(schoon: str) -> str | None:
    """Wat er in een alleen-lezen taak iets zou veranderen, of None."""
    for onschuldig in _ONSCHULDIGE_OMLEIDING:
        schoon = schoon.replace(onschuldig, "")
    m = _SCHRIJF_COMMANDO.search(schoon)
    if m:
        return m.group(1)
    if _CURL_SCHRIJFT.search(schoon):
        return "curl write"
    m = _PY_SCHRIJFT.search(schoon)
    if m:
        return m.group(0)
    if ">" in schoon:
        return ">"
    return None


# Omleidingen die niets schrijven, zodat `2>/dev/null` een leestaak niet stopt.
_ONSCHULDIGE_OMLEIDING = ("2>&1", "&>/dev/null", "2>/dev/null", ">/dev/null")

# Geld. Een order plaatsen of wijzigen gaat nooit zonder Luka's ok, welke agent
# het ook vraagt. Nu de Trading Agent een eigen brief krijgt (AGENT_BRIEFS) en
# echt trading-werk toegewezen kan krijgen, is een shell op deze box één curl
# verwijderd van een echte MT5-order.
#
# Dit zijn de werkelijke ingangen, opgezocht in de app en niet verzonnen:
#   brokerPlaceOrder / brokerPlacePendingOrder  (gateways/brokerConnector.ts)
#   metaApiMarketOrder / metaApiPendingOrder / metaApiTradeAction
#                                               (gateways/metaApiService.ts)
#   executeDemoTrade                            (het papieren boek)
#   ORDER_TYPE_*/POSITION_MODIFY/ORDER_MODIFY/ORDER_CANCEL
#                                               (MetaAPI's actionType)
#   mt-client-api-v1.*.agiliumtrade.ai/.../trade (de REST-ingang zelf)
#   /trading/order                              (de API op deze box)
# Openen én wijzigen staan er allebei in: een stop-loss verzetten is net zo
# goed geld als een nieuwe order.
_ORDER_NEEDS_APPROVAL = (
    "place_order", "placeorder", "brokerplaceorder", "brokerplacependingorder",
    "metaapimarketorder", "metaapipendingorder", "metaapitradeaction",
    "executedemotrade", "/trading/order", "mt-client-api", "agiliumtrade",
    "order_type_buy", "order_type_sell", "position_modify", "position_close",
    "order_modify", "order_cancel",
)


def approval_reason(command: str, cwd: str | None, read_only: bool = False) -> str | None:
    """Return why this command needs Luka's approval, or None if it may run free.

    Conservative in one direction only: an unrecognised command that stays
    inside the workspace runs, because the alternative is an agent that stops
    every few steps and finishes nothing. What earns a prompt is reaching
    *outside* the workspace, or touching the machine itself.

    In-plan vrijstellingen (DAX /dax/artifacts, alleen-lezen inspectie zoals
    `apt list --installed`) komen uit beslis_beleid — anders parkeert `apt `
    in _NEEDS_APPROVAL elke health-check.
    """
    lowered = " ".join(command.lower().split())
    try:
        from beslis_beleid import shell_auto_reden, workspace_is_dax
        dax = _HUIDIGE_DAX.get() is not None or workspace_is_dax(cwd)
        if shell_auto_reden(command, dax=dax or "/dax/" in (command or "")):
            return None
    except Exception:
        pass
    # Op een eigen DAX-computer is pakketten installeren werk in de eigen
    # werkplek: de container is van deze agent, niet van de VPS. Alles wat de
    # buitenwereld raakt (git push, ssh, systemctl, docker, mail, orders) blijft
    # gewoon om Luka vragen.
    vrij = _DAX_VRIJ if _HUIDIGE_DAX.get() is not None else ()

    for pattern in _NEEDS_APPROVAL:
        if pattern in lowered and pattern not in vrij:
            return f"touches the system ({pattern.strip()})"

    for pattern in _OUTBOUND_NEEDS_APPROVAL:
        if pattern in lowered:
            return f"sends something out ({pattern.strip()})"

    for pattern in _ORDER_NEEDS_APPROVAL:
        if pattern in lowered:
            return f"places or changes an order ({pattern.strip()})"

    if read_only:
        schoon = lowered
        for onschuldig in _ONSCHULDIGE_OMLEIDING:
            schoon = schoon.replace(onschuldig, "")
        gevonden = schrijft_in_leestaak(schoon)
        if gevonden:
            return f"changes something in a read-only task ({gevonden})"

    # Writing outside the workspace. Reading outside stays free -- the agent has
    # to be able to look at its own source in order to work on it.
    workspace = _HUIDIGE_WORKSPACE.get()
    workdir = os.path.realpath(cwd or workspace)
    if not workdir.startswith(os.path.realpath(workspace)):
        writes = ("rm ", "mv ", "cp ", "tee ", "truncate", "chmod", "chown", ">")
        if any(token in lowered for token in writes):
            return f"writes outside the workspace ({workdir})"

    return None


class ApprovalRequired(Exception):
    """Raised when the agent needs a command Luka has not approved.

    Not a failure. task_runtime.request_approval already parks the task in
    `waiting_approval` and releases the lease, and deciding it puts the task
    back to `queued` — so the durable machinery for pausing and resuming was
    always there. This exception is only how the loop hands control back.
    """

    def __init__(self, command: str, reason: str):
        super().__init__(f"needs approval ({reason}): {command}")
        self.command = command
        self.reason = reason


class TaskCancelled(Exception):
    """De taak is onderweg geannuleerd; de lus stopt waar hij staat.

    Ook geen mislukking. De lus draait tot een half uur door, dus "stop" moet
    ergens aankomen tussen twee stappen in: run_agent_loop vraagt het na aan
    `should_stop`, vóór elke modelaanroep en vóór elke tooluitvoering, en gooit
    dit als het antwoord True is. De aanroeper (task_runtime.cancel) zet de taak
    daarna op `cancelled` -- een geannuleerde taak is geen error-taak.
    """


def normalize_command(command: str) -> str:
    """Whitespace-insensitive key for comparing an approved command to a rerun.

    Without this the resumed attempt asks for approval again the moment the
    model reformats its own command by a space, and the task loops between
    queued and waiting_approval forever.
    """
    return " ".join(command.split())


from northsea_gateway import AGENT_LEESACTIES as _NORTHSEA_LEESACTIES  # noqa: E402

# Een desk-antwoord kan groot zijn (een hele draad); het model krijgt een kop.
NORTHSEA_MAX_CHARS = 12000


async def _northsea_lees(actie: str, params: Any) -> dict[str, Any]:
    """Eén leesactie op de echte NorthSea-desk. Alleen de lijst hierboven; een
    fout wordt een antwoord aan het model, geen crash van de lus."""
    if actie not in _NORTHSEA_LEESACTIES:
        return {"error": f"{actie!r} is not a NorthSea read action",
                "allowed": list(_NORTHSEA_LEESACTIES)}
    import northsea_gateway
    try:
        antwoord = await northsea_gateway.call_action(actie, params if isinstance(params, dict) else {})
    except northsea_gateway.NorthSeaGatewayError as e:
        return {"error": e.code, "message": e.message}
    tekst = json.dumps(antwoord, default=str, ensure_ascii=False)
    if len(tekst) > NORTHSEA_MAX_CHARS:
        return {"truncated": True, "result_head": tekst[:NORTHSEA_MAX_CHARS]}
    return antwoord if isinstance(antwoord, dict) else {"result": antwoord}


TOOL_DECLARATIONS = [
    {
        "name": "run_shell",
        "description": (
            "Run a shell command on the AXE VPS and get back stdout, stderr and the "
            "exit code. This is how you inspect and change the system. Prefer small, "
            "checkable commands over one long chain so you can see where it breaks."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The command to run."},
                "cwd": {"type": "string", "description": f"Working directory. Defaults to {WORKSPACE}."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a text file. Use this before editing so you change what is actually there.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "max_bytes": {"type": "integer", "description": "Default 60000."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write a file, creating parent directories as needed. Overwrites. "
            "Returns the number of bytes written so you can confirm it landed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "list_devices",
        "description": (
            "List Luka's Macs that can act for you (Mac mini, iMac), whether each is "
            "online, and which workspaces it has. Call this before run_on_device."
        ),
        "parameters": {
            "type": "object",
            "properties": {"include_offline": {"type": "boolean", "description": "ignored; offline Macs are always listed"}},
        },
    },
    {
        "name": "run_on_device",
        "description": (
            "Run one action on one of Luka's Macs through its computer-worker. Use "
            "this for anything about a Mac: its files, apps, screen, repo checkouts. "
            "run_shell is the VPS, not a Mac. The Mac worker can inspect and change "
            "workspace files; observe/control screen, pointer, keyboard, windows and apps; "
            "run typecheck/lint/test/build/install or an approved free terminal command; "
            "create branches, inspect/commit/push/merge/open PRs; and delegate coding work "
            "to claude_code.run, codex.run or cursor.run (these REQUIRE args.prompt: the "
            "full instruction for the coding agent). Use the narrowest tool that does "
            "the job. Clicking, typing and writes are approval-gated; consequential actions "
            "such as terminal.free, git push/merge/PR and delete always require the exact "
            "approval and cannot be approved by voice."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "device": {"type": "string", "description": "device id from list_devices"},
                "tool": {"type": "string"},
                "args": {"type": "object", "description": "the tool's arguments"},
                "workspace": {"type": "string", "description": "AXE Core (default), AXE Companion or Trading OS"},
            },
            "required": ["device", "tool"],
        },
    },
    {
        "name": "northsea_read",
        "description": (
            "Read the live NorthSea desk (deals, blockers, mails and their thread, "
            "what waits on Luka, health). Read-only: it can never send, approve or "
            "change anything. Deals: DEAL-001, a UUID or '#idprefix'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": list(_NORTHSEA_LEESACTIES)},
                "params": {"type": "object", "description": "e.g. {\"deal\": \"DEAL-002\"} or {\"communication\": \"<id>\"}"},
            },
            "required": ["action"],
        },
    },
    {
        "name": "run_crew",
        "description": (
            "Run this agent's CrewAI crew as the execution layer. Use when the "
            "workspace has a crew configured. Do not send Luka to the CrewAI "
            "gallery page — this is how the crew actually runs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task": {"type": "string", "description": "What the crew must do."},
                "specialists": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional specialist ids. Defaults to the workspace crew.",
                },
            },
            "required": ["task"],
        },
    },
    {
        "name": "finish",
        "description": (
            "Call this ONLY when the work is actually done and you can prove it. "
            "You must supply a command that demonstrates the result exists, and a "
            "string that must appear in that command's output. The worker runs the "
            "command itself and checks. If the proof fails you will be told, and you "
            "must keep working -- a description of what you intended does not count "
            "as finished."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": (
                        "The answer itself, spoken to Luka: the concrete findings or "
                        "what now exists (numbers, names, paths). 1-3 short sentences."
                    ),
                },
                "verify_command": {
                    "type": "string",
                    "description": (
                        "A command proving the work exists, e.g. "
                        "'ls /opt/axe-workspace/Trading' or 'python3 -c \"import mod\"'."
                    ),
                },
                "expect_in_output": {
                    "type": "string",
                    "description": "A substring that must appear in that command's output.",
                },
            },
            "required": ["summary", "verify_command", "expect_in_output"],
        },
    },
]

SYSTEM_PROMPT = f"""You are AXE, operating your own infrastructure on the AXE VPS.

You have a real shell and a real filesystem. Your working directory is {WORKSPACE}.

The single most important rule: DO THE WORK, do not describe it. A plan is not a
deliverable. If the user asks you to create something, create it, then look at
what you created and confirm it is there. You are being measured on what exists
when you stop, not on what you said you would do.

How to work:
  - Look before you change. Read the file, list the directory, check the state.
  - Take small steps and check the result of each one.
  - If a command fails, read the error and adapt. Do not repeat it unchanged.
  - When you believe you are done, call finish() with a command that PROVES it.
    The worker will run that command. If the proof fails you will be sent back
    to keep working, so make the proof something that genuinely demonstrates
    the result.

The summary you give finish() is read out loud to Luka, mid-conversation.
Make it the ANSWER, not a description of your work: say what you found or
what now exists, with the concrete facts (numbers, names, paths). "The root
disk has 161 GB free and the server has been up for 1 day 21 hours" -- not
"Reported the free disk space". One to three short sentences.

Luka has devices, and you pick where each piece of work happens:
  - the VPS (run_shell, read_file, write_file): servers, APIs, the planner.
  - his Macs (list_devices, run_on_device): the Mac mini is the brain, the iMac
    the executor. Anything about a Mac's files, apps or screen goes there, to
    the Mac it is about. If he names no Mac, use whichever is online, Mac mini
    first. If a Mac is offline, say so rather than guessing its state.
When the proof for finish() lives on a Mac, verify with a VPS command that
echoes the fact you observed there (e.g. `echo "iMac frontmost: Safari"`),
having seen it in a run_on_device answer in this task.

For code work on a Mac, do not pretend the VPS checkout is the user's live app.
The repos, git and Luka's GitHub login live on his Macs, NOT on this VPS: never
report "no git/merge environment here" -- go to the Mac. Use list_devices, pick
the machine that advertises the workspace, then claude_code.run/codex.run/
cursor.run: on the protected checkout these create their OWN worktree on a new
axe/<date>-<id> branch automatically (do not git.create_branch on Luka's
checkout; that would move the branch his autosync runs on). Push that branch
and open a PR with the Mac's git tools; merging a PR into orchestrator is a
merge, which Luka approves. Verify on that same device.
A coding agent is your colleague, not an oracle. Give it the whole job in
args.prompt (what, which repo/files, what done looks like); AXE wraps it in a
fixed work order. Its answer comes back with an "oplevering": samenvatting,
tests, risicos, branch, commits, diff, compleet. Report exactly that to Luka in
plain words (what changed, which tests ran with what result, the risks, the
branch). If compleet is false, say what is missing and either send the agent
back with a narrower prompt or ask Luka -- never call it done. The installed AXE app is updated only from orchestrator, so
do not claim a feature is live until the canonical update has actually landed.

Where AXE itself lives on this VPS (do not guess unit names):
  - systemd units that exist: axe-core-api, axe-task-worker, northsea-mcp.
  - The managers (axemanager, projectsmgr, companionmgr, axon, tradingos,
    northseamgr) are NOT systemd services. They are standing schedules: rows in
    the core_schedules table with job_key 'axe_core:staande-<id>', every run in
    core_job_runs, and what they told Luka in core_manager_messages. To check
    whether they run and what they found, read those (GET /cron/schedules on the
    local API, or the database), not systemctl.
  - Reading status or logs (systemctl status, journalctl) is free; starting,
    stopping or restarting a service needs Luka's approval.

You have {MAX_STEPS} steps. Use them."""


# Brieven en werkplekken staan in agent_workspace.py. AGENT_BRIEFS blijft
# hier een naam zodat bestaande tests (test_agent_briefs) hem blijven zien.


# De brief van de agent die déze beurt draait. Een ContextVar en geen extra
# parameter op _call_model: die functie wordt in tests vervangen door een dubbel
# met twee parameters, en een derde argument zou dat stilzwijgend breken. Elke
# asyncio-taak krijgt zijn eigen kopie van de context, dus twee worker-slots
# naast elkaar zien elkaars brief nooit.
_HUIDIGE_WORKSPACE: contextvars.ContextVar[str] = contextvars.ContextVar(
    "axe_task_workspace", default=WORKSPACE,
)

_HUIDIGE_BRIEF: contextvars.ContextVar[str] = contextvars.ContextVar(
    "axe_agent_brief", default=""
)

_HUIDIGE_AGENT_WS: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "axe_agent_workspace", default=None,
)
# 19 nov: de roster-id van deze beurt, voor de managercontext.
_HUIDIGE_AGENT: contextvars.ContextVar[str | None] = contextvars.ContextVar("axe_agent", default=None)
# Sprint 5 (24 nov): de opdracht (voor relevante lessen) en de taak (voor memory-refs).
_HUIDIGE_DOEL: contextvars.ContextVar[str] = contextvars.ContextVar("axe_doel", default="")
_HUIDIGE_TAAK: contextvars.ContextVar[str | None] = contextvars.ContextVar("axe_taak", default=None)

_HUIDIGE_DEVICE: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "axe_pinned_device", default=None,
)

# De DAX-computer waarop deze beurt uitvoert (dax.DaxUitvoerder), of None.
# Gezet = run_shell/read_file/write_file gaan naar die persistente computer in
# plaats van naar de VPS zelf. De weigerlijst en de approval-regels blijven
# precies dezelfde: alleen de plek van uitvoeren verandert, niet wat mag.
_HUIDIGE_DAX: contextvars.ContextVar[Any] = contextvars.ContextVar(
    "axe_dax_executor", default=None,
)


def _tool_decls() -> list[dict[str, Any]]:
    """Alleen de tools van déze werkplek. Zonder filter ziet iedereen run_crew."""
    ws = _HUIDIGE_AGENT_WS.get()
    toegestaan = set(tools_voor(ws)) if ws else {d["name"] for d in TOOL_DECLARATIONS}
    return [d for d in TOOL_DECLARATIONS if d["name"] in toegestaan]


def systeem_prompt() -> str:
    """De system prompt zoals het model hem deze beurt krijgt: brief + basis."""
    brief = _HUIDIGE_BRIEF.get()
    workspace = _HUIDIGE_WORKSPACE.get()
    basis = SYSTEM_PROMPT.replace(WORKSPACE, workspace)
    extra: list[str] = []
    ws = _HUIDIGE_AGENT_WS.get()
    if ws:
        extra.append(f"Workspace role: {ws.get('role')}.")
        extra.append(f"Memory scope: {ws.get('memory_scope')}.")
        crew = crew_voor(ws)
        if crew:
            extra.append(
                "CrewAI is the execution layer for this agent. Call run_crew "
                f"with specialists {', '.join(crew)} — do not send Luka to the CrewAI gallery."
            )
        if ws.get("preferred_device"):
            extra.append(f"Preferred device: {ws['preferred_device']}.")
        master = str(ws.get("master_prompt") or "").strip()
        if master:
            extra.append(master)
        if ws.get("model_tier"):
            extra.append(f"Model tier: {ws['model_tier']}.")
        if ws.get("cadence"):
            extra.append(f"Cadence: {ws['cadence']}.")
    dax = _HUIDIGE_DAX.get()
    if dax is not None:
        extra.append(
            f"You execute on your own persistent DAX computer {dax.computer.id}. run_shell, "
            "read_file and write_file run there, not on the VPS. /dax/workspace survives "
            "restarts (your task folder is the cwd); /dax/artifacts is for results; the "
            "persistent browser profile is used by `dax-browser` (cookies and logins stay)."
        )
    pinned = _HUIDIGE_DEVICE.get()
    if pinned == "vps":
        extra.append("Luka pinned this job to the VPS. Use run_shell, not a Mac.")
    elif pinned:
        extra.append(
            f"Luka pinned this job to {pinned}. Use run_on_device with that "
            "device. Do not switch machine."
        )
    mgr = _manager_context(_HUIDIGE_AGENT.get(), doel=_HUIDIGE_DOEL.get(), taak_id=_HUIDIGE_TAAK.get())
    if mgr:
        extra.append(mgr)
    log = _gedeeld_log_context()
    if log:
        extra.append(log)
    kop = brief
    if extra:
        kop = f"{brief}\n\n" + "\n".join(extra) if brief else "\n".join(extra)
    return f"{kop}\n\n{basis}" if kop else basis


_LOG_CACHE: dict[str, Any] = {"t": 0.0, "tekst": ""}
_MGR_CACHE: dict[str, tuple[float, str]] = {}


_LESREFS_GEDAAN: set[str] = set()


def _bewaar_lesrefs(db: Any, taak_id: str | None, ids: list[str]) -> None:
    """Memory-refs: welke lessen in de context van deze taak stonden (taak.metadata.used_lessons).
    taak_verslag telt bij het afronden per les goed/slecht. Eén keer per taak."""
    if not taak_id or not ids or taak_id in _LESREFS_GEDAAN:
        return
    _LESREFS_GEDAAN.add(taak_id)
    try:
        rij = (db.table("core_tasks").select("metadata").eq("id", taak_id).limit(1).execute().data or [{}])[0]
        meta = rij.get("metadata") if isinstance(rij.get("metadata"), dict) else {}
        db.table("core_tasks").update({"metadata": {**meta, "used_lessons": ids[:5]}}).eq("id", taak_id).execute()
    except Exception:  # noqa: BLE001 -- een memory-ref breekt nooit een taak
        pass


def _manager_context(agent: str | None, nu: float | None = None, doel: str = "",
                     taak_id: str | None = None) -> str:
    """19 nov (audit, punt 1): de compacte wereld van déze manager -- open taken,
    wat op Luka wacht, wat mislukte, wat hij zelf deed, wat hij mag.
    Per manager hooguit eens per minuut gelezen."""
    import time as _t
    if not agent:
        return ""
    nu = _t.time() if nu is None else nu
    sleutel = f"{agent}|{(doel or '')[:200]}"
    vorig = _MGR_CACHE.get(sleutel)
    if vorig and nu - vorig[0] < 60:
        return vorig[1]
    tekst = ""
    try:
        import manager_context as _mc
        db = _db_voor_stoelen()
        if db is not None:
            tekst, _b, ids = _mc.lees_context_met_lessen(db, agent, doel=doel or None)
            _bewaar_lesrefs(db, taak_id, ids)
    except Exception:  # noqa: BLE001
        tekst = ""
    _MGR_CACHE[sleutel] = (nu, tekst)
    return tekst


def _gedeeld_log_context(nu: float | None = None) -> str:
    """18 nov (Luka): elke AI begint met het gedeelde log van de andere sessies.
    Hooguit eens per minuut gelezen; een leesfout geeft gewoon geen context."""
    import time as _t
    nu = _t.time() if nu is None else nu
    if nu - float(_LOG_CACHE["t"]) < 60:
        return str(_LOG_CACHE["tekst"])
    tekst = ""
    try:
        import gedeeld_log as _gl
        db = _db_voor_stoelen()
        if db is not None:
            rijen = (db.table("core_manager_messages").select("from_agent,body,created_at").eq("to_agent", _gl.LOG)
                     .order("created_at", desc=True).limit(10).execute().data) or []
            tekst = _gl.context_tekst([_gl.als_regel(r) for r in rijen])
            lessen = (db.table("core_manager_messages").select("body,created_at").eq("to_agent", _gl.LESSEN)
                      .order("created_at", desc=True).limit(_gl.MAX_LESSEN_IN_PROMPT).execute().data) or []
            les = _gl.lessen_tekst(lessen)
            tekst = "\n\n".join(x for x in (les, tekst) if x)
    except Exception:  # noqa: BLE001
        tekst = ""
    _LOG_CACHE.update(t=nu, tekst=tekst)
    return tekst


class ProviderUitgeput(RuntimeError):
    """Een provider die de rest van de dag toch niets meer gaat doen.

    Twee gevallen, allebei echt gebeurd: Groq's 429 met een dagquotum en
    Gemini's 402 "prepayment credits are depleted". Erft van RuntimeError, zodat
    elke bestaande `except Exception`/`except RuntimeError` onveranderd werkt en
    de foutregel er hetzelfde uitziet als voorheen.
    """

    def __init__(self, provider: str, status: int, body: str, retry_after: float | None = None):
        super().__init__(f"{provider} {status}: {body[:300]}")
        self.status = status
        self.body = body
        self.retry_after = retry_after


class ContextTeGroot(RuntimeError):
    """Request body past niet in het contextvenster / TPM-payload van de provider.

    Groq geeft dit als HTTP 413 ("Request too large ... TPM"). Geen lange
    afkoeling: de payload zelf is te dik. Oplossing = inkorten en opnieuw
    proberen, daarna de volgende geconfigureerde provider met dezelfde
    ingekorte context. Bestaande keys only — geen nieuwe secrets.
    """

    def __init__(self, provider: str, status: int, body: str):
        super().__init__(f"{provider} {status}: {body[:300]}")
        self.status = status
        self.body = body


# Soft budget for Gemini-shaped contents (chars ≈ tokens/4). Leaves room for
# system prompt + tool decls + completion. Aggressive enough that a Step-1
# `ls -R` of a fat tree still fits Groq's free TPM bucket after one trim.
_CONTEXT_CHAR_BUDGET = 100_000
_TOOL_RESPONSE_TRIM = 6_000
_TE_GROOT_MARKERS = (
    "request too large",
    "payload too large",
    "context_length_exceeded",
    "maximum context length",
    "context window",
    "too many tokens",
    "prompt is too long",
    "token count exceeds",
    "exceeds the model",
)


def _is_te_groot(status: int, body: str) -> bool:
    if status == 413:
        return True
    laag = (body or "").lower()
    return any(m in laag for m in _TE_GROOT_MARKERS)


def _estimate_contents_chars(contents: list[dict[str, Any]]) -> int:
    """Rough size of the conversation we would ship (not counting tools/system)."""
    total = 0
    for entry in contents:
        for part in entry.get("parts") or []:
            if part.get("text"):
                total += len(part["text"])
            elif "functionCall" in part:
                total += len(json.dumps(part["functionCall"], default=str))
            elif "functionResponse" in part:
                total += len(json.dumps(part["functionResponse"], default=str))
    return total


def _knip_tekst(tekst: str, max_chars: int) -> str:
    """Keep head + tail so errors and final lines survive a fat shell dump."""
    if max_chars <= 0:
        return ""
    if len(tekst) <= max_chars:
        return tekst
    if max_chars < 80:
        return tekst[:max_chars]
    head = max_chars // 2
    tail = max_chars - head - 40
    weggelaten = len(tekst) - head - max(tail, 0)
    midden = "\n...[%d chars omitted to fit model limit]...\n" % weggelaten
    return tekst[:head] + midden + tekst[-max(tail, 0):]


def _trim_function_response(response: Any, max_chars: int) -> Any:
    if isinstance(response, dict):
        out: dict[str, Any] = {}
        for key, value in response.items():
            if isinstance(value, str) and len(value) > max_chars // 2:
                out[key] = _knip_tekst(value, max_chars // 2)
            elif isinstance(value, (dict, list)):
                raw = json.dumps(value, default=str)
                if len(raw) > max_chars:
                    out[key] = _knip_tekst(raw, max_chars)
                else:
                    out[key] = value
            else:
                out[key] = value
        raw = json.dumps(out, default=str)
        if len(raw) > max_chars:
            return {"truncated": True, "preview": _knip_tekst(raw, max_chars)}
        return out
    if isinstance(response, str):
        return _knip_tekst(response, max_chars)
    raw = json.dumps(response, default=str)
    return _knip_tekst(raw, max_chars) if len(raw) > max_chars else response


def _trim_contents(
    contents: list[dict[str, Any]],
    budget: int = _CONTEXT_CHAR_BUDGET,
) -> list[dict[str, Any]]:
    """Shrink conversation so the next provider call fits model/TPM limits.

    Keeps the original brief (first user turn) and the most recent turns.
    Fat tool payloads are head+tail truncated. Middle history is dropped with
    a short placeholder so the model knows work already happened.
    """
    if not contents:
        return contents
    if _estimate_contents_chars(contents) <= budget:
        # Still harden individual tool dumps — a single 60k read blows TPM.
        hardened: list[dict[str, Any]] = []
        for entry in contents:
            parts = entry.get("parts") or []
            nieuw_parts = []
            for part in parts:
                if "functionResponse" in part:
                    fr = part["functionResponse"]
                    nieuw_parts.append({
                        "functionResponse": {
                            "name": fr.get("name"),
                            "response": _trim_function_response(
                                fr.get("response"), _TOOL_RESPONSE_TRIM
                            ),
                        }
                    })
                else:
                    nieuw_parts.append(part)
            hardened.append({**entry, "parts": nieuw_parts})
        if _estimate_contents_chars(hardened) <= budget:
            return hardened
        contents = hardened

    first = contents[0]
    rest = contents[1:]
    # Cap every tool response first.
    capped: list[dict[str, Any]] = [first]
    for entry in rest:
        parts = entry.get("parts") or []
        nieuw_parts = []
        for part in parts:
            if "functionResponse" in part:
                fr = part["functionResponse"]
                nieuw_parts.append({
                    "functionResponse": {
                        "name": fr.get("name"),
                        "response": _trim_function_response(
                            fr.get("response"), _TOOL_RESPONSE_TRIM
                        ),
                    }
                })
            elif part.get("text") and len(part["text"]) > _TOOL_RESPONSE_TRIM:
                nieuw_parts.append({"text": _knip_tekst(part["text"], _TOOL_RESPONSE_TRIM)})
            else:
                nieuw_parts.append(part)
        capped.append({**entry, "parts": nieuw_parts})

    if _estimate_contents_chars(capped) <= budget:
        return capped

    # Drop oldest middle turns until under budget; keep first + recent tail.
    keep_tail = list(capped[1:])
    while keep_tail and _estimate_contents_chars([capped[0]] + keep_tail) > budget:
        # Drop from the front of the middle (oldest after the brief).
        keep_tail.pop(0)
    placeholder = {
        "role": "user",
        "parts": [{"text": (
            "Earlier tool results were omitted to fit the model context limit. "
            "Continue from the recent transcript; re-read a file only if you still need it."
        )}],
    }
    out = [capped[0]]
    if keep_tail:
        # Avoid double-placeholder noise if the next turn is already a nudge.
        out.append(placeholder)
        out.extend(keep_tail)
    return out


# Afkoeling per provider. Zonder dit probeert de lus elke stap opnieuw Groq
# (dagquotum op) en Gemini (credits op): tot veertig keer dezelfde 429/402 per
# taak, veertig keer dezelfde regel in het log, en elke stap twee nutteloze
# HTTP-rondjes voordat de provider die het wél doet aan de beurt is.
# Sleutel = de naam uit de attempts-lijst, waarde = monotone tijd waarop hij
# weer meedoet.
_AFKOELING: dict[str, float] = {}
_STOEL_AFKOELING: dict[str, float] = {}
STOEL_AFKOELING_S = 30 * 60

_STOEL_LIMIET = re.compile(
    r"hit your (session|weekly|daily|usage)? ?limit|session limit|weekly limit|usage limit|rate limit"
    r"|not logged in|please run /login|failed to authenticate|oauth session expired"
    r"|api key is invalid|invalid api key|provided api key",
    re.I,
)


def stoel_limiet_of_fout(output: str) -> str | None:
    """De reden als een stoel-run geen antwoord gaf maar een weigering van de CLI.

    24 nov gemeten: 'You've hit your session limit · resets 2:30am' kwam als gewone
    tekst terug; de lus zei 'You produced text but took no action' en startte een
    nieuwe claude_code.run -- 436 in twee uur op de iMac."""
    fout = device_actions.motor_fout(output)
    if fout:
        return fout
    # ANSI-kleurcodes eruit (Cursor: "\x1b[33m⚠ Warning: The provided API key is invalid").
    kop = re.sub(r"\x1b\[[0-9;]*m", "", (output or "").split("\n## Oplevering (Mac)")[0]).strip()
    # Alleen korte antwoorden: een echt antwoord dat het woord 'rate limit' noemt is geen weigering.
    if len(kop) < 400 and _STOEL_LIMIET.search(kop):
        return " ".join(kop.split())[:240]
    try:
        d = json.loads(kop)
        res = str(d.get("result") or "") if isinstance(d, dict) else ""
        if res and len(res) < 400 and _STOEL_LIMIET.search(res):
            return " ".join(res.split())[:240]
    except ValueError:
        pass
    return None
_OPENROUTER_FREE_START = cycle((0, 1, 2))

# Credits zijn niet aan een dag gebonden: die komen terug als Luka bijvult.
# Zes uur is lang genoeg om de taak niet te vertragen en kort genoeg dat een
# bijgevulde provider dezelfde dag weer meedraait.
_AFKOEL_CREDITS = 6 * 3600
# Een Retry-After die verder ligt dan een dag geloven we niet blind.
_AFKOEL_MAX = 24 * 3600

# Een 429 kan een piek van een minuut zijn of een dagquotum. Alleen het tweede
# verdient afkoeling; een minuutlimiet is over voordat de volgende stap begint.
# De minuut-markers gaan voor, want Gemini zegt "Quota exceeded ... per minute".
_MINUUT_MARKERS = ("per minute", "per-minute", "per second", "rpm", "tpm")
_DAG_MARKERS = ("per day", "per-day", "perday", "daily", "rpd", "tpd", "quota exceeded")


def _is_dagquotum(body: str) -> bool:
    laag = body.lower()
    if any(m in laag for m in _MINUUT_MARKERS):
        return False
    return any(m in laag for m in _DAG_MARKERS)


def _seconden_tot_middernacht() -> float:
    """Tot de reset van het dagquotum (UTC), met een marge van een minuut."""
    nu = datetime.now(timezone.utc)
    morgen = (nu + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(60.0, (morgen - nu).total_seconds() + 60)


def _afkoelduur(exc: BaseException) -> float | None:
    """Hoe lang deze provider overgeslagen wordt, of None om het niet te doen."""
    if not isinstance(exc, ProviderUitgeput):
        return None
    body = getattr(exc, "body", "") or str(exc)
    if _is_credits_op(body) or exc.status == 402:
        if exc.retry_after and exc.retry_after > 0:
            return min(float(exc.retry_after), _AFKOEL_MAX)
        return _AFKOEL_CREDITS
    if exc.retry_after and exc.retry_after > 0:
        return min(float(exc.retry_after), _AFKOEL_MAX)
    if exc.status == 429 and not _is_dagquotum(body):
        return _AFKOEL_MINUUT
    return _seconden_tot_middernacht()


_CREDIT_MARKERS = (
    "no credits", "insufficient_quota", "credit_balance", "credits are depleted",
    "credits remaining", "billing hard limit", "prepayment credits",
)


def _is_credits_op(body: str) -> bool:
    laag = (body or "").lower()
    return any(m in laag for m in _CREDIT_MARKERS)


def _provider_fout(provider: str, response: Any) -> RuntimeError:
    """Vertaal een mislukte HTTP-poging naar de juiste fout.

    ProviderUitgeput bij:
      * credits op (402 of 429 met credit-tekst) → lange afkoeling
      * dagquotum 429 → tot middernacht
      * minuut/TPM 429 → korte backoff (_AFKOEL_MINUUT / Retry-After)

    ContextTeGroot bij HTTP 413 / "request too large" — trim + volgende
    provider, geen lange afkoeling (de payload is te dik, niet de wallet).

    Anders een gewone RuntimeError — een 500 of timeout is een incident.
    """
    body = response.text or ""
    status = response.status_code
    na = (response.headers or {}).get("retry-after")
    try:
        retry_after = float(na) if na is not None else None
    except (TypeError, ValueError):
        retry_after = None
    if status == 402 or _is_credits_op(body):
        return ProviderUitgeput(provider, status or 402, body, retry_after)
    if _is_te_groot(status, body):
        return ContextTeGroot(provider, status or 413, body)
    if status == 429:
        if _is_dagquotum(body):
            return ProviderUitgeput(provider, status, body, retry_after)
        # Minute / TPM: short cool so the next step skips this bucket.
        return ProviderUitgeput(
            provider, status, body,
            retry_after if (retry_after and retry_after > 0) else _AFKOEL_MINUUT,
        )
    return RuntimeError(f"{provider} {status}: {body[:300]}")


# Eén Ollama tegelijk. De VPS heeft 7,7GB en geen swap die dit opvangt: het
# model is al eens met een OOM door de hele box heen gegaan (AGENTS.md val 4).
# Zolang de worker één taak tegelijk draaide kwam dat niet samen, maar met K
# parallelle slots kunnen twee taken nu echt tegelijk op de terugval landen en
# twee keer hetzelfde model laden. De semafoor laat de tweede wachten in plaats
# van de box om te duwen.
_OLLAMA_SLOT = asyncio.Semaphore(1)


# Stroomonderbreker (20 nov): de modelbox op Strato draait op CPU en zat vol --
# elk verzoek hing tot de timeout van 300 s, en de worker probeerde het elke
# stap opnieuw ("ollama/llama3.1:8b-16k failed" om de 5 min in de log). Faalt
# hij of duurt hij te lang, dan slaat de lus hem een kwartier over; de andere
# aanbieders staan er al vóór.
OLLAMA_PAUZE_S = 15 * 60
_ollama_vol_tot = 0.0


def ollama_overslaan(nu: float | None = None) -> bool:
    return (time.monotonic() if nu is None else nu) < _ollama_vol_tot


def _ollama_pauzeer(nu: float | None = None) -> None:
    global _ollama_vol_tot
    _ollama_vol_tot = (time.monotonic() if nu is None else nu) + OLLAMA_PAUZE_S


async def _call_ollama_begrensd(contents: list[dict[str, Any]]) -> dict[str, Any]:
    """_call_ollama, maar nooit twee tegelijk, en niet als hij net vol zat."""
    if ollama_overslaan():
        raise RuntimeError("ollama skipped: the modelbox was full or too slow in the last 15 min")
    async with _OLLAMA_SLOT:
        if ollama_overslaan():
            raise RuntimeError("ollama skipped: the modelbox was full or too slow in the last 15 min")
        try:
            return await _call_ollama(contents)
        except Exception:
            _ollama_pauzeer()
            raise


def _shell(command: str, cwd: str | None = None) -> dict[str, Any]:
    refusal = _refuse(command)
    if refusal:
        return {"exit_code": 126, "stdout": "", "stderr": refusal}
    dax = _HUIDIGE_DAX.get()
    if dax is not None:
        return dax.shell(command, cwd)
    workdir = cwd or _HUIDIGE_WORKSPACE.get()
    os.makedirs(workdir, exist_ok=True)
    try:
        proc = subprocess.run(
            command, shell=True, cwd=workdir, capture_output=True,
            text=True, timeout=SHELL_TIMEOUT_SECONDS,
        )
        return {
            "exit_code": proc.returncode,
            "stdout": proc.stdout[-20000:],
            "stderr": proc.stderr[-8000:],
        }
    except subprocess.TimeoutExpired:
        return {
            "exit_code": 124, "stdout": "",
            "stderr": f"Timed out after {SHELL_TIMEOUT_SECONDS}s.",
        }


def _workspace_path(path: str) -> str:
    """Resolve relative agent file paths inside this task's private workspace."""
    if os.path.isabs(path):
        return path
    return os.path.join(_HUIDIGE_WORKSPACE.get(), path)

def _read(path: str, max_bytes: int = 60000) -> dict[str, Any]:
    dax = _HUIDIGE_DAX.get()
    if dax is not None:
        return dax.lees(path, max_bytes)
    path = _workspace_path(path)
    try:
        with open(path, "r", errors="replace") as handle:
            data = handle.read(max_bytes + 1)
        return {
            "content": data[:max_bytes],
            "truncated": len(data) > max_bytes,
        }
    except Exception as exc:
        return {"error": str(exc)}


def _write(path: str, content: str) -> dict[str, Any]:
    dax = _HUIDIGE_DAX.get()
    if dax is not None:
        return dax.schrijf(path, content)
    path = _workspace_path(path)
    try:
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w") as handle:
            handle.write(content)
        return {"bytes_written": len(content.encode()), "path": path}
    except Exception as exc:
        return {"error": str(exc)}


async def _call_gemini(contents: list[dict[str, Any]], api_key: str) -> dict[str, Any]:
    import httpx

    payload = {
        "contents": contents,
        "tools": [{"functionDeclarations": _tool_decls()}],
        "systemInstruction": {"parts": [{"text": systeem_prompt()}]},
        "generationConfig": {"temperature": 0.2},
    }
    url = _ENDPOINT.format(model=MODEL)
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            url, params={"key": api_key}, json=payload,
            headers={"Content-Type": "application/json"},
        )
    if response.status_code != 200:
        raise _provider_fout("gemini", response)
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"gemini returned no candidates: {json.dumps(data)[:300]}")
    return candidates[0].get("content") or {}


def _to_ollama_messages(contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gemini's `contents` -> Ollama's OpenAI-shaped `messages`.

    Gemini's shape stays canonical inside the loop, because it was here first
    and the rest of the code reads it. Only the wire format changes per
    provider, so a fallback cannot subtly lose the conversation.
    """
    out: list[dict[str, Any]] = [{"role": "system", "content": systeem_prompt()}]
    for entry in contents:
        role = entry.get("role")
        parts = entry.get("parts") or []

        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        responses = [p["functionResponse"] for p in parts if "functionResponse" in p]
        text = " ".join(p["text"] for p in parts if p.get("text"))

        if calls:
            out.append({
                "role": "assistant",
                "content": text,
                "tool_calls": [
                    {"function": {"name": c.get("name"), "arguments": c.get("args") or {}}}
                    for c in calls
                ],
            })
        elif responses:
            # One tool message per result, which is what the OpenAI shape expects.
            for r in responses:
                out.append({
                    "role": "tool",
                    "content": json.dumps(r.get("response") or {})[:20000],
                })
        elif text:
            out.append({"role": "assistant" if role == "model" else "user", "content": text})
    return out


async def _call_ollama(contents: list[dict[str, Any]]) -> dict[str, Any]:
    """Same loop, local model. Returns Gemini-shaped content so the caller
    cannot tell which provider answered."""
    import httpx

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        # Measured on Hetzner: 103s cold, 2.3s warm. Niet meer voor altijd
        # vastgepind: zie _ollama_keep_alive (de DAX-bots kregen geen geheugen).
        "keep_alive": _ollama_keep_alive(),
        "messages": _to_ollama_messages(contents),
        "tools": [
            {"type": "function", "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            }}
            for t in _tool_decls()
        ],
        "options": {"temperature": 0.2},
    }
    # 150 s: koud laden kost ~100 s (gemeten op Hetzner); langer is een volle rij.
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=150.0, write=30.0, pool=10.0)) as client:
        response = await client.post(
            f"{OLLAMA_HOST}/api/chat", json=payload,
            headers=_ollama_headers(),
        )
    if response.status_code != 200:
        raise RuntimeError(f"ollama {response.status_code}: {response.text[:300]}")

    message = response.json().get("message") or {}
    parts: list[dict[str, Any]] = []
    if message.get("content"):
        parts.append({"text": message["content"]})
    for call in message.get("tool_calls") or []:
        fn = call.get("function") or {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        parts.append({"functionCall": {"name": fn.get("name"), "args": args or {}}})
    if not parts:
        raise RuntimeError("ollama returned neither text nor a tool call")
    return {"parts": parts}


def _to_openai_messages(contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gemini's `contents` -> strikte OpenAI `messages`.

    Ollama slikt tool-berichten zonder id; Groq en OpenAI niet. Elke
    functionCall krijgt een id, en het antwoord erna verwijst ernaar in
    dezelfde volgorde.
    """
    out: list[dict[str, Any]] = [{"role": "system", "content": systeem_prompt()}]
    open_ids: list[str] = []
    n = 0
    for entry in contents:
        role = entry.get("role")
        parts = entry.get("parts") or []
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        responses = [p["functionResponse"] for p in parts if "functionResponse" in p]
        text = " ".join(p["text"] for p in parts if p.get("text"))

        if calls:
            ids = []
            for _ in calls:
                n += 1
                ids.append(f"call_{n}")
            open_ids = list(ids)
            out.append({
                "role": "assistant",
                "content": text or None,
                "tool_calls": [
                    {"id": i, "type": "function", "function": {
                        "name": c.get("name"),
                        "arguments": json.dumps(c.get("args") or {}),
                    }}
                    for i, c in zip(ids, calls)
                ],
            })
        elif responses:
            for r in responses:
                call_id = open_ids.pop(0) if open_ids else f"call_{n}"
                out.append({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": json.dumps(r.get("response") or {})[:20000],
                })
        elif text:
            out.append({"role": "assistant" if role == "model" else "user", "content": text})
    return out


async def _call_openai_compat(
    contents: list[dict[str, Any]], url: str, api_key: str, model: str,
) -> dict[str, Any]:
    """Groq of OpenAI, zelfde vorm. Geeft Gemini-vormige content terug."""
    import httpx

    payload = {
        "model": model,
        "messages": _to_openai_messages(contents),
        "tools": [
            {"type": "function", "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            }}
            for t in _tool_decls()
        ],
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            url, json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
    try:  # verbruik per sleutel (sleutel_teller.py); faalt nooit
        import sleutel_teller

        sleutel_teller.tel(api_key, response.status_code,
                           int(((response.json() or {}).get("usage") or {}).get("total_tokens") or 0)
                           if response.status_code == 200 else 0,
                           tekst=response.text[:400] if response.status_code != 200 else None)
    except Exception:  # noqa: BLE001
        pass
    if response.status_code != 200:
        raise _provider_fout(model, response)

    message = ((response.json().get("choices") or [{}])[0]).get("message") or {}
    parts: list[dict[str, Any]] = []
    if message.get("content"):
        parts.append({"text": message["content"]})
    for call in message.get("tool_calls") or []:
        fn = call.get("function") or {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        parts.append({"functionCall": {"name": fn.get("name"), "args": args or {}}})
    if not parts:
        raise RuntimeError(f"{model} returned neither text nor a tool call")
    return {"parts": parts}


# Welke aanbieder de laatste stap beantwoordde ("groq/openai/gpt-oss-120b",
# "ollama/llama3.1:8b-16k"). Gaat mee in het resultaat, zodat Home en het
# verslag zeggen welk model het werk deed in plaats van niets (of iets geradens).
_LAATSTE_MOTOR: contextvars.ContextVar[str | None] = contextvars.ContextVar("axe_laatste_motor", default=None)
# True = alleen gratis aanbieders (Groq, modelbox-Ollama). Gezet per run via run_agent_loop(alleen_gratis=...).
_ALLEEN_GRATIS: contextvars.ContextVar[bool] = contextvars.ContextVar("axe_alleen_gratis", default=False)
GROQ_KLEIN_MODEL = os.environ.get("AXE_AGENT_GROQ_SMALL_MODEL", "openai/gpt-oss-20b")
# Tests zetten deze; productie leest core_coding_seats en belt de Mac-worker.
_stoel_runner = None
_stoel_db = None


def motor_velden() -> dict[str, str]:
    naam = _LAATSTE_MOTOR.get()
    if not naam:
        return {}
    engine, _, model = naam.partition("/")
    return {"engine": engine, "model": model or engine}


def _huidige_agent() -> str | None:
    ws = _HUIDIGE_AGENT_WS.get() or {}
    return str(ws.get("agent") or "") or None


def _db_voor_stoelen():
    if _stoel_db is not None:
        return _stoel_db() if callable(_stoel_db) else _stoel_db
    try:
        from supabase import create_client
        return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE"])
    except Exception:
        return None


def _stoel_koelt_niet(r: dict[str, Any], nu_mono: float) -> bool:
    """Niet in afkoeling, op stoelnaam (limiet geldt voor het account) of op machine:stoel."""
    for k in (str(r.get("seat_id") or ""), str(r.get("id") or "")):
        if k and _STOEL_AFKOELING.get(k, 0) > nu_mono:
            return False
    return True


async def _call_model(contents: list[dict[str, Any]], api_key: str | None) -> dict[str, Any]:
    """Try each provider in turn until one answers.

    Ordered, never raced. Racing every provider on every step is what used to
    flatten the VPS; this walks a short list and stops at the first result.

    Why this exists at all: the loop was pinned to Gemini with no fallback, so
    the day that key died -- and it did, with a 401 the same week -- the agent
    died with it. Luka's point, and he was right: "er zijn modellen met genoeg
    capability die dat gewoon over kunnen nemen." Verified on Hetzner:
    llama3.1:8b-32k returns a correct tool call in ~13s while warm.

    17 okt: als de API-keten leegloopt, gaat de cyclus naar een vrije
    abonnements-stoel op de Mac mini. Geen stoel = wachten op capaciteit,
    geen rode 'Taak mislukt'.
    """
    attempts: list[tuple[str, Any]] = []
    # 20 nov (Luka): een eigen gratis Groq voor de agents, zodat ze de limiet van
    # de chat niet meer leegtrekken. Groq-limieten gelden per organisatie, dus
    # dit moet een sleutel van een ÁNDER Groq-account zijn. Zonder: als vroeger.
    groq_key = os.environ.get("GROQ_AGENTS_API_KEY") or os.environ.get("GROQ_API_KEY")
    groq_light_key = os.environ.get("GROQ_LIGHT_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    cerebras_key = os.environ.get("CEREBRAS_API_KEY")
    xai_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    gratis = _ALLEEN_GRATIS.get()
    agent = _huidige_agent()
    toegestaan = set(api_namen(agent, alleen_gratis=gratis))

    def api_aan(naam: str) -> bool:
        return naam in toegestaan

    if gratis and groq_light_key and api_aan("groq"):
        attempts.append((f"groq/light/{GROQ_KLEIN_MODEL}",
                         lambda: _call_openai_compat(contents, _GROQ_URL, groq_light_key, GROQ_KLEIN_MODEL)))
    if groq_key and api_aan("groq"):
        attempts.append((f"groq/{GROQ_MODEL}", lambda: _call_openai_compat(contents, _GROQ_URL, groq_key, GROQ_MODEL)))
        if gratis and not groq_light_key and GROQ_KLEIN_MODEL != GROQ_MODEL:
            # Eigen limietemmer bij Groq: als 120b op zijn tokens-per-minuut zit, past 20b vaak nog.
            attempts.append((f"groq/{GROQ_KLEIN_MODEL}",
                             lambda: _call_openai_compat(contents, _GROQ_URL, groq_key, GROQ_KLEIN_MODEL)))
    groq_reserve_key = os.environ.get("GROQ_RESERVE_API_KEY")
    if groq_reserve_key and api_aan("groq"):
        attempts.append((f"groq/reserve/{GROQ_KLEIN_MODEL}",
                         lambda: _call_openai_compat(contents, _GROQ_URL, groq_reserve_key, GROQ_KLEIN_MODEL)))
    if cerebras_key and api_aan("cerebras"):
        attempts.append((f"cerebras/{CEREBRAS_MODEL}",
                         lambda: _call_openai_compat(contents, _CEREBRAS_URL, cerebras_key, CEREBRAS_MODEL)))
    # Betaalde aanbieders alleen als de taak én de tierkaart dat toestaan.
    if api_key and not gratis and api_aan("gemini"):
        attempts.append((f"gemini/{MODEL}", lambda: _call_gemini(contents, api_key)))
    if openai_key and not gratis and api_aan("openai"):
        attempts.append((f"openai/{OPENAI_MODEL}", lambda: _call_openai_compat(contents, _OPENAI_URL, openai_key, OPENAI_MODEL)))
    if xai_key and not gratis and api_aan("xai"):
        attempts.append((f"xai/{XAI_MODEL}", lambda: _call_openai_compat(contents, _XAI_URL, xai_key, XAI_MODEL)))
    if gratis or api_aan("openrouter"):
        seen_free_keys = set()
        first = next(_OPENROUTER_FREE_START)
        for offset in range(3):
            slot = 3 + (first + offset) % 3
            key = os.environ.get(f"OPENROUTER{slot}_API_KEY", "").strip()
            if not key or key in seen_free_keys:
                continue
            seen_free_keys.add(key)
            attempts.append((
                f"openrouter/{slot}/free",
                lambda key=key: _call_openai_compat(contents, _OPENROUTER_URL, key, "openrouter/free"),
            ))
    openrouter_key = (
        os.environ.get("OPENROUTER_API_KEY")
        or os.environ.get("OPENROUTER2_API_KEY")
        or ""
    ).strip()
    if openrouter_key and not gratis and api_aan("openrouter"):
        attempts.append((
            f"openrouter/{OPENROUTER_MODEL}",
            lambda: _call_openai_compat(contents, _OPENROUTER_URL, openrouter_key, OPENROUTER_MODEL),
        ))
    # Ollama is keyless on the VPS — always last so a dead cloud key never
    # leaves the desk without a model (Luka: must work without API credits).
    if api_aan("ollama") or not attempts:
        attempts.append((f"ollama/{OLLAMA_MODEL}", lambda: _call_ollama_begrensd(contents)))

    # Soft-trim before the first attempt when the transcript is already fat
    # (e.g. Step 1 `ls -R` of a whole monorepo). Mutate in place so every
    # lambda below — and the caller's contents for later steps — see it.
    if _estimate_contents_chars(contents) > _CONTEXT_CHAR_BUDGET:
        ingekort = _trim_contents(contents, _CONTEXT_CHAR_BUDGET)
        contents.clear()
        contents.extend(ingekort)
        log.info(
            "[agent_loop] context trimmed to %d chars before provider cascade",
            _estimate_contents_chars(contents),
        )

    errors: list[str] = []
    i = 0
    getrimd_voor: set[str] = set()
    while i < len(attempts):
        name, call = attempts[i]
        tot = _AFKOELING.get(name)
        if tot is not None:
            if tot > time.monotonic():
                # Stil overslaan. Dat dit gebeurt is één keer gelogd, toen de
                # provider in de afkoeling ging; het elke stap herhalen is
                # precies het lawaai dat dit moest oplossen.
                errors.append(f"{name}: afkoelend")
                i += 1
                continue
            _AFKOELING.pop(name, None)
        try:
            antwoord = await call()
            _LAATSTE_MOTOR.set(name)
            return antwoord
        except ContextTeGroot as exc:
            # Payload te dik: inkorten en dezelfde provider één keer opnieuw,
            # daarna de volgende geconfigureerde provider met dezelfde trim.
            # Geen afkoeling — 413 is geen lege wallet.
            log.warning(
                "[agent_loop] %s request too large — trimming context and retrying/falling back: %s",
                name, str(exc)[:160],
            )
            errors.append(f"{name}: {str(exc)[:150]}")
            if name not in getrimd_voor:
                ingekort = _trim_contents(contents, _CONTEXT_CHAR_BUDGET // 2)
                contents.clear()
                contents.extend(ingekort)
                getrimd_voor.add(name)
                continue  # retry same provider with smaller payload
            i += 1
        except Exception as exc:
            seconden = _afkoelduur(exc)
            if seconden:
                _AFKOELING[name] = time.monotonic() + seconden
                log.warning(
                    "[agent_loop] %s is uitgeput (%s) — overgeslagen voor %d minuten",
                    name, str(exc)[:160], int(seconden // 60),
                )
            else:
                log.warning("[agent_loop] %s failed: %s", name, str(exc)[:200])
            errors.append(f"{name}: {str(exc)[:150]}")
            i += 1

    samenvatting = "every provider failed — " + " | ".join(errors)
    db = _db_voor_stoelen()
    for fout in errors:
        wie = provider_uit_fout(fout)
        if wie:
            meld_tegoed_eenmaal(db, wie, fout)

    if mag_stoel(agent, alleen_gratis=gratis):
        rijen = lees_stoelen(db)
        familie = str((kaart_voor(agent).get("seat_family") or "") or "") or None
        # 24 nov: een stoel die net "You've hit your session limit" gaf, niet meteen
        # opnieuw: dat gaf op de iMac honderden claude_code.run's per uur (en een
        # volle schijf). Hij komt terug na zijn afkoeling.
        nu_mono = time.monotonic()
        rijen = [r for r in rijen if _stoel_koelt_niet(r, nu_mono)]
        stoel = kies_stoel(rijen, familie=familie)
        if stoel:
            try:
                raw = await asyncio.to_thread(
                    roep_stoel, stoel, seat_prompt(contents, agent),
                    tier=int(kaart_voor(agent).get("tier") or 2),
                    runner=_stoel_runner,
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"seat/{stoel.get('seat_id')}: {str(exc)[:150]}")
                raw = {"ok": False, "error": str(exc)}
            stoel_fout = stoel_limiet_of_fout(str(raw.get("output") or "")) if raw.get("ok") else None
            if stoel_fout:
                # Geen antwoord maar een weigering van de CLI zelf: nooit als modeltekst
                # teruggeven (dan duwt de lus "took no action" en start hij hem opnieuw).
                sleutel = str(stoel.get("seat_id") or stoel.get("id") or "")
                _STOEL_AFKOELING[sleutel] = time.monotonic() + STOEL_AFKOELING_S
                errors.append(f"seat/{stoel.get('seat_id')}: {stoel_fout[:150]}")
            elif raw.get("ok") and raw.get("output"):
                _LAATSTE_MOTOR.set(f"seat/{stoel.get('seat_id')}")
                return parse_seat_antwoord(str(raw.get("output") or ""))
            errors.append(f"seat/{stoel.get('seat_id')}: {str(raw.get('error') or 'no output')[:150]}")
            # Elke mislukte stoel koelt af, niet alleen een limietmelding. 24 nov: codex op de
            # iMac gaf model_not_found (taak 'failed', dus geen limiettekst), werd niet gekoeld
            # en direct weer gekozen: 216 runs in 2 uur, 219 worktrees, schijf liep weer vol.
            _STOEL_AFKOELING[str(stoel.get("id") or stoel.get("seat_id") or "")] = (
                time.monotonic() + STOEL_AFKOELING_S)
        wacht = vroegste_stoel_vrij(rijen)
        # Nog een andere vrije, niet-afkoelende stoel over? Dan niet wachten op de eerste
        # die vrijkomt (24 nov: 1,5 uur geparkeerd terwijl de Mac mini er twee had).
        nu_mono = time.monotonic()
        if any(stoel_vrij(r) and _stoel_koelt_niet(r, nu_mono) for r in rijen):
            wacht = min(wacht, 60)
        raise WaitingForCapacity(
            f"waiting for capacity — {samenvatting}",
            retry_after_s=wacht, errors=errors,
        )

    raise WaitingForCapacity(samenvatting, errors=errors)


async def run_agent_loop(
    request_text: str,
    task_id: str,
    on_event,
    approved_commands: tuple[str, ...] = (),
    read_only: bool = False,
    *,
    agent: str | None = None,
    workspace: str | None = None,
    device: str | None = None,
    should_stop: Callable[[], Awaitable[bool]] | None = None,
    dax: Any = None,
    alleen_gratis: bool = False,
) -> dict[str, Any]:
    """Run the request to completion.

    `on_event(kind, message, data)` is awaited for each step so the caller can
    stream progress into core_task_events.

    `approved_commands` are commands Luka has already approved for THIS task, so
    a resumed attempt runs straight through the thing it previously stopped on
    instead of asking again.

    `agent` is een roster-id uit AGENT_BRIEFS (northsea, trading, ...). Die
    brief gaat voor de system prompt, zodat de lus als díe agent werkt en niet
    als een algemene "AXE" met een ander etiket. Onbekend of None = geen brief.

    `should_stop` wordt vóór elke modelaanroep en vóór elke tooluitvoering
    afgevraagd; geeft hij True, dan stopt de lus met TaskCancelled.
    """
    pre_approved = {normalize_command(c) for c in approved_commands}
    # No longer required. A missing or dead Gemini key now means the loop runs
    # on the local model instead of refusing to start.
    api_key = os.environ.get("GEMINI_API_KEY")

    # De NorthSea-desk is alleen-lezen, wat de aanroeper er ook van vindt. Die
    # regel staat in zijn brief, maar een brief is een vraag aan het model en
    # geen garantie -- dit is de garantie.
    if agent == "northsea":
        read_only = True

    agent_ws = laad_workspace(agent) if agent else None
    brief = (agent_ws or {}).get("system_prompt") or AGENT_BRIEFS.get(agent or "", "")
    task_workspace = (dax.werkmap if dax is not None else None) or workspace or WORKSPACE
    if dax is None:
        try:
            os.makedirs(task_workspace, exist_ok=True)
        except OSError:
            pass
    pinned = device or ((agent_ws or {}).get("preferred_device") if agent_ws else None)
    werkplek_fiche = _HUIDIGE_WORKSPACE.set(task_workspace)
    fiche = _HUIDIGE_BRIEF.set(brief)
    ws_fiche = _HUIDIGE_AGENT_WS.set(agent_ws)
    agent_fiche = _HUIDIGE_AGENT.set(agent)
    doel_fiche = _HUIDIGE_DOEL.set(str(request_text or "")[:2000])
    taak_fiche = _HUIDIGE_TAAK.set(str(task_id) if task_id else None)
    device_fiche = _HUIDIGE_DEVICE.set(pinned if pinned in ("vps", "mac-mini", "imac") else None)
    dax_fiche = _HUIDIGE_DAX.set(dax)
    gratis_fiche = _ALLEEN_GRATIS.set(bool(alleen_gratis))

    async def stop_gevraagd() -> None:
        """Werp TaskCancelled als de taak intussen geannuleerd is."""
        if should_stop is None:
            return
        if await should_stop():
            raise TaskCancelled(f"task {task_id} was cancelled")

    try:
        uit = await _lus(
            request_text, task_id, on_event, pre_approved, read_only,
            api_key, stop_gevraagd,
        )
        _wis_hervatting()
        return uit
    except (WaitingForCapacity, asyncio.CancelledError):
        raise  # wachten op capaciteit of een herstart van de worker: hervatting blijft staan
    except BaseException:  # klaar, mislukt, goedkeuring (die start bewust opnieuw): weg
        _wis_hervatting()
        raise
    finally:
        _HUIDIGE_BRIEF.reset(fiche)
        _HUIDIGE_WORKSPACE.reset(werkplek_fiche)
        _HUIDIGE_AGENT_WS.reset(ws_fiche)
        _HUIDIGE_AGENT.reset(agent_fiche)
        _HUIDIGE_DOEL.reset(doel_fiche)
        _HUIDIGE_TAAK.reset(taak_fiche)
        _HUIDIGE_DEVICE.reset(device_fiche)
        _HUIDIGE_DAX.reset(dax_fiche)
        _ALLEEN_GRATIS.reset(gratis_fiche)


_HERVAT_BESTAND = ".axe-hervat.json"
_HERVAT_MAX_UUR = 24


def _hervat_pad() -> str | None:
    taak, map_ = _HUIDIGE_TAAK.get(), _HUIDIGE_WORKSPACE.get()
    if not taak or not map_:
        return None
    return os.path.join(map_, f"{_HERVAT_BESTAND}.{taak}")


def _bewaar_hervatting(doel: str, contents, transcript, stap: int, oplevering, coding: bool) -> None:
    pad = _hervat_pad()
    if not pad or not transcript:  # nog niets gedaan: niets om naar terug te gaan
        return
    try:
        tmp = pad + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"doel": str(doel)[:2000], "stap": stap, "contents": contents, "transcript": transcript,
                       "oplevering": oplevering, "coding": coding, "bewaard_op": time.time()}, f)
        os.replace(tmp, pad)
    except Exception as e:  # noqa: BLE001
        log.warning("[agent_loop] hervatting bewaren faalde: %s", e)


def _lees_hervatting(doel: str) -> dict[str, Any] | None:
    """Alleen voor dezelfde taak en hetzelfde doel, en niet ouder dan een dag."""
    pad = _hervat_pad()
    if not pad or not os.path.exists(pad):
        return None
    try:
        with open(pad, encoding="utf-8") as f:
            d = json.load(f)
        if (d.get("doel") != str(doel)[:2000] or time.time() - float(d.get("bewaard_op") or 0) > _HERVAT_MAX_UUR * 3600
                or not isinstance(d.get("contents"), list) or int(d.get("stap") or 0) < 1):
            return None
        return d
    except Exception:  # noqa: BLE001
        return None


def _wis_hervatting() -> None:
    pad = _hervat_pad()
    if pad:
        try:
            os.remove(pad)
        except OSError:
            pass


async def _lus(
    request_text: str,
    task_id: str,
    on_event,
    pre_approved: set[str],
    read_only: bool,
    api_key: str | None,
    stop_gevraagd,
) -> dict[str, Any]:
    """De lus zelf. Apart van run_agent_loop zodat de brief-ContextVar in één
    plek gezet en weer opgeruimd wordt, ook bij ApprovalRequired."""
    contents: list[dict[str, Any]] = [
        {"role": "user", "parts": [{"text": request_text}]}
    ]
    started = time.monotonic()
    transcript: list[dict[str, Any]] = []
    # De laatste oplevering van een coding-agent in deze taak (device_actions.oplevering):
    # die bepaalt mee of 'klaar' mag, en gaat mee in het resultaat (taakverslag, review).
    laatste_oplevering: dict[str, Any] | None = None
    coding_gevraagd = False
    zonder_actie = 0
    eerste_stap = 1
    hervat = _lees_hervatting(request_text)
    if hervat:
        contents, transcript = hervat["contents"], hervat["transcript"]
        laatste_oplevering, coding_gevraagd = hervat.get("oplevering"), bool(hervat.get("coding"))
        eerste_stap = int(hervat["stap"])
        # 24 nov live: de rem (MAX_ZONDER_ACTIE) begon na elke hervatting weer bij 0, dus
        # een taak die alleen tekst gaf liep stap 4..10 door, één stap per poging.
        for t in reversed(transcript):
            if t.get("tool") is not None:
                break
            zonder_actie += 1
        await on_event("axe.progress", f"Resuming at step {eerste_stap} after waiting for capacity "
                       f"({len(transcript)} earlier steps kept).", {"hervat": eerste_stap})

    async def klaar_door_meting(stap: int, notitie: str) -> dict[str, Any] | None:
        """Taak met een MEETBARE acceptatie (feed: voor -> na) die nu gehaald is: klaar,
        met de meting als bewijs. None = niets te meten of (nog) niet gehaald."""
        import acceptatie as _acceptatie
        acc = await asyncio.to_thread(_acceptatie.na_meting_voor_taak, _db_voor_stoelen(), _HUIDIGE_TAAK.get())
        if not (acc and acc.get("gehaald")):
            return None
        await on_event("verification.passed", "Acceptance measured and met: " + acc["regel"][:300],
                       {"acceptatie": acc.get("regel")})
        transcript.append({"step": stap, "tool": "finish", "via": "acceptatie", "acceptatie": acc.get("regel")})
        return {
            "acceptatie": {k: v for k, v in acc.items() if k != "na"},
            **motor_velden(),
            "summary": ("Acceptance measured and met: " + acc["regel"][:400]
                        + (". Agent note: " + notitie[:1100] if notitie else ".")),
            "steps_used": stap,
            **({"oplevering": laatste_oplevering} if laatste_oplevering else {}),
            "verification": {"passed": True, "checks": [{
                "name": "acceptatie", "passed": True, "regel": acc.get("regel")}]},
            "transcript": transcript,
        }

    for step in range(eerste_stap, MAX_STEPS + 1):
        if time.monotonic() - started > WALL_CLOCK_SECONDS:
            raise RuntimeError(
                f"ran out of time after {step - 1} steps "
                f"({WALL_CLOCK_SECONDS}s budget). Transcript kept for the next attempt."
            )

        await stop_gevraagd()
        try:
            content = await _call_model(contents, api_key)
        except WaitingForCapacity:
            # 24 nov live (corporateJets): 14x uitgesteld, en elke poging begon weer bij
            # stap 1 -- dezelfde logs opnieuw, een nieuwe stoelrun van minuten. Bewaar waar
            # hij was; de volgende poging gaat daar verder.
            _bewaar_hervatting(request_text, contents, transcript, step, laatste_oplevering, coding_gevraagd)
            raise
        parts = content.get("parts") or []
        contents.append({"role": "model", "parts": parts})

        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        texts = [p["text"] for p in parts if p.get("text")]

        if not calls:
            # The model stopped without calling finish. That is exactly the old
            # failure -- talking instead of doing -- so push it back to work
            # rather than accepting the prose as a result.
            said = " ".join(texts).strip() or "(nothing)"
            # 24 nov live (corporateJets): de stoel zei elke stap "fix staat al live, niets te
            # wijzigen" maar kon nooit finish roepen -- geen commit, dus geen oplevering. Heeft
            # de taak een MEETBARE acceptatie (feed: voor -> na) en is die nu echt gehaald, dan
            # is dat het bewijs: de meting, niet de tekst. Niet gehaald = gewoon doorgaan.
            # Ook als de stoel zegt dat hij iets niet zelf kon nagaan (24 nov live: "ik kon de
            # logs niet lezen ... als de feed al vers is, is er niets meer te doen"): de meting
            # beslist, en de samenvatting zegt eerlijk dat de meting het bewijs is.
            if said != "(nothing)" and (klaar := await klaar_door_meting(step, said)):
                return klaar
            zonder_actie += 1
            if zonder_actie >= MAX_ZONDER_ACTIE:
                # 24 nov: zonder rem duwde dit tot 40 stappen door, elk een nieuwe run.
                raise RuntimeError(
                    f"the model answered {zonder_actie} times in a row without taking an action "
                    f"(last: {said[:160]!r}). Stopped instead of retrying; the transcript is kept."
                )
            await on_event("axe.progress", f"Step {step}: no action taken, prompting to continue.", {})
            contents.append({
                "role": "user",
                "parts": [{"text": (
                    "You produced text but took no action, and you have not called "
                    "finish(). Text is not a deliverable. Either use a tool to make "
                    "progress, or call finish() with a verify_command that proves the "
                    "work exists."
                )}],
            })
            transcript.append({"step": step, "tool": None, "note": said[:400]})
            continue

        zonder_actie = 0
        responses = []
        for call in calls:
            # Vóór elke tooluitvoering, niet alleen per stap: één stap kan
            # meerdere tools bevatten, en een annulering hoort niet te wachten
            # tot de rest van de rij is uitgevoerd.
            await stop_gevraagd()
            name = call.get("name")
            args = call.get("args") or {}

            # De poort (punt 6, tool-register): alleen tools uit déze werkplek.
            # Het model krijgt alleen die te zien, maar roept het toch een andere
            # aan, dan werd die tot 19 nov gewoon uitgevoerd.
            if name not in {d["name"] for d in _tool_decls()}:
                agent_id = (_HUIDIGE_AGENT_WS.get() or {}).get("agent") or "axe"
                await on_event("axe.progress", f"Step {step}: refused {name!r} -- not a tool of {agent_id}", {})
                transcript.append({"step": step, "tool": name, "refused": "not_in_workspace"})
                responses.append({"functionResponse": {"name": name, "response": {
                    "error": f"{name!r} is not one of your tools. Your tools: "
                             + ", ".join(d["name"] for d in _tool_decls()),
                }}})
                continue

            if name == "finish":
                summary = str(args.get("summary") or "").strip()
                verify_command = str(args.get("verify_command") or "").strip()
                expect = str(args.get("expect_in_output") or "").strip()

                # Regel 1 (klaar_regels): zegt hij zelf dat het niet lukte, dan is het
                # geblokkeerd, geen klaar -- ook als zijn "bewijs" slaagt.
                if klaar_regels.geeft_falen_toe(summary):
                    transcript.append({"step": step, "tool": "finish", "blocked": "agent_reports_failure"})
                    await on_event("axe.progress", f"Step {step}: the agent says it did not work -- "
                                   "recording it as blocked, not done.", {})
                    return {
                        **motor_velden(),
                        "summary": klaar_regels.als_blokkade(summary),
                        "steps_used": step,
                        **({"oplevering": laatste_oplevering} if laatste_oplevering else {}),
                        "verification": {"passed": True, "checks": [
                            {"name": "agent_reports_failure", "passed": True}]},
                        "transcript": transcript,
                    }
                weigering = None
                if klaar_regels.leeg_bewijs(verify_command, expect):
                    weigering = klaar_regels.WEIGER_LEEG.format(cmd=verify_command[:120])
                elif klaar_regels.coding_zonder_oplevering(coding_gevraagd, laatste_oplevering):
                    weigering = klaar_regels.WEIGER_CODING
                weigering = weigering or device_actions.oplevering_weigering(laatste_oplevering)
                if weigering:
                    transcript.append({"step": step, "tool": "finish", "refused": "klaar_geweigerd"})
                    await on_event("verification.failed", "Completion refused: the coding agent's delivery is "
                                   "incomplete.", {"ontbreekt": (laatste_oplevering or {}).get("ontbreekt")})
                    responses.append({"functionResponse": {"name": "finish", "response": {
                        "accepted": False, "reason": weigering}}})
                    continue

                await on_event(
                    "axe.progress",
                    f"Step {step}: agent claims completion, verifying with `{verify_command[:120]}`.",
                    {"verify_command": verify_command},
                )
                proof = await asyncio.to_thread(_shell, verify_command)
                combined = (proof.get("stdout") or "") + (proof.get("stderr") or "")
                passed = proof.get("exit_code") == 0 and expect in combined

                transcript.append({
                    "step": step, "tool": "finish", "verify_command": verify_command,
                    "expect": expect, "exit_code": proof.get("exit_code"), "passed": passed,
                })

                acc_oordeel = None
                if passed:
                    # Sprint 3: het bewijs van de agent zegt dat er iets bestaat; de acceptatie
                    # meet opnieuw of het probleem echt weg is (feed: voor -> na).
                    import acceptatie as _acceptatie
                    acc_oordeel = await asyncio.to_thread(
                        _acceptatie.na_meting_voor_taak, _db_voor_stoelen(), _HUIDIGE_TAAK.get())
                    if (acc_weigering := _acceptatie.weigering(acc_oordeel)):
                        transcript.append({"step": step, "tool": "finish", "refused": "acceptatie",
                                           "acceptatie": acc_oordeel.get("regel")})
                        await on_event("verification.failed", "Acceptance not met: " + acc_oordeel["regel"][:300],
                                       {"acceptatie": acc_oordeel.get("regel")})
                        responses.append({"functionResponse": {"name": "finish", "response": {
                            "accepted": False, "reason": acc_weigering}}})
                        continue
                if passed:
                    await on_event(
                        "verification.passed",
                        "Proof command ran and produced the expected result.",
                        {"verify_command": verify_command, "expect": expect},
                    )
                    return {
                        **({"acceptatie": {k: v for k, v in acc_oordeel.items() if k != "na"}} if acc_oordeel else {}),
                        **motor_velden(),
                        "summary": summary,
                        "steps_used": step,
                        **({"oplevering": laatste_oplevering} if laatste_oplevering else {}),
                        "verification": {
                            "passed": True,
                            "checks": [{
                                "name": "proof_command",
                                "passed": True,
                                "command": verify_command,
                                "expected": expect,
                                "exit_code": proof.get("exit_code"),
                                "output": combined[-2000:],
                            }],
                        },
                        "transcript": transcript,
                    }

                # Proof failed: this is the case the old worker marked as success.
                await on_event(
                    "verification.failed",
                    f"Completion claim rejected — proof command exited {proof.get('exit_code')}.",
                    {"verify_command": verify_command},
                )
                responses.append({
                    "functionResponse": {
                        "name": "finish",
                        "response": {
                            "accepted": False,
                            "reason": (
                                f"Your proof did not hold. `{verify_command}` exited with "
                                f"{proof.get('exit_code')} and its output did not contain "
                                f"{expect!r}. Output was:\n{combined[-3000:]}\n\n"
                                "You are NOT finished. Keep working."
                            ),
                        },
                    }
                })
                continue

            if name == "run_shell":
                command = str(args.get("command") or "")
                needs = approval_reason(command, args.get("cwd"), read_only)
                if needs and normalize_command(command) in pre_approved:
                    # Luka already said yes to exactly this command on this task.
                    await on_event(
                        "axe.progress",
                        f"Step {step}: running approved command — {command[:140]}",
                        {"command": command, "approved": True},
                    )
                    needs = None
                if needs:
                    # Stop rather than route around it. Telling the model "carry
                    # on without this" invites it to declare victory on the half
                    # it could reach -- the exact dishonesty this whole loop was
                    # built to remove. Parking the task keeps the transcript, and
                    # approving resumes it from here.
                    transcript.append({
                        "step": step, "tool": "run_shell",
                        "command": command[:400], "approval_required": needs,
                    })
                    raise ApprovalRequired(command, needs)
                else:
                    await on_event("axe.progress", f"Step {step}: $ {command[:160]}", {})
                    result = await asyncio.to_thread(_shell, command, args.get("cwd"))
                    transcript.append({
                        "step": step, "tool": "run_shell",
                        "command": command[:400], "exit_code": result.get("exit_code"),
                    })
            elif name == "read_file":
                path = str(args.get("path") or "")
                await on_event("axe.progress", f"Step {step}: reading {path[:160]}", {})
                result = await asyncio.to_thread(
                    _read, path, int(args.get("max_bytes") or 60000)
                )
                transcript.append({"step": step, "tool": "read_file", "path": path[:300]})
            elif name == "write_file" and read_only:
                path = str(args.get("path") or "")
                result = {"error": "This is a read-only task. Report what you found instead of writing."}
                transcript.append({"step": step, "tool": "write_file", "path": path[:300], "refused": "read_only"})
            elif name == "write_file":
                path = str(args.get("path") or "")
                await on_event("axe.progress", f"Step {step}: writing {path[:160]}", {})
                result = await asyncio.to_thread(
                    _write, path, str(args.get("content") or "")
                )
                transcript.append({
                    "step": step, "tool": "write_file", "path": path[:300],
                    "bytes": result.get("bytes_written"),
                })
            elif name == "list_devices":
                await on_event("axe.progress", f"Step {step}: checking which Macs are online", {})
                result = {"devices": await asyncio.to_thread(device_actions.list_devices)}
                transcript.append({"step": step, "tool": "list_devices"})
            elif name == "northsea_read":
                result = await _northsea_lees(str(args.get("action") or ""), args.get("params"))
                await on_event("axe.progress", f"Step {step}: NorthSea {args.get('action')}", {})
                transcript.append({"step": step, "tool": "northsea_read", "action": args.get("action"),
                                   "ok": "error" not in result})
            elif name == "run_crew":
                ws = _HUIDIGE_AGENT_WS.get() or {}
                specialists = args.get("specialists") if isinstance(args.get("specialists"), list) else crew_voor(ws)
                crew_task = str(args.get("task") or request_text)
                await on_event("axe.progress", f"Step {step}: CrewAI from this agent's workspace.", {
                    "specialists": specialists,
                })
                from crew_runner import run_crew
                result = await asyncio.to_thread(run_crew, crew_task, None, None, specialists)
                transcript.append({
                    "step": step, "tool": "run_crew",
                    "specialists": specialists, "status": result.get("status"),
                })
            elif name == "run_on_device":
                pinned = _HUIDIGE_DEVICE.get()
                device = str(pinned if pinned and pinned != "vps" else (args.get("device") or ""))
                tool = str(args.get("tool") or "")
                dargs = args.get("args") if isinstance(args.get("args"), dict) else {}
                # Eerst: kan dit überhaupt? Anders geen goedkeuring vragen voor
                # een actie die op de Mac gegarandeerd faalt (18 nov).
                fout = device_actions.ontbrekend(tool, dargs) or device_actions.verzet_checkout(tool, dargs)
                key = None if (read_only or fout) else device_actions.approval_key(device, tool, dargs)
                if key and normalize_command(key) not in pre_approved:
                    transcript.append({
                        "step": step, "tool": "run_on_device", "device": device,
                        "device_tool": tool, "approval_required": key,
                    })
                    raise ApprovalRequired(key, f"changes something on {device} ({tool})")
                await on_event(
                    "axe.progress", f"Step {step}: {tool} on {device}",
                    {"device": device, "device_tool": tool},
                )
                result = await asyncio.to_thread(
                    device_actions.run_on_device, device, tool, dargs,
                    str(args.get("workspace") or "AXE Core"), task_id, read_only,
                )
                transcript.append({
                    "step": step, "tool": "run_on_device", "device": device,
                    "device_tool": tool, "ok": result.get("ok"),
                })
                if tool in device_actions.AGENT_RUNS:
                    coding_gevraagd = True
                if tool in device_actions.AGENT_RUNS and isinstance(result.get("oplevering"), dict):
                    laatste_oplevering = {**result["oplevering"], "device": device, "tool": tool}
                    transcript[-1]["compleet"] = bool(laatste_oplevering.get("compleet"))
                    await on_event(
                        "axe.progress",
                        f"Step {step}: {tool} delivered"
                        + (f" on branch {laatste_oplevering.get('branch')}" if laatste_oplevering.get("branch") else "")
                        + (" -- complete" if laatste_oplevering.get("compleet") else " -- NOT complete"),
                        {"compleet": laatste_oplevering.get("compleet")},
                    )
            else:
                result = {"error": f"unknown tool {name!r}"}
                transcript.append({"step": step, "tool": name, "error": "unknown"})

            responses.append({
                "functionResponse": {"name": name, "response": result}
            })

        contents.append({"role": "user", "parts": responses})
        # 24 nov live (adf08f3a): 38 stappen zoeken in logs terwijl de feed al gemeten
        # gehaald was; het model wist dat niet en liep tegen de 40. Om de 5 stappen meten.
        if step % ACCEPTATIE_ELKE_N == 0 and (klaar := await klaar_door_meting(step, "")):
            return klaar

    if (klaar := await klaar_door_meting(MAX_STEPS, "")):
        return klaar
    raise RuntimeError(
        f"used all {MAX_STEPS} steps without a verified result. "
        "The transcript is preserved on the task for the next attempt."
    )
