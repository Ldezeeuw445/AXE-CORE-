"""Geheugen terugschrijven na elke taak (BOUWLIJST "Eerst", punt 4 -- 19 nov 2026).

Na elke taak, gelukt of mislukt, één verslag: wat gedaan, wat werkte, wat
faalde, welk besluit, volgende stap. Het gaat in het gedeelde log
(core_manager_messages, to_agent='log'), niet in een tweede geheugen: dat log
lezen AXE, de managers en elke AI-sessie al (gedeeld_log.py), en de
managercontext (manager_context.py) leest de verslagen van díe manager terug,
zodat hij weet wat hij vorige keer deed en niet blind herhaalt.

Puur waar het kan: `verslag` en `als_tekst` doen geen I/O.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

KOP = "Taakverslag"
MAX = 600  # gedeeld_log.MAX_TEKST


def _kort(s: Any, n: int) -> str:
    t = " ".join(str(s or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def _fout(e: Any) -> str:
    if isinstance(e, dict):
        return _kort(e.get("message") or e.get("code"), 200)
    return _kort(e, 200)


def verslag(taak: dict[str, Any], status: str, result: dict[str, Any] | None = None,
            error: Any = None) -> dict[str, str]:
    """Vijf velden uit wat de taak al opleverde. Leeg veld = niets bekend."""
    r = result or {}
    op = r.get("oplevering") if isinstance(r.get("oplevering"), dict) else {}
    ver = r.get("verification")
    gelukt = status == "completed"
    werkte = ""
    if gelukt:
        if op.get("tests"):
            werkte = f"tests: {_kort(op['tests'], 160)}"
        elif isinstance(ver, dict) and (ver.get("command") or ver.get("ok") is not None):
            werkte = f"bewijs: {_kort(ver.get('command') or 'gecontroleerd', 120)}"
        elif ver:
            werkte = "gecontroleerd"
    faalde = "" if gelukt else _fout(error or r.get("error")) or "onbekende fout"
    if gelukt and op and op.get("compleet") is False:
        faalde = f"niet compleet: {', '.join(op.get('ontbreekt') or []) or 'niet alles gecommit'}"
    besluit = _kort(r.get("decision") or r.get("besluit") or (f"branch {op['branch']}" if op.get("branch") else ""), 160)
    volgende = _kort(r.get("next_step") or r.get("volgende") or op.get("risicos")
                     or ("opnieuw proberen met een kleinere opdracht" if not gelukt else ""), 160)
    return {
        "gedaan": _kort(r.get("summary") or op.get("samenvatting") or taak.get("title"), 240),
        "werkte": werkte,
        "faalde": faalde,
        "besluit": besluit,
        "volgende": volgende,
    }


def als_tekst(taak: dict[str, Any], status: str, v: dict[str, str]) -> str:
    """Eén compacte regel voor het gedeelde log."""
    teken = "✓" if status == "completed" else "✗"
    delen = [f"{KOP} {teken} {_kort(taak.get('title'), 80)}", f"gedaan: {v['gedaan']}"]
    for veld in ("werkte", "faalde", "besluit", "volgende"):
        if v.get(veld):
            delen.append(f"{veld}: {v[veld]}")
    return " | ".join(delen)[:MAX]


def wie(taak: dict[str, Any]) -> str:
    meta = taak.get("metadata") if isinstance(taak.get("metadata"), dict) else {}
    return str(meta.get("chat_manager") or taak.get("assignee") or meta.get("agent") or "axe")[:60]


# Leerlus (punt 7): dezelfde tabel en vorm als openEpisode/closeEpisode in de
# app (agentFeedbackService.ts) en de cron-episodes in main.py.
EPISODE_USER = "acff7a12-1111-481d-a7a9-cc07583b8069"  # = main.AXE_CORE_EPISODE_USER_ID
# De namen die de app als lus kent (src/domain/memory/agentLoop.ts LOOP_AGENTS).
LOOP_AGENTS = frozenset({
    "chat", "trading", "code-editor", "browser", "research", "intel", "companion", "wingman",
    "task", "cron", "memory", "thinktank", "finance", "apps", "trading-desk-intel",
    "trading-desk-companion", "axemanager", "projectsmgr", "companionmgr", "axon", "tradingos",
    "northseamgr",
})
_LUS_NAAM = {"developer": "code-editor", "northsea": "northseamgr", "axe": "task"}


def lus_agent(taak: dict[str, Any]) -> str:
    """Onder welke lus deze taak telt: de agent die hem draaide, anders 'task'."""
    meta = taak.get("metadata") if isinstance(taak.get("metadata"), dict) else {}
    payload = taak.get("payload") if isinstance(taak.get("payload"), dict) else {}
    agent = str(taak.get("assignee") or payload.get("agent") or meta.get("agent") or "axe")
    naam = _LUS_NAAM.get(agent, agent)
    return naam if naam in LOOP_AGENTS else "task"


def oordeel(status: str, result: dict[str, Any] | None) -> str:
    """good = klaar én bewezen; poor = mislukt of niet compleet; anders unknown."""
    r = result or {}
    if status != "completed":
        return "poor"
    op = r.get("oplevering") if isinstance(r.get("oplevering"), dict) else {}
    if op.get("compleet") is False:
        return "poor"
    ver = r.get("verification")
    if isinstance(ver, dict) and ver.get("passed") is False:
        return "poor"
    return "good"


def episode(db: Any, taak: dict[str, Any], status: str, result: dict[str, Any] | None,
            tekst: str) -> bool:
    """Eén gesloten episode per taak in agent_learning_episodes."""
    try:
        nu = datetime.now(timezone.utc).isoformat()
        db.table("agent_learning_episodes").insert({
            "user_id": EPISODE_USER, "agent": lus_agent(taak),
            "subject": _kort(taak.get("title") or taak.get("id"), 500),
            "memory_ids": [], "memory_keys": [],
            "verdict": oordeel(status, result), "outcome_note": tekst[:500], "closed_at": nu,
        }).execute()
        return True
    except Exception:  # noqa: BLE001
        return False


def schrijf(db: Any, taak: dict[str, Any], status: str, result: dict[str, Any] | None = None,
            error: Any = None) -> bool:
    """Best effort: een verslag mag een taak nooit breken. Schrijft ook de episode."""
    try:
        import gedeeld_log as gl
        tekst = als_tekst(taak, status, verslag(taak, status, result, error))
        db.table("core_manager_messages").insert(gl.log_rij(wie(taak), tekst)).execute()
    except Exception:  # noqa: BLE001
        return False
    episode(db, taak, status, result, tekst)
    ervaring(db, taak, status, verslag(taak, status, result, error))
    return True


def ervaring(db: Any, taak: dict[str, Any], status: str, v: dict[str, str]) -> bool:
    """Een managertaak levert een les op die hij bij zijn volgende taak terugleest (manager_context).

    Apart van Luka's eigen lessen (to_agent 'lessen'): die zijn wet voor elke AI;
    dit is ervaring van één manager. Zelfde les twee keer = één keer."""
    meta = taak.get("metadata") if isinstance(taak.get("metadata"), dict) else {}
    if not meta.get("manager"):
        return False
    try:
        import manager_betrouwbaar as mb
        les = mb.ervaring_les(taak, status, v)
        if not les:
            return False
        agent = str(meta.get("agent") or taak.get("requested_by") or "axe")[:60]
        kop = les.splitlines()[0]
        al = (db.table("core_manager_messages").select("body").eq("to_agent", mb.ERVARING)
              .eq("from_agent", agent).order("created_at", desc=True).limit(30).execute().data) or []
        if any(str(r.get("body") or "").splitlines()[:1] == [kop] for r in al):
            return False
        db.table("core_manager_messages").insert({"from_agent": agent, "to_agent": mb.ERVARING,
                                                  "kind": "report", "body": les[:1200]}).execute()
        return True
    except Exception:  # noqa: BLE001 -- een les breekt nooit een taak
        return False
