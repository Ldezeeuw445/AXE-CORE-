"""Werkplek per roster-agent: wat de lus laadt, niet alleen een rolbrief.

Spiegelt src/domain/agents/workspace.ts. Een test houdt de ids gelijk. Draait
een agent zonder werkplek, dan stopt de lus — geen stille val terug op AXE.
"""
from __future__ import annotations

from typing import Any

# Zelfde brieven als voorheen in agent_loop.AGENT_BRIEFS. Niet herschrijven:
# test_agent_briefs.py leest de tekst letterlijk.
_BRIEVEN: dict[str, str] = {
    "axe": (
        "You are AXE, the orchestrator. You talk to Luka, work out what he "
        "actually wants, and either answer it yourself or hand it to the "
        "manager who owns that domain. You hold ambiguous work rather than "
        "mis-routing it."
    ),
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

_LEES = ("run_shell", "read_file", "list_devices", "run_on_device", "finish")
_VOL = ("run_shell", "read_file", "write_file", "list_devices", "run_on_device", "finish")
_CREW = _VOL + ("run_crew",)

AGENT_WORKSPACES: dict[str, dict[str, Any]] = {
    "axe": {
        "role": "Orchestrator", "system_prompt": _BRIEVEN["axe"],
        "tools": _CREW, "preferred_device": None, "memory_scope": "global",
        "crew": [],
    },
    "wingman": {
        "role": "AXE's right hand · manager", "system_prompt": _BRIEVEN["wingman"],
        "tools": _CREW, "preferred_device": "vps", "memory_scope": "agent",
        "crew": ["axe_core", "wags", "dollar_bill", "intel", "sentinel", "forge", "pulse", "atlas", "nova"],
    },
    "northsea": {
        "role": "Commodity desk manager", "system_prompt": _BRIEVEN["northsea"],
        "tools": _LEES, "preferred_device": None, "memory_scope": "agent",
        "crew": [],
    },
    "trading": {
        "role": "AXE Algo · trading desk", "system_prompt": _BRIEVEN["trading"],
        "tools": _CREW, "preferred_device": None, "memory_scope": "agent",
        "crew": ["dollar_bill", "intel"],
    },
    "developer": {
        "role": "Code manager", "system_prompt": _BRIEVEN["developer"],
        "tools": _CREW, "preferred_device": "mac-mini", "memory_scope": "task",
        "crew": ["wags", "forge"],
    },
    "thinktank": {
        "role": "Ideas manager", "system_prompt": _BRIEVEN["thinktank"],
        "tools": _CREW, "preferred_device": None, "memory_scope": "agent",
        "crew": ["nova", "atlas"],
    },
    "browser": {
        "role": "Web agent", "system_prompt": _BRIEVEN["browser"],
        "tools": _VOL, "preferred_device": None, "memory_scope": "task",
        "crew": [],
    },
    "memory": {
        "role": "Memory manager", "system_prompt": _BRIEVEN["memory"],
        "tools": _VOL, "preferred_device": "vps", "memory_scope": "global",
        "crew": [],
    },
    "task": {
        "role": "Task manager", "system_prompt": _BRIEVEN["task"],
        "tools": _VOL, "preferred_device": None, "memory_scope": "task",
        "crew": [],
    },
    "cron": {
        "role": "Scheduler", "system_prompt": _BRIEVEN["cron"],
        "tools": _VOL, "preferred_device": "vps", "memory_scope": "agent",
        "crew": [],
    },
    "finance": {
        "role": "Money + credits manager", "system_prompt": _BRIEVEN["finance"],
        "tools": _LEES, "preferred_device": None, "memory_scope": "agent",
        "crew": [],
    },
    "apps": {
        "role": "App registry + VPS ops", "system_prompt": _BRIEVEN["apps"],
        "tools": _VOL, "preferred_device": "vps", "memory_scope": "agent",
        "crew": [],
    },
    "intel": {
        "role": "Cross-app assistant", "system_prompt": _BRIEVEN["intel"],
        "tools": _VOL, "preferred_device": None, "memory_scope": "agent",
        "crew": [],
    },
    "companion": {
        "role": "Cross-app assistant", "system_prompt": _BRIEVEN["companion"],
        "tools": _VOL, "preferred_device": None, "memory_scope": "agent",
        "crew": [],
    },
}

# Blijft bestaan: test_agent_briefs en de lus lezen deze naam.
AGENT_BRIEFS: dict[str, str] = {
    k: str(v["system_prompt"]) for k, v in AGENT_WORKSPACES.items()
}


class WorkspaceOntbreekt(RuntimeError):
    """De lus weigert te starten als de agent geen werkplek heeft."""


def laad_workspace(agent: str | None) -> dict[str, Any]:
    """Laad de werkplek. Onbekende id = fout, geen stille AXE-val."""
    if not agent:
        return dict(AGENT_WORKSPACES["axe"], agent="axe")
    ws = AGENT_WORKSPACES.get(agent)
    if ws is None:
        raise WorkspaceOntbreekt(f"agent {agent!r} has no workspace")
    return dict(ws, agent=agent)


def tools_voor(workspace: dict[str, Any]) -> tuple[str, ...]:
    raw = workspace.get("tools") or ()
    return tuple(str(t) for t in raw)


def crew_voor(workspace: dict[str, Any]) -> list[str]:
    raw = workspace.get("crew") or []
    return [str(x) for x in raw if str(x).strip()]
