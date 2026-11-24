"""Status van een DAX-bot uit zijn echte werk (sprint 4, 24 nov).

De DAX-bots stonden in de Managers-tab als 'Ready' of 'Live' -- afgeleid uit
niets. Nu: wat hij open heeft, wat op Luka wacht, wat mislukte en wat hij af
kreeg in 24 uur, uit core_tasks (assignee = de bot), plus per terrein één
meting. Puur: de aanroeper geeft de rijen; geen database hier.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

DAX_BOTS = ("northsea", "trading", "developer", "thinktank", "browser")
OPEN = {"queued", "pending", "planning", "claimed", "running", "verifying", "in_progress"}
WACHT = {"waiting_approval", "blocked", "awaiting_approval", "needs_approval"}

# Wat "klaar" voor deze bot heet, voor de ene regel.
KLAAR_WOORD = {
    "northsea": "deal actions done",
    "trading": "research runs done",
    "developer": "builds/tasks done",
    "thinktank": "insights delivered",
    "browser": "browse sessions done",
}


def _tijd(s: Any) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return t if t.tzinfo else t.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def werk(agent: str, taken: list[dict[str, Any]], nu: datetime, pending_ok: int = 0,
         meting: str | None = None) -> dict[str, Any]:
    """{open, wacht, mislukt_24u, klaar_24u, laatste_klaar, regel, stand}."""
    eigen = [t for t in taken if str(t.get("assignee") or "") == agent]
    grens = nu - timedelta(hours=24)

    def recent(t: dict[str, Any]) -> bool:
        tt = _tijd(t.get("completed_at") or t.get("updated_at"))
        return bool(tt and tt >= grens)

    open_ = [t for t in eigen if str(t.get("status")) in OPEN]
    wacht = len([t for t in eigen if str(t.get("status")) in WACHT]) + max(0, int(pending_ok or 0))
    mislukt = [t for t in eigen if t.get("status") == "failed" and recent(t)]
    klaar = sorted((t for t in eigen if t.get("status") == "completed" and recent(t)),
                   key=lambda t: str(t.get("completed_at") or t.get("updated_at") or ""), reverse=True)
    if wacht:
        stand = "needs_you"
    elif open_:
        stand = "working"
    elif mislukt and not klaar:
        stand = "failing"
    else:
        stand = "idle"
    delen = []
    if open_:
        delen.append(f"{len(open_)} open")
    if wacht:
        delen.append(f"{wacht} waiting on you")
    delen.append(f"{len(klaar)} {KLAAR_WOORD.get(agent, 'tasks done')} (24h)")
    if mislukt:
        delen.append(f"{len(mislukt)} failed")
    if meting:
        delen.append(meting)
    return {
        "open": len(open_), "wacht": wacht, "mislukt_24u": len(mislukt), "klaar_24u": len(klaar),
        "laatste_klaar": (str(klaar[0].get("title") or "")[:80] if klaar else None),
        "stand": stand, "regel": " · ".join(delen),
    }


def feed_meting(rijen: list[dict[str, Any]], nu: datetime) -> str:
    """Trading: hoeveel intel-feeds vers (26 u) en hoeveel met een fout."""
    vers = [r for r in rijen if (t := _tijd(r.get("last_sync_at"))) and nu - t < timedelta(hours=26)]
    fout = [r for r in rijen if str(r.get("last_error") or "").strip()]
    return f"{len(vers)}/{len(rijen)} feeds fresh" + (f", {len(fout)} failing" if fout else "")
