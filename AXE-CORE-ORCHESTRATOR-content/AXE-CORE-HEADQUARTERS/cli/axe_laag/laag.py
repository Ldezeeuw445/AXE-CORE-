"""Parser, hek en JSON-envelop. Geen I/O, geen geheimen."""
from __future__ import annotations

import json
import re
from typing import Any

EXIT = {
    "ok": 0,
    "error": 1,
    "usage": 2,
    "blocked": 3,
    "pending": 4,
    "not_found": 5,
    "config": 6,
}

WRITE_PATHS = {
    "tasks create", "tasks update", "agent run", "memory add", "notify", "report",
    "node register",
}

COMMANDS = [
    ("help", "axe help", "List every command and exit codes"),
    ("status", "axe status", "Health of Core, LLM slots, agents, cron, NorthSea"),
    ("tasks list", "axe tasks list [--status <s>] [--limit <n>]", "List durable tasks"),
    ("tasks create", "axe tasks create --title <t> --goal <g>", "Create a durable task"),
    ("tasks show", "axe tasks show <id>", "Show one durable task"),
    ("tasks update", "axe tasks update <id> [--title] [--goal] [--priority]", "Update task fields"),
    ("task wait", "axe task wait <id>", "Poll a task until it finishes"),
    ("agents list", "axe agents list", "List AXE agents and VPS bridges"),
    ("agent run", "axe agent run <agent> \"<instruction>\"", "Dispatch to the durable task kernel"),
    ("memory search", "axe memory search \"<q>\"", "Search the learning-loop / RAG store"),
    ("memory add", "axe memory add --text \"<t>\"", "Add a memory"),
    ("northsea status", "axe northsea status", "NorthSea health (read-only)"),
    ("northsea deals", "axe northsea deals", "Open NorthSea deals (read-only)"),
    ("northsea journal", "axe northsea journal", "NorthSea communications journal (read-only)"),
    ("trading status", "axe trading status", "Trading desk overview (read-only)"),
    ("cron list", "axe cron list", "Schedules and cron jobs"),
    ("mcp list", "axe mcp list", "Configured MCP servers"),
    ("notify", "axe notify \"<msg>\"", "Post into AXE chat + the notification bell"),
    ("report", "axe report \"<title>\" --file <pad>", "Store a task report in memory and notify"),
    ("approvals list", "axe approvals list", "Pending approvals visible in AXE"),
    ("node list", "axe node list", "Machines paired with AXE (name, OS, online)"),
    ("node register", "axe node register --name <n>", "Pair this machine; prints a one-time token"),
    ("node run", "axe node run [--once|--daemon]", "Outbound heartbeat + job poll (executor is phase 2)"),
]

TWO_WORD = {
    "tasks list", "tasks create", "tasks show", "tasks update",
    "task wait", "tasks wait",
    "agents list", "agent run", "agents run",
    "memory search", "memory add",
    "northsea status", "northsea deals", "northsea journal",
    "trading status", "cron list", "mcp list", "approvals list",
    "node list", "node register", "node run",
}

BLOCKED_FLAGS = (
    "auto_send_qualification", "auto_reply_nonbinding", "auto_send_followups",
)
EMAIL_RE = re.compile(r"\b(send[-_ ]?email|email[-_ ]?send|verstuur|resend|outbound[-_ ]?message|smtp|mailgun|sendgrid)\b", re.I)
DELETE_RE = re.compile(r"\b(delete|wissen|verwijder|drop table|truncate|rm -rf)\b", re.I)
MERGE_RE = re.compile(r"\b(merge\s+to\s+orchestrator|merge\s+orchestrator|push\s+.*orchestrator|git\s+push\s+.*orchestrator|HEAD:orchestrator)\b", re.I)
FLAG_RE = re.compile(r"\b(" + "|".join(BLOCKED_FLAGS) + r")\b", re.I)
SECRET_KEY = re.compile(r"(token|secret|password|passwd|api[_-]?key|apikey|credential|private[_-]?key|authorization|^key$|bearer|cookie|srk)", re.I)


class UsageError(ValueError):
    pass


def help_text() -> str:
    regels = [
        "axe — command layer for AXE Core (own node agent; OS3 optional).",
        "",
        "Global flags:",
        "  --json  --write  --confirm  --config <pad>  --actor <naam>  --timeout <sec>  --help",
        "",
        "Commands:",
    ]
    for _path, usage, summary in COMMANDS:
        regels.append(f"  {usage:<56} {summary}")
    regels += [
        "",
        "Safety: read-only by default. Mutating commands need --write (or --confirm).",
        "Hard-blocked (no override): email/outbound send, NorthSea auto_send_* flags,",
        "merge to orchestrator, deleting data.",
        "",
        "Exit codes: 0 ok · 1 error · 2 usage · 3 blocked · 4 pending approval · 5 not found · 6 config",
    ]
    return "\n".join(regels)


def _take(argv: list[str], i: int, name: str) -> tuple[str, int]:
    cur = argv[i]
    if cur.startswith(f"{name}="):
        return cur[len(name) + 1:], i + 1
    if i + 1 >= len(argv) or argv[i + 1].startswith("-"):
        raise UsageError(f"{name} needs a value")
    return argv[i + 1], i + 2


def _resolve(words: list[str]) -> tuple[str, list[str]]:
    if not words:
        return "help", []
    two = " ".join(words[:2]).strip()
    if two in TWO_WORD:
        path = {"tasks wait": "task wait", "agents run": "agent run"}.get(two, two)
        return path, words[2:]
    if words[0] in ("help", "--help", "-h"):
        return "help", words[1:]
    if words[0] in ("notify", "report", "status", "help"):
        return words[0], words[1:]
    raise UsageError(f"unknown or incomplete command '{' '.join(words)}'. See axe help")


def parse_argv(argv: list[str]) -> dict[str, Any]:
    flags: dict[str, Any] = {}
    loose: list[str] = []
    write = json_out = help_ = False
    actor = config_path = None
    timeout = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--":
            loose.extend(argv[i + 1:])
            break
        if a == "--json":
            json_out = True; i += 1; continue
        if a in ("--write", "--confirm"):
            write = True; i += 1; continue
        if a in ("--help", "-h"):
            help_ = True; i += 1; continue
        if a == "--actor" or a.startswith("--actor="):
            actor, i = _take(argv, i, "--actor"); continue
        if a == "--config" or a.startswith("--config="):
            config_path, i = _take(argv, i, "--config"); continue
        if a == "--timeout" or a.startswith("--timeout="):
            raw, i = _take(argv, i, "--timeout")
            timeout = float(raw)
            if timeout <= 0:
                raise UsageError("--timeout must be a positive number")
            continue
        if a.startswith("--"):
            name = a.split("=", 1)[0][2:]
            if "=" in a:
                flags[name] = a.split("=", 1)[1]; i += 1; continue
            if i + 1 < len(argv) and not argv[i + 1].startswith("-"):
                flags[name] = argv[i + 1]; i += 2; continue
            flags[name] = True; i += 1; continue
        loose.append(a); i += 1
    path, rest = _resolve(loose)
    return {
        "path": path, "positionals": rest, "flags": flags,
        "write": write, "json": json_out, "help": help_,
        "raw": " ".join(argv), "actor": actor, "config_path": config_path,
        "timeout_sec": timeout,
    }


def inspect_blocked(text: str) -> dict[str, str] | None:
    t = " ".join(text.split()).strip()
    if not t:
        return None
    if FLAG_RE.search(t):
        return {"kind": "blocked", "code": "northsea_flag",
                "reason": "NorthSea auto-send flags must stay false; no override"}
    if MERGE_RE.search(t):
        return {"kind": "blocked", "code": "merge", "reason": "merging to orchestrator is hard-blocked"}
    if EMAIL_RE.search(t):
        return {"kind": "blocked", "code": "email", "reason": "sending email or outbound messages is hard-blocked"}
    if DELETE_RE.search(t) and not re.search(r"\b(tasks show|tasks list|memory search)\b", t, re.I):
        return {"kind": "blocked", "code": "delete", "reason": "deleting data is hard-blocked"}
    return None


def inspect_approval(text: str) -> str | None:
    t = text.lower()
    if re.search(r"\b(git push|git commit|systemctl|docker|crontab|npm install|pip install)\b", t):
        return "touches the system"
    if re.search(r"\b(place order|open (a )?(long|short)|mt5|broker)\b", t):
        return "trading execution needs approval"
    if re.search(r"\bnorthsea\b", t) and re.search(r"\b(write|update|action|toggle|enable)\b", t):
        return "NorthSea write needs approval"
    return None


def decide_guard(path: str, raw: str, write: bool) -> dict[str, str]:
    blocked = inspect_blocked(raw) or inspect_blocked(path)
    if blocked:
        return blocked
    if path in WRITE_PATHS and not write:
        return {"kind": "need_write", "reason": f"{path} is mutating; pass --write"}
    approval = inspect_approval(raw)
    if approval and path == "agent run":
        return {"kind": "need_approval", "reason": approval}
    return {"kind": "allow"}


def redact(value: Any) -> Any:
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if SECRET_KEY.search(str(k)) else redact(v)) for k, v in value.items()}
    return value


def envelope(command: str, status: str, result: Any = None, error: str | None = None,
             approval: dict | None = None) -> dict[str, Any]:
    exit_for = {
        "ok": EXIT["ok"], "blocked": EXIT["blocked"], "pending_approval": EXIT["pending"],
        "not_found": EXIT["not_found"], "usage": EXIT["usage"], "config": EXIT["config"],
        "error": EXIT["error"],
    }
    return {
        "ok": status == "ok",
        "command": command,
        "status": status,
        "exit": exit_for.get(status, EXIT["error"]),
        "result": None if result is None else redact(result),
        "error": error,
        "approval": approval,
    }


def dumps(env: dict[str, Any]) -> str:
    return json.dumps(env, ensure_ascii=False) + "\n"
