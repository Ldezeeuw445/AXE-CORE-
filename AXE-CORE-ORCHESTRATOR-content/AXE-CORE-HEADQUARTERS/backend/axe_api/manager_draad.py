"""De Managers-tab als Grok Bot: één doorlopend gesprek tussen Luka en elke manager.

Luka, 9 nov 2026: "dat ik net als bij grokbot echt een gesprek heb met die
manager en ook terug kan lezen alles en dat ze mij ook in normale taal ...
terug sturen".

Tot nu toe:
- de chat per manager stond alleen in localStorage van één apparaat;
- wat de managers 24/7 deden ging als "Vaste jobs: ...; Keys: ..." naar de
  baas in core_manager_messages, en de app liet die tabel nergens zien.

Nu is core_manager_messages ook de draad met Luka (geen nieuwe tabel):

- Luka -> manager   from_agent='luka', to_agent=<manager>, kind='directive'
- manager -> Luka   from_agent=<manager>, to_agent='luka', kind='report'
  read_at leeg = Luka heeft het nog niet gelezen.

`vertel_luka` laat een manager in gewone zinnen zeggen wat hij deed, wat hij
ziet en wat hij van Luka nodig heeft -- alleen als dat anders is dan zijn
vorige bericht, zodat de chat geen kwartierlijkse herhaling wordt.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

LUKA = "luka"
MAX_LENGTE = 4000

# Hoe elke manager zichzelf noemt in de eerste zin (alleen voor de toon).
NAAM = {
    "axemanager": "AXE Manager", "projectsmgr": "Projects Manager", "companionmgr": "Companion Manager",
    "axon": "AXON", "tradingos": "Trading OS Manager", "northseamgr": "NorthSea Manager", "axe": "AXE",
}


def _zin(s: str) -> str:
    s = " ".join(str(s or "").split()).strip()
    if not s:
        return ""
    s = s[0].upper() + s[1:]
    return s if s[-1] in ".!?" else s + "."


def bericht(gedaan: Iterable[str] = (), gezien: Iterable[str] = (), nodig: Iterable[str] = (),
            rustig: str = "Alles loopt, ik hoef je nergens voor.") -> str:
    """Gewone taal, in de volgorde waarin je het wilt lezen: wat ik deed, wat
    jij moet doen, en wat ik verder zie."""
    gedaan, gezien, nodig = ([_zin(x) for x in xs if str(x or "").strip()] for xs in (gedaan, gezien, nodig))
    delen: list[str] = []
    if gedaan:
        delen.append("Wat ik gedaan heb:\n" + "\n".join(f"- {x}" for x in gedaan))
    if nodig:
        delen.append("Wat ik van jou nodig heb:\n" + "\n".join(f"- {x}" for x in nodig))
    if gezien:
        delen.append("Wat ik verder zie:\n" + "\n".join(f"- {x}" for x in gezien))
    return "\n\n".join(delen) if delen else _zin(rustig)


RECENT = 4


def _recent_aan_luka(db: Any, agent: str) -> list[str]:
    try:
        rijen = (db.table("core_manager_messages").select("body").eq("from_agent", agent).eq("to_agent", LUKA)
                 .order("created_at", desc=True).limit(RECENT).execute().data) or []
    except Exception:  # noqa: BLE001
        return []
    return [(r.get("body") or "").strip() for r in rijen]


def vertel_luka(db: Any, agent: str, tekst: str) -> bool:
    """Eén chatbericht van de manager aan Luka, alleen als het iets nieuws zegt.

    Tegen zijn laatste paar berichten, niet alleen het laatste: anders stuurt hij
    zijn stand opnieuw zodra er een ander bericht (zoals het dagelijkse
    opruimen) tussen kwam."""
    tekst = (tekst or "").strip()[:MAX_LENGTE]
    if not tekst or tekst in _recent_aan_luka(db, agent):
        return False
    try:
        db.table("core_manager_messages").insert({
            "from_agent": agent, "to_agent": LUKA, "kind": "report", "body": tekst,
        }).execute()
        return True
    except Exception:  # noqa: BLE001 -- een chatregel mag de pulse nooit breken
        return False


# ── de draad voor de app ───────────────────────────────────────────────────

def _rij_naar_bericht(r: dict[str, Any]) -> dict[str, Any] | None:
    van, naar = r.get("from_agent"), r.get("to_agent")
    if van == LUKA:
        agent, rol = naar, "user"
    elif naar == LUKA:
        agent, rol = van, "assistant"
    else:
        return None
    return {"id": r.get("id"), "agent": agent, "role": rol, "text": r.get("body") or "",
            "at": r.get("created_at"), "read": bool(r.get("read_at")) or rol == "user"}


def draad(db: Any, sinds: str | None = None, limiet: int = 500) -> list[dict[str, Any]]:
    """Alle berichten tussen Luka en de managers, oudste eerst."""
    q = (db.table("core_manager_messages").select("id,from_agent,to_agent,kind,body,created_at,read_at")
         .or_(f"from_agent.eq.{LUKA},to_agent.eq.{LUKA}"))
    if sinds:
        q = q.gt("created_at", sinds)
    rijen = q.order("created_at", desc=True).limit(max(1, min(limiet, 1000))).execute().data or []
    uit = [b for b in (_rij_naar_bericht(r) for r in rijen) if b]
    uit.reverse()
    return uit


def schrijf(db: Any, agent: str, rol: str, tekst: str) -> dict[str, Any]:
    """Een bericht uit de app: van Luka aan de manager, of het antwoord dat de
    app van die manager kreeg (zodat het op elk apparaat terug te lezen is)."""
    agent = (agent or "").strip()[:60]
    tekst = (tekst or "").strip()[:MAX_LENGTE]
    if not agent or agent == LUKA or not tekst:
        raise ValueError("agent en tekst zijn nodig")
    if rol == "user":
        rij = {"from_agent": LUKA, "to_agent": agent, "kind": "directive", "body": tekst,
               "read_at": datetime.now(timezone.utc).isoformat()}
    elif rol == "assistant":
        rij = {"from_agent": agent, "to_agent": LUKA, "kind": "report", "body": tekst,
               "read_at": datetime.now(timezone.utc).isoformat()}  # Luka zag het al in de app
    else:
        raise ValueError("rol is user of assistant")
    data = db.table("core_manager_messages").insert(rij).execute().data or [{}]
    return {"id": data[0].get("id"), "agent": agent, "role": rol, "at": data[0].get("created_at")}


def markeer_gelezen(db: Any, agent: str) -> None:
    db.table("core_manager_messages").update({"read_at": datetime.now(timezone.utc).isoformat()}) \
        .eq("from_agent", agent).eq("to_agent", LUKA).is_("read_at", "null").execute()


__all__ = ["bericht", "vertel_luka", "draad", "schrijf", "markeer_gelezen", "LUKA"]
