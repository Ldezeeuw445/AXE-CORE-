"""Fase 2 — één orchestrator-laag (dunne facade).

Lus: voorstel → access → approval → execute → verify → notify

Motors (blijven de implementatie):
  - agent_loop.py     — LLM + tool turns (execute)
  - beslis_beleid.py  — access / approval gates
  - provider_router   — model/provider fallback (stap 3)
  - device_actions    — Tauri / Macs / VPS (stap 4)

Plugins (stap 4–6):
  - device_actions    — observe/safe_execute dry-run + list metadata
  - northsea_crews    — deal-mails toegestaan (staande Luka-toestemming);
                        harde poort alleen op betalingen + ondertekenen
  - trading_demo      — paper-only demo; nooit live orders

Guards: geen live trades, geen payments, geen contract-signing vanuit deze laag.
NorthSea deal-moving e-mail (support@northseacommodity.com) mag wél — bestaande
cron/verstuur-pad blijft onaangeraakt; deze facade blokkeert dat niet.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

STAPPEN = ("voorstel", "access", "approval", "execute", "verify", "notify")
FASE2_STAP = 6  # laatste voltooide fase-2 stap in deze module

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


def roep_plugin(naam: str, payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Roep een geregistreerde plugin-handler aan (sync, geen side-effects tenzij expliciet)."""
    p = _PLUGINS.get(naam)
    if p is None:
        return {"ok": False, "error": f"onbekende plugin {naam!r}", "plugins": [x["naam"] for x in lijst_plugins()]}
    if p.handler is None:
        return {"ok": False, "error": f"plugin {naam!r} heeft geen handler", "naam": naam}
    try:
        uit = p.handler(dict(payload or {}))
    except Exception as exc:  # noqa: BLE001 — facade mag niet crashen
        return {"ok": False, "error": str(exc), "naam": naam}
    if not isinstance(uit, dict):
        return {"ok": False, "error": "handler gaf geen dict", "naam": naam}
    uit.setdefault("ok", True)
    uit.setdefault("naam", naam)
    return uit


# ── Stap 3: provider fallback ─────────────────────────────────────────────────

def provider_fallback(
    agent: str | None = "axe",
    *,
    alleen_gratis: bool = False,
) -> Dict[str, Any]:
    """Lees de provider-keten via provider_router (geen netwerk-calls)."""
    from provider_router import api_namen, kaart_voor, mag_stoel

    kaart = kaart_voor(agent)
    keten = api_namen(agent, alleen_gratis=alleen_gratis)
    return {
        "agent": (agent or "axe"),
        "alleen_gratis": bool(alleen_gratis),
        "keten": list(keten),
        "primair": keten[0] if keten else None,
        "fallback": list(keten[1:]) if len(keten) > 1 else [],
        "mag_stoel": mag_stoel(agent, alleen_gratis=alleen_gratis),
        "kaart": {
            "id": kaart.get("id"),
            "kind": kaart.get("kind"),
            "tier": kaart.get("tier"),
            "model": kaart.get("model"),
            "seat_family": kaart.get("seat_family"),
        },
        "gedrag": (
            "API-keten leeg → abonnements-stoel (Mac mini) → WaitingForCapacity / defer"
            if not alleen_gratis
            else "alleen gratis providers (groq/cerebras/ollama); geen stoel"
        ),
    }


def status() -> Dict[str, Any]:
    return {
        "fase": 2,
        "stap": FASE2_STAP,
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
            "provider": "provider_fallback",
            "plugin": "roep_plugin",
        },
        "provider_fallback": provider_fallback("axe"),
        "plugins": lijst_plugins(),
        "guards": {
            "geen_trades": True,
            "geen_payments": True,
            "geen_signing": True,
            "trading_paper_only": True,
            # Deal-mails via NorthSea crews/cron/verstuur: toegestaan (staande toestemming).
            "northsea_deal_mail_ok": True,
            "northsea_geen_auto_send": False,
            "geen_outgoing_mail": False,
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
    """Access + approval gate via beslis_beleid (geen side-effects)."""
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
    """Execute-stap: optioneel access-check, daarna agent_loop (met provider fallback)."""
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
    from provider_router import WaitingForCapacity

    providers = provider_fallback(agent or "axe", alleen_gratis=alleen_gratis)
    try:
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
    except WaitingForCapacity as wacht:
        return {
            "stap": "verify",
            "status": "waiting_capacity",
            "access": access,
            "executed": False,
            "providers": providers,
            "retry_after_s": int(getattr(wacht, "retry_after_s", 300)),
            "errors": list(getattr(wacht, "errors", []) or []),
            "melding": str(wacht),
        }
    return {
        "stap": "execute",
        "status": "ok",
        "access": access,
        "executed": True,
        "providers": providers,
        "result": result,
    }


# ── Stap 4: device_actions plugin ─────────────────────────────────────────────

def _plugin_device_actions(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Device-acties: metadata / resolve / approval_key. Geen queue zonder expliciet.

    actie:
      - status (default): tiers, aliases, workspaces — geen DB
      - resolve: alias → device_id
      - approval_key: wat Luka moet goedkeuren
      - list: list_devices (vereist db of weigert netjes)
      - run: geweigerd vanuit facade tenzij observe/safe_execute + dry_run
    """
    from device_actions import (
        ALIASES,
        LABELS,
        TOOL_TIERS,
        WORKSPACES,
        approval_key,
        resolve_device,
    )

    actie = str(payload.get("actie") or "status").strip().lower()
    if actie in ("status", "meta", ""):
        return {
            "actie": "status",
            "labels": dict(LABELS),
            "aliases": dict(ALIASES),
            "workspaces": list(WORKSPACES),
            "tools": sorted(TOOL_TIERS.keys()),
            "tiers": {
                "observe": sorted(k for k, v in TOOL_TIERS.items() if v == "observe"),
                "safe_execute": sorted(k for k, v in TOOL_TIERS.items() if v == "safe_execute"),
                "write": sorted(k for k, v in TOOL_TIERS.items() if v == "write"),
                "consequential": sorted(k for k, v in TOOL_TIERS.items() if v == "consequential"),
            },
            "note": "run_on_device blijft via agent_loop / computer_use; facade doet geen queue.",
        }
    if actie == "resolve":
        naam = payload.get("device") or payload.get("name") or ""
        return {"actie": "resolve", "input": naam, "device": resolve_device(str(naam))}
    if actie == "approval_key":
        device = str(payload.get("device") or "")
        tool = str(payload.get("tool") or "")
        args = payload.get("args") if isinstance(payload.get("args"), dict) else {}
        return {
            "actie": "approval_key",
            "device": resolve_device(device) if device else "",
            "tool": tool,
            "key": approval_key(device, tool, args) if device and tool else None,
            "tier": TOOL_TIERS.get(tool),
        }
    if actie == "list":
        db = payload.get("db")
        if db is None:
            return {
                "actie": "list",
                "ok": False,
                "error": "list vereist db (Supabase-client); gebruik status zonder DB",
                "known_labels": dict(LABELS),
            }
        from device_actions import list_devices

        return {"actie": "list", "devices": list_devices(db)}
    if actie == "run":
        # Facade weigert schrijven/consequential; observe mag alleen als dry_run.
        tool = str(payload.get("tool") or "")
        tier = TOOL_TIERS.get(tool)
        if payload.get("dry_run") is True and tier in ("observe", "safe_execute"):
            device = resolve_device(str(payload.get("device") or "imac"))
            return {
                "actie": "run",
                "dry_run": True,
                "would_queue": True,
                "device": device,
                "tool": tool,
                "tier": tier,
                "args": payload.get("args") if isinstance(payload.get("args"), dict) else {},
                "approval": approval_key(device, tool, payload.get("args") or {}),
            }
        return {
            "ok": False,
            "actie": "run",
            "error": "orchestrator_lus runt geen device-acties zelf; gebruik agent_loop/computer_use. dry_run=true + observe/safe_execute toont het plan.",
            "tier": tier,
        }
    return {"ok": False, "error": f"onbekende actie {actie!r}", "bekend": ["status", "resolve", "approval_key", "list", "run"]}


# ── Stap 5: NorthSea crews plugin ─────────────────────────────────────────────

_NORTHSEA_CREWS = (
    "research",
    "operations",
    "discovery",
    "reality",
)


def _normalize_specialists(raw: Any) -> list[str]:
    """Lichte kopie van crew_runner.normalize_specialists (geen pydantic-import)."""
    if not isinstance(raw, (list, tuple)):
        return []
    uit: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        sleutel = item.strip().lower()
        if sleutel and sleutel not in uit:
            uit.append(sleutel)
        if len(uit) >= 9:
            break
    return uit


_NORTHSEA_HARD_GATE = (
    "payment", "betaling", "wire", "invoice pay", "transfer funds",
    "sign contract", "onderteken", "signing", "handtekening", "escrow release",
)


def _northsea_hard_gate(tekst: str) -> str | None:
    """Alleen betalingen + ondertekenen vragen Luka-ja. Deal-mails niet."""
    t = (tekst or "").lower()
    for woord in _NORTHSEA_HARD_GATE:
        if woord in t:
            return woord
    return None


def _plugin_northsea_crews(payload: Dict[str, Any]) -> Dict[str, Any]:
    """NorthSea crews — deal-mails OK (staande toestemming); poort op pay/sign.

    Het bestaande pad (cron northsea jobs, northsea_verstuur, send-approved-reply
    via support@northseacommodity.com) blijft de implementatie. Deze facade
    blokkeert dat niet en mag `run`/`verstuur` doorverwijzen.
    """
    actie = str(payload.get("actie") or "status").strip().lower()
    specialists = _normalize_specialists(payload.get("specialists"))
    blob = " ".join(
        str(v) for v in (
            payload.get("task"), payload.get("goal"), payload.get("detail"),
            payload.get("kind"), payload.get("draft_id"), actie,
        ) if v
    )
    gate = _northsea_hard_gate(blob)
    if actie in ("status", "meta", ""):
        return {
            "actie": "status",
            "crews": list(_NORTHSEA_CREWS),
            "max_specialists": 9,
            "guards": {
                "deal_mail_ok": True,
                "staande_toestemming": "Harcros / Montanwerke Brixlegg deal-mails via support@northseacommodity.com",
                "hard_gate": ["payments", "signing"],
                "run_via": "crew_runner / northsea cron / northsea_verstuur (onaangeraakt)",
            },
            "note": "Deal-moving e-mail mag. Betalen of contract tekenen = Luka-ja.",
        }
    if actie == "plan":
        task = str(payload.get("task") or payload.get("goal") or "").strip()
        if not task:
            return {"ok": False, "actie": "plan", "error": "task verplicht"}
        crew = str(payload.get("crew") or "research").strip().lower()
        if crew not in _NORTHSEA_CREWS:
            return {"ok": False, "actie": "plan", "error": f"onbekende crew {crew!r}", "crews": list(_NORTHSEA_CREWS)}
        if gate:
            return {
                "ok": False,
                "actie": "plan",
                "vraag_luka": True,
                "error": f"harde poort: {gate!r} vereist Luka-ja (geen auto)",
                "crew": crew,
                "task": task[:500],
            }
        return {
            "actie": "plan",
            "crew": crew,
            "task": task[:500],
            "specialists": specialists,
            "would_call": "crew_runner.run_crew" if specialists else "northsea job tick",
            "deal_mail_ok": True,
            "executed": False,
            "note": "plan klaar; deal-mail/send mag via bestaande northsea_verstuur / cron",
        }
    if actie in ("run", "verstuur", "send"):
        if gate:
            return {
                "ok": False,
                "actie": actie,
                "vraag_luka": True,
                "error": f"harde poort: {gate!r} — betalingen/ondertekenen niet auto",
                "specialists": specialists,
            }
        draft_id = str(payload.get("draft_id") or "").strip()
        # Facade voert zelf geen netwerk-send uit (geen secrets hier); wijst naar
        # het bestaande onaangeraakte pad zodat callers/cron het mogen doen.
        return {
            "ok": True,
            "actie": actie,
            "allowed": True,
            "deal_mail_ok": True,
            "executed": False,
            "draft_id": draft_id or None,
            "specialists": specialists,
            "route": (
                "northsea_verstuur.verstuur"
                if draft_id or actie == "verstuur"
                else "crew_runner.run_crew / northsea cron tick"
            ),
            "note": (
                "Toegestaan onder staande toestemming (deal-mails). "
                "Aanroeper gebruikt bestaande northsea_verstuur of cron — "
                "orchestrator_lus blokkeert send niet."
            ),
        }
    return {"ok": False, "error": f"onbekende actie {actie!r}", "bekend": ["status", "plan", "run", "verstuur"]}


# ── Stap 6: trading demo paper-only ───────────────────────────────────────────

def _plugin_trading_demo(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Trading demo — uitsluitend paper. Weigert live/orders/payments."""
    actie = str(payload.get("actie") or "status").strip().lower()
    verboden = ("live", "order", "buy", "sell", "place", "market", "payment", "wire")
    raw = " ".join(str(v) for v in payload.values() if isinstance(v, (str, int, float))).lower()
    if any(w in raw for w in ("live order", "place_order", "market order")) or (
        actie in ("order", "buy", "sell", "place", "live")
    ):
        return {
            "ok": False,
            "actie": actie,
            "error": "trading_demo is paper-only — geen live orders vanuit orchestrator_lus",
            "paper_only": True,
            "guards": status()["guards"],
        }
    if actie in ("status", "meta", "demo", ""):
        # Pure demo-state; geen DB, geen secrets.
        paper = {
            "environment": "paper",
            "equity": 100_000.0,
            "open_positions": 0,
            "closed_today": 0,
            "pnl_today": 0.0,
            "autopilot": False,
            "circuit_breaker": False,
        }
        return {
            "actie": "status",
            "paper_only": True,
            "demo": paper,
            "allowed": ["status", "plan", "simulate"],
            "forbidden": ["live", "order", "buy", "sell", "place"],
            "read_path": "/trading/* (alleen-lezen cockpit)",
            "note": "Geen MetaAPI, geen orders; demo-getallen zijn lokaal en fictief.",
        }
    if actie == "plan":
        symbol = str(payload.get("symbol") or "EURUSD").upper()[:12]
        side = str(payload.get("side") or "buy").lower()
        if side not in ("buy", "sell"):
            side = "buy"
        return {
            "actie": "plan",
            "paper_only": True,
            "executed": False,
            "plan": {
                "symbol": symbol,
                "side": side,
                "size": float(payload.get("size") or 0.01),
                "environment": "paper",
                "would_call": None,
            },
            "note": "plan-only — geen order geplaatst",
        }
    if actie == "simulate":
        symbol = str(payload.get("symbol") or "EURUSD").upper()[:12]
        side = str(payload.get("side") or "buy").lower()
        size = float(payload.get("size") or 0.01)
        # Deterministische papieren PnL-demo (geen marktfeed).
        pnl = round(size * 10.0 * (1 if side == "buy" else -1), 2)
        return {
            "actie": "simulate",
            "paper_only": True,
            "executed": False,
            "fill": {
                "symbol": symbol,
                "side": side,
                "size": size,
                "environment": "paper",
                "pnl_demo": pnl,
                "status": "paper_fill_simulated",
            },
            "note": "gesimuleerde paper-fill; geen broker, geen geld",
        }
    if actie in verboden or actie in ("order", "buy", "sell", "place", "live"):
        return {
            "ok": False,
            "error": "geweigerd: paper-only",
            "actie": actie,
            "paper_only": True,
        }
    return {"ok": False, "error": f"onbekende actie {actie!r}", "bekend": ["status", "plan", "simulate"]}


def _seed_builtin_plugins() -> None:
    if _PLUGINS:
        return
    registreer_plugin(
        Plugin(
            naam="device_actions",
            beschrijving="Device-acties op Tauri / Macs / VPS via bestaande device_actions (observe/plan; geen stille writes).",
            devices=["tauri", "mac", "vps"],
            handler=_plugin_device_actions,
        )
    )
    registreer_plugin(
        Plugin(
            naam="northsea_crews",
            beschrijving="NorthSea crews — deal-mails OK (staande toestemming); harde poort op betalen/ondertekenen.",
            devices=["vps", "mac"],
            handler=_plugin_northsea_crews,
        )
    )
    registreer_plugin(
        Plugin(
            naam="trading_demo",
            beschrijving="Trading demo-loop — paper only, nooit live orders vanuit deze laag.",
            devices=["vps"],
            handler=_plugin_trading_demo,
        )
    )


_seed_builtin_plugins()


def reset_plugins_for_tests() -> None:
    _PLUGINS.clear()
    _seed_builtin_plugins()
