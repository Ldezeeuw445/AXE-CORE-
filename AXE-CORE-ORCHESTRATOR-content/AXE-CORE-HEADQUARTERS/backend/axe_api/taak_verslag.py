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


def schrijf(db: Any, taak: dict[str, Any], status: str, result: dict[str, Any] | None = None,
            error: Any = None) -> bool:
    """Best effort: een verslag mag een taak nooit breken."""
    try:
        import gedeeld_log as gl
        tekst = als_tekst(taak, status, verslag(taak, status, result, error))
        db.table("core_manager_messages").insert(gl.log_rij(wie(taak), tekst)).execute()
        return True
    except Exception:  # noqa: BLE001
        return False
