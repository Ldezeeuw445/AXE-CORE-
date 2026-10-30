"""Fase 2 — één orchestrator-laag (dunne facade).

Lus: voorstel → access → approval → execute → verify → notify

Motors (blijven de implementatie):
  - agent_loop.py     — LLM + tool turns (execute)
  - beslis_beleid.py  — access / approval gates
  - provider_router   — model/provider fallback (stap 3)
  - device_actions    — Tauri / Macs / VPS (stap 4)

Stap 1: plugin-registry + status.
Stap 2: task/approval-entry die beslis_beleid + agent_loop koppelt.
        Bestaande /tasks en Android-queue blijven de UI; deze module
        is de canon-entry die workers/routes mogen aanroepen.

Guards: geen live trades, geen payments, geen outgoing mail vanuit deze laag.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

STAPPEN = ("voorstel", "access", "approval", "execute", "verify", "notify")

PluginHandler = Callable[[Dict[str, Any]], Dict[str, Any]]
EventCb = Callable[[str, str, dict], Awaitable[None]]


@dataclass
class Plugin:
    naam: str
    beschrijving: str
    handler: Optional[PluginHandler] = None
    devices: List[str] = field(default_factory=list)


_PLUGINS: Dict[str, Plugin] = {}


def registreer_plugin(plugin: Plugin) -> None:
    if not plugin.naam or not plugin.naam.strip():
        raise ValueError("plugin.naam verplicht")
    _PLUGINS[plugin.naam] = plugin


def lijst_plugins() -> List[Dict[str, Any]]:
    return [
        {
            "naam": p.naam,
            "beschrijving": p.beschrijving,
            "devices": list(p.devices),
            "heeft_handler": p.handler is not None,
        }
        for p in sorted(_PLUGINS.values(), key=lambda x: x.naam)
    ]


def status() -> Dict[str, Any]:
    return {
        "fase": 2,
        "stap": 2,
        "lus": list(STAPPEN),
        "motors": [
            "agent_loop",
            "beslis_beleid",
            "provider_router",
            "device_actions",
        ],
        "entry": {
            "access": "beoordeel_voorstel",
            "execute": "voer_taak_uit",
            "tick_pending": "pas_beleid_toe",
        },
        "plugins": lijst_plugins(),
        "guards": {
            "geen_trades": True,
            "geen_payments": True,
            "geen_outgoing_mail": True,
        },
    }


# ── Stap 2: task / approval entry ─────────────────────────────────────────────

def beoordeel_voorstel(
    voorstel: Dict[str, Any],
    *,
    command: str | None = None,
    app: str | None = None,
    dax: bool = False,
) -> Dict[str, Any]:
    """Access + approval gate via beslis_beleid (geen side-effects).

    `voorstel` is een dict in core_approvals-vorm (title/detail/kind/metadata)
    of een lichte taak-samenvatting (title/goal).
    """
    from beslis_beleid import ACTIE_ASK, ACTIE_AUTO, beslis_goedkeuring

    rij = dict(voorstel or {})
    if "title" not in rij and rij.get("goal"):
        rij["title"] = str(rij.get("goal"))[:120]
    if "detail" not in rij and rij.get("goal"):
        rij["detail"] = str(rij["goal"])

    besluit = beslis_goedkeuring(rij, command=command, app=app, dax=dax)
    volgende = "approval" if besluit.actie == ACTIE_ASK else "execute"
    return {
        "stap": "access",
        "volgende": volgende,
        "actie": besluit.actie,
        "auto": besluit.actie == ACTIE_AUTO,
        "vraag_luka": besluit.actie == ACTIE_ASK,
        "reden": besluit.reden,
        "wat": besluit.wat,
        "waarom": besluit.waarom,
        "guards": status()["guards"],
    }


def pas_beleid_toe(db: Any) -> Dict[str, int]:
    """Tick: auto-approve in-plan pending approvals (bestaande beslis_beleid)."""
    from beslis_beleid import pas_beleid_toe_op_pending

    return pas_beleid_toe_op_pending(db)


async def voer_taak_uit(
    *,
    request_text: str,
    task_id: str,
    on_event: EventCb,
    approved_commands: tuple[str, ...] = (),
    read_only: bool = False,
    agent: str | None = None,
    workspace: str | None = None,
    device: str | None = None,
    should_stop: Callable[[], Awaitable[bool]] | None = None,
    dax: Any = None,
    alleen_gratis: bool = False,
    skip_access_check: bool = False,
    voorstel: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """Execute-stap: optioneel access-check, daarna agent_loop.run_agent_loop.

    Bij `vraag_luka` returnt dit zonder de loop te starten — caller zet
    waiting_approval via bestaande /tasks approvals API.
    """
    access: Dict[str, Any] | None = None
    if not skip_access_check:
        access = beoordeel_voorstel(
            voorstel
            or {
                "title": request_text[:120],
                "detail": request_text,
                "goal": request_text,
                "kind": "orchestrator_task",
            },
            dax=bool(dax),
        )
        if access.get("vraag_luka"):
            return {
                "stap": "approval",
                "status": "waiting_approval",
                "access": access,
                "executed": False,
            }

    from agent_loop import run_agent_loop

    result = await run_agent_loop(
        request_text,
        task_id,
        on_event,
        approved_commands=approved_commands,
        read_only=read_only,
        agent=agent,
        workspace=workspace,
        device=device,
        should_stop=should_stop,
        dax=dax,
        alleen_gratis=alleen_gratis,
    )
    return {
        "stap": "execute",
        "status": "ok",
        "access": access,
        "executed": True,
        "result": result,
    }


def _seed_builtin_plugins() -> None:
    if _PLUGINS:
        return
    registreer_plugin(
        Plugin(
            naam="northsea_crews",
            beschrijving="NorthSea crews als plugin van de orchestrator-lus (geen auto-send).",
            devices=["vps", "mac"],
        )
    )
    registreer_plugin(
        Plugin(
            naam="trading_demo",
            beschrijving="Trading demo-loop — paper only, nooit live orders vanuit deze laag.",
            devices=["vps"],
        )
    )
    registreer_plugin(
        Plugin(
            naam="device_actions",
            beschrijving="Device-acties op Tauri / Macs / VPS via bestaande device_actions.",
            devices=["tauri", "mac", "vps"],
        )
    )


_seed_builtin_plugins()


def reset_plugins_for_tests() -> None:
    _PLUGINS.clear()
    _seed_builtin_plugins()
