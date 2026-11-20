"""Vaste toestemming: "als ik zeg dat het mag, dan mag het" (BOUWLIJST, Luka 17 nov).

Tot nu toe gold een "ok" alleen voor die ene taak: dezelfde vraag ("mag ik
`docker logs dax-thinktank-01 --tail 40` draaien?") kwam bij elke volgende taak
terug. Nu kan Luka "Altijd" zeggen. Dan staat dat precieze commando (of die
precieze Mac-actie) vast, en vraagt AXE het niet meer.

Waar het staat: in core_manager_messages, to_agent='toestemming', net als de
lessen (to_agent='lessen'). Eén rij per toestemming; intrekken = de rij weg.
Geen nieuwe tabel.

Wat NOOIT vast kan, hoe vaak Luka ook "altijd" zegt: alles wat de buitenwereld
of geld raakt, of niet terug te draaien is -- pushen/mergen, verwijderen,
sudo, betalen, handelen, versturen. Die blijven elke keer om een ok vragen.
"""
from __future__ import annotations

import re
from typing import Any

PLEK = "toestemming"
LUKA = "luka"

NOOIT_VAST = re.compile(
    r"(\bgit\s+(push|merge)|\bpush\b|\bmerge\b|pull[_ ]?request|\bgh\s+pr|"
    r"(^|[\s;&|])rm\s|\brmdir\b|\bdelete\b|\bdrop\s|\btruncate\b|"
    r"\bsudo\b|\bshutdown\b|\breboot\b|\bmkfs\b|(^|[\s;&|])dd\s|chmod\s+-R|\bchown\b|"
    r"\bpay(ment)?\b|\btransfer\b|\bwire\b|\biban\b|\binvoice\b|\border\b|\btrade\b|\bbuy\b|\bsell\b|"
    r"\bsend\b|\bmail\b|\bsmtp\b|\bresend\b|\bsendmail\b|curl\s+-X\s*(POST|PUT|DELETE)|terminal\.free)",
    re.I,
)


def _ingrijpend_op_mac(s: str) -> bool:
    """Een Mac-actie op het zwaarste niveau (git push/merge/PR, verwijderen,
    vrije terminal) wordt altijd per keer gevraagd, wat de sleutel ook zegt."""
    try:
        from device_actions import TOOL_TIERS
    except Exception:  # noqa: BLE001
        return False
    return any(t in s for t, tier in TOOL_TIERS.items() if tier == "consequential")


def sleutel(tekst: str) -> str:
    """Zelfde normalisatie als agent_loop.normalize_command (spaties, hoofdletters)."""
    return " ".join(str(tekst or "").split()).strip()


def mag_vast(tekst: str) -> tuple[bool, str]:
    s = sleutel(tekst)
    if not s:
        return False, "leeg"
    if len(s) > 400:
        return False, "te lang om vast te zetten"
    if NOOIT_VAST.search(s) or _ingrijpend_op_mac(s):
        return False, "raakt de buitenwereld, geld of is niet terug te draaien: blijft elke keer vragen"
    return True, ""


def lees(db: Any) -> tuple[str, ...]:
    """Alle vaste toestemmingen. Een leesfout = geen (dan vraagt AXE gewoon)."""
    try:
        rijen = (db.table("core_manager_messages").select("body").eq("to_agent", PLEK)
                 .order("created_at", desc=True).limit(500).execute().data) or []
    except Exception:  # noqa: BLE001
        return ()
    uit = []
    for r in rijen:
        s = sleutel(r.get("body") or "")
        if s and mag_vast(s)[0] and s not in uit:
            uit.append(s)
    return tuple(uit)


def geef(db: Any, tekst: str, door: str = LUKA) -> dict[str, Any]:
    ok, reden = mag_vast(tekst)
    s = sleutel(tekst)
    if not ok:
        return {"ok": False, "reden": reden, "sleutel": s}
    if s in lees(db):
        return {"ok": True, "al": True, "sleutel": s}
    db.table("core_manager_messages").insert({
        "from_agent": door[:60] or LUKA, "to_agent": PLEK, "kind": "directive", "body": s,
    }).execute()
    return {"ok": True, "sleutel": s}


def trek_in(db: Any, tekst: str) -> bool:
    s = sleutel(tekst)
    try:
        db.table("core_manager_messages").delete().eq("to_agent", PLEK).eq("body", s).execute()
        return True
    except Exception:  # noqa: BLE001
        return False
