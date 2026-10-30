"""Fase 2 stap 1 — één orchestrator-laag (dunne facade).

Doel: alle agents/crews/devices/trading-demo's lopen via dezelfde lus:

    voorstel → access → approval → execute → verify → notify

Bestaande motors blijven de implementatie:
  - agent_loop.py          — LLM + tool turns
  - beslis_beleid.py       — access / approval gates
  - provider_router        — model/provider fallback
  - device_actions         — Tauri / Macs / VPS side-effects

Plugins (NorthSea crews, trading demo, device packs) registreren zich hier.
Geen trades, payments of outgoing mail vanuit deze module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

STAPPEN = ("voorstel", "access", "approval", "execute", "verify", "notify")

PluginHandler = Callable[[Dict[str, Any]], Dict[str, Any]]


@dataclass
class Plugin:
    naam: str
    beschrijving: str
    handler: Optional[PluginHandler] = None
    # Welke device-targets dit plugin mag raken (documentatie; enforce later)
    devices: List[str] = field(default_factory=list)


_PLUGINS: Dict[str, Plugin] = {}


def registreer_plugin(plugin: Plugin) -> None:
    """Registreer of vervang een plugin. Idempotent op naam."""
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
    """Publieke status voor /orchestrator/status — geen secrets."""
    return {
        "fase": 2,
        "stap": 1,
        "lus": list(STAPPEN),
        "motors": [
            "agent_loop",
            "beslis_beleid",
            "provider_router",
            "device_actions",
        ],
        "plugins": lijst_plugins(),
        "guards": {
            "geen_trades": True,
            "geen_payments": True,
            "geen_outgoing_mail": True,
        },
    }


def _seed_builtin_plugins() -> None:
    """Documentatie-plugins — handlers komen in latere Fase-2 stappen."""
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
    """Alleen voor unit tests."""
    _PLUGINS.clear()
    _seed_builtin_plugins()
