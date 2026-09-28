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
import logging
import subprocess
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

import device_actions

# Budget. The old loop allowed 10 steps and 2 minutes, which is not enough to
# do anything real -- a single "read the file, change it, check it built" cycle
# is already three. These are the numbers for a background task, not a chat
# reply; the durable worker holds a lease and heartbeats, so a long run is fine.
MAX_STEPS = 40
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
MODEL = os.environ.get("AXE_AGENT_MODEL", "gemini-pro-latest")

# The fallback. Not a downgrade to tolerate -- measured on Hetzner while warm:
# a correct tool call in ~13s, and a plain answer in 2.3s. Slower per step than
# Gemini, fast enough for a background agent with a 30-minute budget, and it
# costs nothing and cannot have its key revoked.
#
# Note the ":cloud" models Ollama advertises (kimi, glm, deepseek, minimax) are
# NOT on this box -- they proxy to Ollama's own service and answer 401 without
# an account there. Of the 15 names /api/tags reports, 5 are really local.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "https://ollama.axecompanion.com").rstrip("/")
OLLAMA_MODEL = os.environ.get("AXE_AGENT_FALLBACK_MODEL", "llama3.1:8b-32k")
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Groq eerst, OpenAI als reserve (25 sep). Gemini gaf 402 "prepayment credits
# are depleted" en de llama-terugval op deze box deed over één `df` minuten,
# met de swap vol. Gemeten vanaf de VPS: gpt-oss-120b op Groq geeft een goede
# tool-call in 0,23s, gpt-4.1-mini op OpenAI in 1,3s. Zonder key slaat de lus
# die stap gewoon over.
GROQ_MODEL = os.environ.get("AXE_AGENT_GROQ_MODEL", "openai/gpt-oss-120b")
OPENAI_MODEL = os.environ.get("AXE_AGENT_OPENAI_MODEL", "gpt-4.1-mini")
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_OPENAI_URL = "https://api.openai.com/v1/chat/completions"

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
    """
    lowered = " ".join(command.lower().split())

    for pattern in _NEEDS_APPROVAL:
        if pattern in lowered:
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
        for pattern in _READ_ONLY_NEEDS_APPROVAL:
            if pattern in schoon:
                return f"changes something in a read-only task ({pattern.strip()})"

    # Writing outside the workspace. Reading outside stays free -- the agent has
    # to be able to look at its own source in order to work on it.
    workdir = os.path.realpath(cwd or WORKSPACE)
    if not workdir.startswith(os.path.realpath(WORKSPACE)):
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
            "to claude_code.run, codex.run or cursor.run. Use the narrowest tool that does "
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
Use list_devices, pick the machine that advertises the workspace, inspect it
there, create a feature/axe-task-* branch if the checkout is protected, then
use the Mac tools directly or claude_code.run/codex.run/cursor.run. Verify on
that same device. The installed AXE app is updated only from orchestrator, so
do not claim a feature is live until the canonical update has actually landed.

You have {MAX_STEPS} steps. Use them."""


# Eén lus, dertien rollen. Tot nu toe was SYSTEM_PROMPT het enige dat het model
# te horen kreeg, dus "NorthSea Desk Manager" en "Trading Agent" waren etiketten
# op precies dezelfde agent: dezelfde toon, dezelfde aannames, dezelfde scope.
# Dit is wat een agent tot díe agent maakt -- zijn rol, wat hij bezit en waar
# hij van afblijft. Overgenomen uit src/domain/agents/roster.ts (AXE_AGENTS);
# elke id daar hoort hier een brief te hebben, en test_agent_briefs.py houdt de
# twee lijsten gelijk.
#
# De brief gaat VOOR de system prompt, niet erna: het eerste wat het model
# leest is wie het is, daarna pas hoe het werkt.
AGENT_BRIEFS: dict[str, str] = {
    "axe": (
        "You are AXE, the orchestrator. You talk to Luka, work out what he "
        "actually wants, and either answer it yourself or hand it to the "
        "manager who owns that domain. You hold ambiguous work rather than "
        "mis-routing it."
    ),
    # ── tier 1 — het managerteam ────────────────────────────────────────────
    "wingman": (
        "You are the Wingman, AXE's right hand, working for AXE. You run the "
        "CrewAI crews on the VPS on AXE's behalf and help out anywhere else. "
        "You prepare and propose; AXE and Luka decide."
    ),
    "northsea": (
        "You are the NorthSea Desk Manager, working for AXE: the commodity "
        "desk. You research counterparties, cargoes, offers and prices, and "
        "you report what you found.\n"
        "HARD LIMIT: this desk is READ-ONLY. You never send an email, a "
        "message or an offer, never write to the NorthSea database, and never "
        "switch on any automatic sending. Nothing leaves the desk without "
        "Luka. If a job needs something sent, say exactly what you would send "
        "and to whom, and stop there."
    ),
    "trading": (
        "You are the Trading Agent, working for AXE: the AXE Algo trading "
        "desk. Market analysis, positions, risk and the final trade decision "
        "are yours, and you own the trading research crew.\n"
        "HARD LIMIT: money never moves unattended. Placing, modifying, "
        "closing or cancelling an order — through the broker API, the "
        "/trading/order endpoint or any script — always needs Luka's "
        "approval first. Analysing, sizing and proposing a trade is your "
        "work; executing it is his call."
    ),
    "developer": (
        "You are AXE Developer, working for AXE: the code manager. You read, "
        "write, build and ship the codebase. Look at the real file before you "
        "change it, keep the change small, and prove it with a test or a "
        "build — not with a description of what you did."
    ),
    "thinktank": (
        "You are ThinkTank, working for AXE: the ideas manager. You score and "
        "rank ideas, turn the survivors into a build plan, and hand that plan "
        "on. Be concrete: an idea without a next step is not an idea yet."
    ),
    # ── tier 2 — de werkers ─────────────────────────────────────────────────
    "browser": (
        "You are the Browser agent, working for AXE. You navigate, extract "
        "and summarise web pages. Report what the page actually said, with "
        "the URL; never fill in what you did not see."
    ),
    "memory": (
        "You are the Memory manager, working for AXE. You build and maintain "
        "the durable memory itself: consolidation, decay and the Obsidian "
        "vault. Only store what was explicitly worth remembering."
    ),
    "task": (
        "You are the Task manager, working for AXE. You pick up tasks from "
        "the Tasks tab and track them to close. A task is closed when there "
        "is proof it is done, not when someone said so."
    ),
    "cron": (
        "You are the Cron manager, working for AXE: the self-hosted "
        "scheduler. You run due schedules with nobody watching, so be "
        "conservative — a job that should not run twice must not run twice."
    ),
    "finance": (
        "You are the Finance agent, working for AXE: money, credits and every "
        "subscription. You watch what is left, warn before something runs "
        "out, and route work to the cheapest engine that can still do it. You "
        "report numbers; you never buy, top up or cancel anything yourself."
    ),
    "apps": (
        "You are the App manager, working for AXE: the app registry and VPS "
        "ops. You health-check the services behind AXE CORE and AXE "
        "Companion, and you can restart them — with approval, and after you "
        "have said what is actually wrong."
    ),
    # ── tier 3 — cross-app assistenten ──────────────────────────────────────
    "intel": (
        "You are AXE Intel, working for AXE: market intelligence and signal "
        "detection inside Trading OS. You surface signals with their source "
        "and time; you do not trade on them."
    ),
    "companion": (
        "You are AXE Companion, working for AXE: the assistant that lives in "
        "the other apps and is driven through AXE CORE. Do the work in the "
        "app you are in, and report back plainly."
    ),
}


# De brief van de agent die déze beurt draait. Een ContextVar en geen extra
# parameter op _call_model: die functie wordt in tests vervangen door een dubbel
# met twee parameters, en een derde argument zou dat stilzwijgend breken. Elke
# asyncio-taak krijgt zijn eigen kopie van de context, dus twee worker-slots
# naast elkaar zien elkaars brief nooit.
_HUIDIGE_BRIEF: contextvars.ContextVar[str] = contextvars.ContextVar(
    "axe_agent_brief", default=""
)


def systeem_prompt() -> str:
    """De system prompt zoals het model hem deze beurt krijgt: brief + basis."""
    brief = _HUIDIGE_BRIEF.get()
    return f"{brief}\n\n{SYSTEM_PROMPT}" if brief else SYSTEM_PROMPT


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


# Afkoeling per provider. Zonder dit probeert de lus elke stap opnieuw Groq
# (dagquotum op) en Gemini (credits op): tot veertig keer dezelfde 429/402 per
# taak, veertig keer dezelfde regel in het log, en elke stap twee nutteloze
# HTTP-rondjes voordat de provider die het wél doet aan de beurt is.
# Sleutel = de naam uit de attempts-lijst, waarde = monotone tijd waarop hij
# weer meedoet.
_AFKOELING: dict[str, float] = {}

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
    if exc.retry_after and exc.retry_after > 0:
        return min(float(exc.retry_after), _AFKOEL_MAX)
    if exc.status == 402:
        return _AFKOEL_CREDITS
    return _seconden_tot_middernacht()


def _provider_fout(provider: str, response: Any) -> RuntimeError:
    """Vertaal een mislukte HTTP-poging naar de juiste fout.

    ProviderUitgeput als het een dagquotum (429) of opgebruikte credits (402)
    is, anders een gewone RuntimeError -- een 500 of een timeout is een
    incident, geen reden om de provider een dag te laten liggen.
    """
    body = response.text or ""
    status = response.status_code
    if status == 402 or (status == 429 and _is_dagquotum(body)):
        na = (response.headers or {}).get("retry-after")
        try:
            retry_after = float(na) if na is not None else None
        except (TypeError, ValueError):
            retry_after = None
        return ProviderUitgeput(provider, status, body, retry_after)
    return RuntimeError(f"{provider} {status}: {body[:300]}")


# Eén Ollama tegelijk. De VPS heeft 7,7GB en geen swap die dit opvangt: het
# model is al eens met een OOM door de hele box heen gegaan (AGENTS.md val 4).
# Zolang de worker één taak tegelijk draaide kwam dat niet samen, maar met K
# parallelle slots kunnen twee taken nu echt tegelijk op de terugval landen en
# twee keer hetzelfde model laden. De semafoor laat de tweede wachten in plaats
# van de box om te duwen.
_OLLAMA_SLOT = asyncio.Semaphore(1)


async def _call_ollama_begrensd(contents: list[dict[str, Any]]) -> dict[str, Any]:
    """_call_ollama, maar nooit twee tegelijk."""
    async with _OLLAMA_SLOT:
        return await _call_ollama(contents)


def _shell(command: str, cwd: str | None = None) -> dict[str, Any]:
    refusal = _refuse(command)
    if refusal:
        return {"exit_code": 126, "stdout": "", "stderr": refusal}
    workdir = cwd or WORKSPACE
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


def _read(path: str, max_bytes: int = 60000) -> dict[str, Any]:
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
        "tools": [{"functionDeclarations": TOOL_DECLARATIONS}],
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
        # Pinned in memory. Measured on Hetzner: 103s cold, 2.3s warm -- a
        # fallback that takes a minute and a half to wake up is not a fallback.
        "keep_alive": -1,
        "messages": _to_ollama_messages(contents),
        "tools": [
            {"type": "function", "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            }}
            for t in TOOL_DECLARATIONS
        ],
        "options": {"temperature": 0.2},
    }
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{OLLAMA_HOST}/api/chat", json=payload,
            headers={"Content-Type": "application/json"},
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
            for t in TOOL_DECLARATIONS
        ],
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            url, json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
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


async def _call_model(contents: list[dict[str, Any]], api_key: str | None) -> dict[str, Any]:
    """Try each provider in turn until one answers.

    Ordered, never raced. Racing every provider on every step is what used to
    flatten the VPS; this walks a short list and stops at the first result.

    Why this exists at all: the loop was pinned to Gemini with no fallback, so
    the day that key died -- and it did, with a 401 the same week -- the agent
    died with it. Luka's point, and he was right: "er zijn modellen met genoeg
    capability die dat gewoon over kunnen nemen." Verified on Hetzner:
    llama3.1:8b-32k returns a correct tool call in ~13s while warm.
    """
    attempts: list[tuple[str, Any]] = []
    groq_key = os.environ.get("GROQ_API_KEY")
    openai_key = os.environ.get("OPENAI_API_KEY")
    if groq_key:
        attempts.append((f"groq/{GROQ_MODEL}", lambda: _call_openai_compat(contents, _GROQ_URL, groq_key, GROQ_MODEL)))
    if api_key:
        attempts.append((f"gemini/{MODEL}", lambda: _call_gemini(contents, api_key)))
    if openai_key:
        attempts.append((f"openai/{OPENAI_MODEL}", lambda: _call_openai_compat(contents, _OPENAI_URL, openai_key, OPENAI_MODEL)))
    # De terugval is begrensd: nooit twee Ollama-aanroepen tegelijk op deze box.
    attempts.append((f"ollama/{OLLAMA_MODEL}", lambda: _call_ollama_begrensd(contents)))

    errors: list[str] = []
    for name, call in attempts:
        tot = _AFKOELING.get(name)
        if tot is not None:
            if tot > time.monotonic():
                # Stil overslaan. Dat dit gebeurt is één keer gelogd, toen de
                # provider in de afkoeling ging; het elke stap herhalen is
                # precies het lawaai dat dit moest oplossen.
                errors.append(f"{name}: afkoelend")
                continue
            _AFKOELING.pop(name, None)
        try:
            return await call()
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
    raise RuntimeError("every provider failed — " + " | ".join(errors))


async def run_agent_loop(
    request_text: str,
    task_id: str,
    on_event,
    approved_commands: tuple[str, ...] = (),
    read_only: bool = False,
    *,
    agent: str | None = None,
    should_stop: Callable[[], Awaitable[bool]] | None = None,
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

    brief = AGENT_BRIEFS.get(agent or "", "")
    fiche = _HUIDIGE_BRIEF.set(brief)

    async def stop_gevraagd() -> None:
        """Werp TaskCancelled als de taak intussen geannuleerd is."""
        if should_stop is None:
            return
        if await should_stop():
            raise TaskCancelled(f"task {task_id} was cancelled")

    try:
        return await _lus(
            request_text, task_id, on_event, pre_approved, read_only,
            api_key, stop_gevraagd,
        )
    finally:
        _HUIDIGE_BRIEF.reset(fiche)


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

    for step in range(1, MAX_STEPS + 1):
        if time.monotonic() - started > WALL_CLOCK_SECONDS:
            raise RuntimeError(
                f"ran out of time after {step - 1} steps "
                f"({WALL_CLOCK_SECONDS}s budget). Transcript kept for the next attempt."
            )

        await stop_gevraagd()
        content = await _call_model(contents, api_key)
        parts = content.get("parts") or []
        contents.append({"role": "model", "parts": parts})

        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        texts = [p["text"] for p in parts if p.get("text")]

        if not calls:
            # The model stopped without calling finish. That is exactly the old
            # failure -- talking instead of doing -- so push it back to work
            # rather than accepting the prose as a result.
            said = " ".join(texts).strip() or "(nothing)"
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

        responses = []
        for call in calls:
            # Vóór elke tooluitvoering, niet alleen per stap: één stap kan
            # meerdere tools bevatten, en een annulering hoort niet te wachten
            # tot de rest van de rij is uitgevoerd.
            await stop_gevraagd()
            name = call.get("name")
            args = call.get("args") or {}

            if name == "finish":
                summary = str(args.get("summary") or "").strip()
                verify_command = str(args.get("verify_command") or "").strip()
                expect = str(args.get("expect_in_output") or "").strip()

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

                if passed:
                    await on_event(
                        "verification.passed",
                        "Proof command ran and produced the expected result.",
                        {"verify_command": verify_command, "expect": expect},
                    )
                    return {
                        "summary": summary,
                        "steps_used": step,
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
            elif name == "run_on_device":
                device = str(args.get("device") or "")
                tool = str(args.get("tool") or "")
                dargs = args.get("args") if isinstance(args.get("args"), dict) else {}
                key = None if read_only else device_actions.approval_key(device, tool, dargs)
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
            else:
                result = {"error": f"unknown tool {name!r}"}
                transcript.append({"step": step, "tool": name, "error": "unknown"})

            responses.append({
                "functionResponse": {"name": name, "response": result}
            })

        contents.append({"role": "user", "parts": responses})

    raise RuntimeError(
        f"used all {MAX_STEPS} steps without a verified result. "
        "The transcript is preserved on the task for the next attempt."
    )
