"""'Doe de rij': AXE werkt de open stappen van de AI af, één voor één.

Luka zegt "doe de rij" (chat, notch of `axe rij`). Dan krijgen alle open
stappen waar een AI eigenaar van is een plek in de rij (metadata.rij = nummer).
Alleen de eerste gaat naar de wachtrij van de worker. Elke ronde van de
staande managerdienst (elke 2 min) kijkt: draait er nog een rij-taak? Zo
niet, dan gaat de volgende erin. Elke stap krijgt een regel in het log.

De toestand staat in de taken zelf -- geen aparte vlag die kan verouderen.

Wat er NOOIT in de rij komt: trading, NorthSea-akkoorden, geld, verwijderen,
en alles wat al op Luka wacht. Die blijven bij Luka.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import gedeeld_log as gl

ACTOR = "axe"
MAX_IN_RIJ = 25
ACTIEF = {"queued", "planning", "running", "in_progress", "verifying", "retrying"}
NOOIT_CAPABILITY = {"trading", "northsea_desk", "task_manage"}
NOOIT_TITEL = re.compile(
    r"(yes needed|trading|\btrade\b|deal[- ]?\d|order|betaal|payment|factuur|invoice|goedkeur|approve|"
    r"verwijder|delete|wis\b|drop table|copper cathode|mt5|quantlab|algo-?engine)",
    re.I,
)


def _meta(t: dict[str, Any]) -> dict[str, Any]:
    m = t.get("metadata")
    return m if isinstance(m, dict) else {}


def is_ai_eigenaar(t: dict[str, Any]) -> bool:
    wie = str(t.get("assignee") or "").strip().lower()
    return bool(wie) and wie not in gl.WIE_LUKA and wie not in gl.WIE_SAMEN and wie not in ("luka", "samen")


def waarom_niet(t: dict[str, Any]) -> str | None:
    """None = mag in de rij. Anders de reden in een paar woorden."""
    if str(t.get("status") or "") != "pending":
        return "niet open"
    if not is_ai_eigenaar(t):
        return "van Luka"
    if str(t.get("capability") or "") in NOOIT_CAPABILITY:
        return "trading/NorthSea"
    if NOOIT_TITEL.search(f"{t.get('title') or ''} {t.get('goal') or ''}"):
        return "geld, trading, akkoord of wissen"
    return None


def kies_rij(taken: list[dict[str, Any]], max_n: int = MAX_IN_RIJ) -> list[dict[str, Any]]:
    """De open AI-stappen die in de rij mogen, oudste eerst."""
    goed = [t for t in taken if waarom_niet(t) is None and "rij" not in _meta(t)]
    goed.sort(key=lambda t: str(t.get("created_at") or ""))
    return goed[:max_n]


def in_rij(taken: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted((t for t in taken if isinstance(_meta(t).get("rij"), int)), key=lambda t: _meta(t)["rij"])


def volgende(taken: list[dict[str, Any]]) -> tuple[str, dict[str, Any] | None]:
    """('bezig', taak) als er een rij-taak draait; ('volgende', taak) om te starten; ('leeg', None)."""
    rij = in_rij(taken)
    for t in rij:
        if str(t.get("status") or "") in ACTIEF:
            return "bezig", t
    for t in rij:
        if str(t.get("status") or "") == "pending":
            return "volgende", t
    return "leeg", None


def start_velden(t: dict[str, Any]) -> dict[str, Any]:
    """Pending -> queued. Een losse stap (capability 'stap') heeft geen handler: die gaat naar 'agentic'."""
    cap = str(t.get("capability") or "")
    velden: dict[str, Any] = {"status": "queued", "revision": int(t.get("revision") or 0) + 1}
    if cap in ("", gl.STAP):
        velden["capability"] = "agentic"
    return velden


# ── I/O ──────────────────────────────────────────────────────────────────

_KOLOMMEN = "id,title,goal,status,capability,assignee,metadata,revision,created_at"


def _taken(db: Any) -> list[dict[str, Any]]:
    open_ = (db.table("core_tasks").select(_KOLOMMEN).eq("status", "pending")
             .order("created_at").limit(300).execute().data or [])
    actief = (db.table("core_tasks").select(_KOLOMMEN).in_("status", sorted(ACTIEF))
              .limit(300).execute().data or [])
    return open_ + actief


def _zet(db: Any, t: dict[str, Any], velden: dict[str, Any]) -> bool:
    rij = (db.table("core_tasks").update(velden).eq("id", t["id"])
           .eq("revision", int(t.get("revision") or 0)).execute().data or [])
    return bool(rij)


def _start(db: Any, t: dict[str, Any]) -> bool:
    if not _zet(db, t, start_velden(t)):
        return False
    nr = _meta(t).get("rij")
    gl.schrijf(db, ACTOR, f"Rij {nr}: ik pak op -- {t.get('title')}")
    return True


def begin(db: Any, actor: str = "luka") -> dict[str, Any]:
    """'Doe de rij': nummer de open AI-stappen en start de eerste (als er niets draait)."""
    taken = _taken(db)
    bestaand = in_rij(taken)
    nr = max((_meta(t)["rij"] for t in bestaand), default=0)
    nieuw = kies_rij(taken)
    toegevoegd = 0
    for t in nieuw:
        nr += 1
        meta = {**_meta(t), "rij": nr, "rij_door": actor}
        if _zet(db, t, {"metadata": meta, "revision": int(t.get("revision") or 0) + 1}):
            toegevoegd += 1
    if toegevoegd:
        gl.schrijf(db, actor, f"Doe de rij: {toegevoegd} stappen van de AI staan klaar, één voor één.")
    return {"toegevoegd": toegevoegd, **tik(db)}


def tik(db: Any, nu: datetime | None = None) -> dict[str, Any]:
    """Eén ronde: draait er niets uit de rij, start dan de volgende."""
    taken = _taken(db)
    stand, t = volgende(taken)
    open_ = sum(1 for x in in_rij(taken) if x.get("status") == "pending")
    if stand == "volgende" and t is not None:
        gestart = _start(db, t)
        return {"stand": "gestart" if gestart else "veranderd", "taak": t.get("title"), "open": open_ - int(gestart)}
    return {"stand": stand, "taak": (t or {}).get("title"), "open": open_}


def stop(db: Any, actor: str = "luka") -> dict[str, Any]:
    """Haal de nog niet gestarte stappen uit de rij. Wat al draait, maakt hij af."""
    weg = 0
    for t in in_rij(_taken(db)):
        if t.get("status") != "pending":
            continue
        meta = {k: v for k, v in _meta(t).items() if k not in ("rij", "rij_door")}
        if _zet(db, t, {"metadata": meta, "revision": int(t.get("revision") or 0) + 1}):
            weg += 1
    if weg:
        gl.schrijf(db, actor, f"Rij gestopt: {weg} stappen terug naar open.")
    return {"gestopt": weg}


def stand(db: Any) -> dict[str, Any]:
    taken = _taken(db)
    rij = in_rij(taken)
    s, t = volgende(taken)
    return {
        "stand": s,
        "nu": (t or {}).get("title") if s == "bezig" else None,
        "open": sum(1 for x in rij if x.get("status") == "pending"),
        "kan_erin": len(kies_rij(taken)),
        "kandidaten": [str(t.get("title") or "")[:120] for t in kies_rij(taken)[:10]],
    }


# ── "Doe het zelf"-knop (25 nov, BOUWLIJST) ───────────────────────────────
# Eén stap van Luka (of samen) laat AXE meteen zelf afwerken op de achtergrond.
# Dezelfde grens als de rij: geen trading, NorthSea-akkoorden, geld of wissen;
# een stap die op Luka's ja wacht blijft een vraag, die neemt AXE niet over.

ZELF_DOEL = ("Luka pressed 'Do it for me' on this step: finish it yourself in the background. "
             "If part of it truly needs Luka (an account, money, a yes), do everything else and "
             "end with exactly what he still has to do.")


def waarom_niet_zelf(t: dict[str, Any]) -> str | None:
    """None = AXE mag deze stap zelf afwerken. Anders de reden in het Engels (voor de knop)."""
    status = str(t.get("status") or "")
    if status == "waiting_approval":
        return "This waits on your yes; AXE won't decide it for you."
    if status != "pending":
        return "This step is already running or closed."
    if str(t.get("capability") or "") in NOOIT_CAPABILITY:
        return "Trading and NorthSea decisions stay with you."
    if NOOIT_TITEL.search(f"{t.get('title') or ''} {t.get('goal') or ''}"):
        return "Money, trading, approvals or deleting stay with you."
    return None


def zelf_velden(t: dict[str, Any], actor: str = "luka") -> dict[str, Any]:
    """Pending -> queued bij AXE, met wie hem had en een doel dat zegt wat er van AXE verwacht wordt."""
    velden = start_velden(t)
    doel = str(t.get("goal") or t.get("title") or "").strip()
    velden["assignee"] = "axe"
    velden["goal"] = f"{doel}\n\n{ZELF_DOEL}"[:2000]
    velden["metadata"] = {**_meta(t), "zelf_door": actor, "zelf_van": t.get("assignee") or "luka"}
    return velden


def doe_zelf(db: Any, stap_id: str, actor: str = "luka") -> dict[str, Any]:
    """De knop: neem één stap over. {'ok': bool, 'reden'?: str, 'titel'?: str}."""
    rijen = (db.table("core_tasks").select(_KOLOMMEN).eq("id", stap_id).limit(1).execute().data or [])
    if not rijen:
        return {"ok": False, "reden": "Step not found."}
    t = rijen[0]
    reden = waarom_niet_zelf(t)
    if reden:
        return {"ok": False, "reden": reden, "titel": t.get("title")}
    if not _zet(db, t, zelf_velden(t, actor)):
        return {"ok": False, "reden": "The step just changed; try again.", "titel": t.get("title")}
    gl.schrijf(db, ACTOR, f"Doe het zelf: ik pak op -- {t.get('title')}")
    return {"ok": True, "titel": t.get("title")}


__all__ = ["begin", "tik", "stop", "stand", "kies_rij", "volgende", "waarom_niet", "start_velden",
           "doe_zelf", "waarom_niet_zelf", "zelf_velden"]
