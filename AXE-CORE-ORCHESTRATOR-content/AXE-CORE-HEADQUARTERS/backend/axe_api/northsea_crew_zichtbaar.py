"""Zichtbare NorthSea-deskberichten in de takenlijst en het geheugen.

De drie roosters leveren JSON terug. Wat daar `notices` heet, komt hier in
`core_tasks` (assignee=northsea) en `rag_memories`, zodat een lege run niet
verdwijnt en een ja-vraag zegt wat, aan wie en waarom.

Puur op het cron-antwoord: geen tweede goedkeuringssysteem, geen auto_send.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

AGENT = "northsea"
DESK = "northsea-desk-manager"
OORSPRONG = "northsea-crew-loop"


def berichten_uit_cron(job: str, data: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Zet het JSON-antwoord van een NorthSea-cron om in zichtbare rijen."""
    if not isinstance(data, dict):
        return []
    uit: list[dict[str, Any]] = []
    ruwe = list(data.get("notices") or [])
    if not ruwe and data.get("status") == "idle":
        ruwe.append({
            "soort": "leeg",
            "titel": f"Desk run: {job} found nothing new",
            "tekst": data.get("message") or "The scheduled crew ran and had nothing to decide.",
            "eigenaar": "axe",
            "akkoord_nodig": False,
        })
    if not ruwe and job == "discovery_sweep" and int(data.get("created") or 0) == 0:
        ruwe.append({
            "soort": "leeg",
            "titel": "Desk run: discovery found no new match",
            "tekst": (
                f"Discovery & Sourcing considered {data.get('considered_pairs')} pairs "
                f"and created 0. What yes does: nothing — this is not a hunt request."
            ),
            "eigenaar": "axe",
            "akkoord_nodig": False,
        })
    if not ruwe and job == "engine_tick":
        followups = (data.get("summary") or {}).get("followups") if isinstance(data.get("summary"), dict) else None
        if followups == 0 or (isinstance(data.get("plan"), dict) and not data["plan"].get("followups")):
            ruwe.append({
                "soort": "leeg",
                "titel": "Desk run: communication engine had 0 follow-ups",
                "tekst": "Communication Engine planned 0 follow-ups. First-touch is the deal crew. What yes does: nothing.",
                "eigenaar": "axe",
                "akkoord_nodig": False,
            })
    for n in ruwe:
        if not isinstance(n, dict):
            continue
        ja = bool(n.get("akkoord_nodig") or n.get("soort") == "ja")
        titel = str(n.get("titel") or "").strip() or (
            "Yes needed on a NorthSea deal" if ja else "Desk run: nothing to decide"
        )
        tekst = str(n.get("tekst") or "").strip()
        if ja and "What yes does:" not in tekst:
            tekst = (tekst + "\nWhat yes does: " + str(n.get("what_yes_does") or "Review this deal.")).strip()
        uit.append({
            "titel": titel[:200],
            "tekst": tekst[:4000],
            "eigenaar": "luka" if ja else (n.get("eigenaar") or "axe"),
            "oorsprong": n.get("oorsprong") or OORSPRONG,
            "akkoord_nodig": ja,
            "job": job,
            "deal_id": n.get("deal_id"),
            "deal_code": n.get("deal_code"),
            "buyer": n.get("buyer"),
            "seller": n.get("seller"),
            "commission": n.get("commission"),
        })
    return uit


def core_task_rij(bericht: dict[str, Any]) -> dict[str, Any]:
    ja = bool(bericht.get("akkoord_nodig"))
    return {
        "title": bericht["titel"],
        "goal": bericht["tekst"][:800] if bericht.get("tekst") else bericht["titel"],
        "description": bericht.get("tekst") or None,
        "status": "waiting_approval" if ja else "pending",
        "priority": "high" if ja else "medium",
        "assignee": AGENT,
        "capability": "northsea_desk",
        "execution_mode": "read",
        "source_app": "northsea",
        "requested_by": "luka" if bericht.get("eigenaar") == "luka" else DESK,
        "payload": {
            "deal_id": bericht.get("deal_id"),
            "deal_code": bericht.get("deal_code"),
            "buyer": bericht.get("buyer"),
            "seller": bericht.get("seller"),
            "commission": bericht.get("commission"),
        },
        "metadata": {
            "agent": AGENT,
            "app": "northsea",
            "source": "cron",
            "cronNaam": bericht.get("job") or "northsea",
            "oorsprong": bericht.get("oorsprong") or OORSPRONG,
            "eigenaar": bericht.get("eigenaar") or "axe",
            "uiStatus": "blocked" if ja else "todo",
            "goedkeuring": "nodig" if ja else "niet_nodig",
        },
    }


def geheugen_rij(job: str, berichten: list[dict[str, Any]], *, sent: int = 0) -> dict[str, Any]:
    if berichten:
        tekst = "\n\n".join(f"{b['titel']}\n{b.get('tekst') or ''}" for b in berichten)
    else:
        tekst = f"NorthSea {job}: no notice this run. Sent {sent}."
    return {
        "user_id": "axe-core",
        "category": "northsea_desk",
        "content": tekst[:4000],
        "importance": 0.7 if any(b.get("akkoord_nodig") for b in berichten) else 0.3,
        "metadata": {
            "agent": AGENT,
            "job": job,
            "oorsprong": OORSPRONG,
            "sent": sent,
            "at": datetime.now(timezone.utc).isoformat(),
        },
    }


def schrijf_zichtbaar(db: Any, job: str, data: dict[str, Any] | None) -> dict[str, Any]:
    """Schrijf cron-notices naar core_tasks en rag_memories. Fouten slikken: de cron zelf is al klaar."""
    berichten = berichten_uit_cron(job, data)
    taken = 0
    geheugen = 0
    for b in berichten:
        try:
            db.table("core_tasks").insert(core_task_rij(b)).execute()
            taken += 1
        except Exception:
            pass
    try:
        db.table("rag_memories").insert(
            geheugen_rij(job, berichten, sent=int((data or {}).get("sent") or 0))
        ).execute()
        geheugen = 1
    except Exception:
        pass
    return {"taken": taken, "geheugen": geheugen, "berichten": len(berichten)}
