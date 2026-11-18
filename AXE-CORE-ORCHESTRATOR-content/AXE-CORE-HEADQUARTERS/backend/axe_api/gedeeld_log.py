"""Eén log en één stappenlijst voor elke AI (Luka, 18 nov 2026).

"Zorgen dat elke AI alles weet van de andere en andere sessies": AXE, de
managers, DAX, Claude Code, Codex, Cursor. Het patroon (naar Spazio):

- **Log**: elke sessie schrijft aan het eind één regel -- wat gevraagd, wat
  veranderd, waar gestopt. De volgende sessie, van welke AI ook, leest de
  laatste regels eerst.
- **Stappen**: wat er nu open staat, en wiens beurt het is (Luka of een AI).

Geen nieuwe tabel: het log staat in core_manager_messages (to_agent='log',
kind='log'), de stappen zijn de open core_tasks. Later neemt AXON dit over.
Puur waar het kan; de I/O zit in main.py.
"""
from __future__ import annotations

from typing import Any

LOG = "log"
MAX_TEKST = 600
OPEN = ("pending", "queued", "retrying", "waiting_approval", "planning", "running", "in_progress", "verifying")


def log_rij(actor: str, tekst: str) -> dict[str, Any]:
    actor = " ".join(str(actor or "").split())[:60] or "onbekend"
    tekst = " ".join(str(tekst or "").split())[:MAX_TEKST]
    if not tekst:
        raise ValueError("lege logregel")
    return {"from_agent": actor, "to_agent": LOG, "kind": LOG, "body": tekst}


def als_regel(r: dict[str, Any]) -> dict[str, Any]:
    return {"wie": r.get("from_agent"), "tekst": r.get("body") or "", "wanneer": r.get("created_at")}


def verdeel_stappen(taken: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Wiens beurt: Luka (wacht op zijn ja) of een AI (pakt hem zelf op)."""
    jouw, ai = [], []
    for t in taken:
        if t.get("status") not in OPEN:
            continue
        stap = {"id": t.get("id"), "titel": t.get("title"), "wie": t.get("assignee") or "axe",
                "status": t.get("status"), "sinds": t.get("created_at")}
        (jouw if t.get("status") == "waiting_approval" or t.get("assignee") == "luka" else ai).append(stap)
    return {"jouw_beurt": jouw, "ai_beurt": ai}


def context_tekst(regels: list[dict[str, Any]], max_regels: int = 10) -> str:
    """De laatste logregels als korte context voor een AI die begint."""
    if not regels:
        return ""
    lijnen = [f"- {str(r.get('wanneer') or '')[:16]} {r.get('wie')}: {r.get('tekst')}" for r in regels[:max_regels]]
    return "Gedeeld log (laatste sessies van alle AI's, nieuwste eerst):\n" + "\n".join(lijnen)


def schrijf(db: Any, actor: str, tekst: str) -> bool:
    """Eén regel in het gedeelde log; best effort (een logregel breekt nooit het werk)."""
    try:
        db.table("core_manager_messages").insert(log_rij(actor, tekst)).execute()
        return True
    except Exception:  # noqa: BLE001
        return False


def taak_regel(taak: dict[str, Any], resultaat: dict[str, Any]) -> tuple[str, str]:
    """Wie en wat, voor een afgeronde taak van een AI."""
    wie = str(taak.get("assignee") or (taak.get("metadata") or {}).get("agent") or taak.get("capability") or "axe")
    wat = str(resultaat.get("summary") or "").strip()
    titel = str(taak.get("title") or "taak").strip()
    return wie, (f"{titel}: {wat}" if wat else f"{titel}: afgerond")[:MAX_TEKST]
