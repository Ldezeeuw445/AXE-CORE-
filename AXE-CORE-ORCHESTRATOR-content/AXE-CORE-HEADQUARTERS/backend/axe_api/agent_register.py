"""Eén agent-register (BOUWLIJST "Eerst", punt 5 -- 19 nov 2026).

Probleem (gemeten 19 nov): `core_agents` had 19 rijen uit juli/augustus --
claude-3.5-sonnet als model, lege toolsets, een testrij `poc34142-agent` -- en
de zes managers die echt werken stonden er niet in. De lus draaide intussen op
`agent_workspace.AGENT_WORKSPACES` (tools, prompt, geheugen) en
`agent_tiers.json` (model). Drie lijsten, en de tabel die "het register"
heette klopte met geen van beide.

Nu: `core_agents` is de ene plek waar iedereen leest -- de Agents-tab, de
CLI, AXE zelf. Hij wordt bij elke start van de API gevuld uit precies wat de
lus laadt (`rijen()`), zodat wat je ziet = wat draait. Rijen die niet meer
bestaan gaan op status 'retired' (met `vervangen_door`), testrijen gaan weg.
`drift()` zegt het als de tabel en de lus toch uit elkaar lopen.

Puur waar het kan: `rijen`, `plan` en `verschillen` doen geen I/O.
"""
from __future__ import annotations

import logging
import re
from typing import Any

log = logging.getLogger("axe.agent_register")

BRON = "agent_workspace.py + agent_tiers.json"
TESTRIJ = re.compile(r"^(poc\d+|test)[-_]", re.I)

# Oude core_agents-namen -> de roster-id die het nu is (None = geen agent meer).
VERVANGEN_DOOR: dict[str, str | None] = {
    "axe_core": "axe", "axe_developer": "developer", "axe_trader": "trading",
    "axe_companion": "companion", "axe_intel": "intel", "axe_algo": "trading",
    "memory_agent": "memory", "code_agent": "developer", "browser_agent": "browser",
    "thinktank_agent": "thinktank", "task_agent": "task", "cron_manager": "cron",
    "finance_agent": "finance", "app_agent_manager": "apps",
    "infrastructure_agent": "apps", "crewai_manager": "wingman", "eve": None,
    "axe_ollama": None,
}

# Zelfde geheugen-namespaces als de app (src/domain/agents/catalog.ts).
_NAMESPACE = {"axe": "global", "trading": "axe_trader", "developer": "axe_code"}

# Velden die de lus bepaalt; drift = een van deze wijkt af in de tabel.
VELDEN = ("display_name", "role", "toolset", "model_name", "memory_namespace", "status")


def namespace(agent: str) -> str:
    return _NAMESPACE.get(agent, f"axe_{agent}")


def rijen() -> list[dict[str, Any]]:
    """Het register zoals de lus het laadt: één rij per agent met een werkplek."""
    from agent_workspace import AGENT_WORKSPACES, KLUIS_NAAM
    try:
        from provider_router import kaart_voor
    except Exception:  # noqa: BLE001
        kaart_voor = lambda _a: {}  # noqa: E731
    uit: list[dict[str, Any]] = []
    for agent, ws in AGENT_WORKSPACES.items():
        kaart = kaart_voor(agent) or {}
        uit.append({
            "name": agent,
            "display_name": KLUIS_NAAM.get(agent, agent),
            "role": str(ws.get("role") or ""),
            "description": str(kaart.get("cadence") or ws.get("role") or ""),
            "system_prompt": str(ws.get("system_prompt") or ""),
            "memory_namespace": namespace(agent),
            "toolset": [str(t) for t in (ws.get("tools") or ())],
            "model_provider": "provider_router",
            "model_name": str(kaart.get("model") or "tier-router"),
            "status": "active",
            "tier": str(kaart.get("kind") or "agent"),
            "capabilities": [str(c) for c in (ws.get("crew") or ())],
            "tags": ["register"],
            "metadata": {
                "bron": BRON,
                "model_tier": kaart.get("tier"),
                "seat_family": kaart.get("seat_family"),
                "cadence": kaart.get("cadence"),
                "memory_scope": ws.get("memory_scope"),
                "preferred_device": ws.get("preferred_device"),
                "dax_computer": ws.get("dax_computer"),
                "crew": [str(c) for c in (ws.get("crew") or ())],
            },
        })
    return uit


def plan(bestaand: list[dict[str, Any]], register: list[dict[str, Any]]) -> dict[str, list[Any]]:
    """Wat er moet gebeuren om de tabel gelijk te trekken (geen I/O)."""
    namen = {r["name"] for r in register}
    weg, retire = [], []
    for r in bestaand:
        naam = str(r.get("name") or "")
        if naam in namen:
            continue
        if TESTRIJ.match(naam):
            weg.append(naam)
        elif r.get("status") != "retired":
            retire.append(naam)
    return {"upsert": register, "retire": retire, "weg": weg}


def verschillen(bestaand: list[dict[str, Any]], register: list[dict[str, Any]]) -> list[str]:
    """Waar de tabel afwijkt van wat de lus draait. Leeg = één register."""
    per_naam = {str(r.get("name")): r for r in bestaand}
    uit: list[str] = []
    for r in register:
        rij = per_naam.get(r["name"])
        if rij is None:
            uit.append(f"{r['name']}: ontbreekt in core_agents")
            continue
        for veld in VELDEN:
            a, b = rij.get(veld), r.get(veld)
            if (list(a or []) if isinstance(b, list) else a) != b:
                uit.append(f"{r['name']}.{veld}: tabel {a!r} != lus {b!r}")
    namen = {r["name"] for r in register}
    for naam, rij in per_naam.items():
        if naam not in namen and rij.get("status") == "active":
            uit.append(f"{naam}: staat actief in core_agents maar de lus kent hem niet")
    return uit


def sync(db: Any) -> dict[str, Any]:
    """Trek core_agents gelijk aan de lus. Idempotent; draait bij API-start."""
    register = rijen()
    bestaand = db.table("core_agents").select("name,status,metadata").execute().data or []
    p = plan(bestaand, register)
    db.table("core_agents").upsert(p["upsert"], on_conflict="name").execute()
    oud_meta = {str(r.get("name")): (r.get("metadata") or {}) for r in bestaand}
    for naam in p["retire"]:
        meta = dict(oud_meta.get(naam) or {}, vervangen_door=VERVANGEN_DOOR.get(naam), retired_door="agent_register")
        db.table("core_agents").update({"status": "retired", "metadata": meta}).eq("name", naam).execute()
    for naam in p["weg"]:
        try:
            db.table("core_agents").delete().eq("name", naam).execute()
        except Exception:  # noqa: BLE001 -- nog ergens naar verwezen: dan op retired
            db.table("core_agents").update({"status": "retired"}).eq("name", naam).execute()
    # Capabilities die nog naar een oude naam wijzen, naar de agent die het nu is
    # (spraak leest daar de system prompt van; een retired rij geeft niets).
    omgezet = 0
    for oud, nieuw in VERVANGEN_DOOR.items():
        if not nieuw:
            continue
        try:
            r = db.table("core_capabilities").update({"preferred_agent": nieuw}).eq("preferred_agent", oud).execute()
            omgezet += len(r.data or [])
        except Exception as exc:  # noqa: BLE001
            log.warning("[register] capability %s niet omgezet: %s", oud, exc)
    return {"agents": len(register), "retired": p["retire"], "weg": p["weg"], "capabilities_omgezet": omgezet}


def lees(db: Any) -> dict[str, Any]:
    """Het register voor de app en de CLI: actieve rijen + of het klopt."""
    register = rijen()
    try:
        rijen_db = (db.table("core_agents")
                    .select("name,display_name,role,description,memory_namespace,toolset,model_provider,"
                            "model_name,status,tier,capabilities,metadata,updated_at")
                    .execute().data or [])
    except Exception as exc:  # noqa: BLE001 -- dan tonen wat de lus laadt, en zeggen dat het een terugval is
        log.warning("[register] core_agents niet gelezen: %s", exc)
        return {"agents": register, "drift": [f"core_agents niet leesbaar: {exc}"], "bron": "lus (terugval)"}
    actief = [r for r in rijen_db if r.get("status") == "active"]
    volgorde = {r["name"]: i for i, r in enumerate(register)}
    actief.sort(key=lambda r: volgorde.get(str(r.get("name")), 999))
    return {"agents": actief, "drift": verschillen(rijen_db, register), "bron": "core_agents"}
