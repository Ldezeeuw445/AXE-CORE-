"""Chats: elk gesprek met AXE en de managers doorzoekbaar (BOUWLIJST 'Chats-pagina', 25 nov).

Twee bronnen, allebei al in de database:
  - axe_messages            het AXE-hoofdgesprek (conversation_id, role, content)
  - core_manager_messages   de managergesprekken met Luka (from_agent/to_agent = 'luka')

GET /chats/search?q=...   treffers uit beide, nieuwste eerst, met bron (welk gesprek,
                          wie, wanneer) en een stukje tekst rond het zoekwoord.
GET /chats/overview       per gesprek: wanneer laatst, hoeveel berichten deze week, en
                          de laatste drie regels.

Alleen lezen. Samenvatten en "vraag aan alle gesprekken" komen hier bovenop (met bron).
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

LUKA = "luka"
MAX_PER_BRON = 40


def _schoon(tekst: Any) -> str:
    return " ".join(str(tekst or "").split())


def stukje(tekst: Any, q: str, breedte: int = 90) -> str:
    """Het stuk tekst rond het eerste zoekwoord, met ... waar afgekapt."""
    t = _schoon(tekst)
    if not q:
        return t[: breedte * 2]
    i = t.lower().find(q.lower())
    if i < 0:
        return t[: breedte * 2]
    begin, eind = max(0, i - breedte), min(len(t), i + len(q) + breedte)
    return ("..." if begin else "") + t[begin:eind] + ("..." if eind < len(t) else "")


def _like(q: str) -> str:
    # % en _ zijn jokers in ilike; letterlijk zoeken.
    return "%" + re.sub(r"([%_\\])", r"\\\1", q) + "%"


def manager_van(rij: dict[str, Any]) -> str:
    van, naar = str(rij.get("from_agent") or ""), str(rij.get("to_agent") or "")
    return naar if van == LUKA else van


def treffers(axe: list[dict[str, Any]], managers: list[dict[str, Any]], q: str) -> list[dict[str, Any]]:
    """Puur: ruwe rijen -> één lijst treffers, nieuwste eerst."""
    uit = []
    for r in axe:
        uit.append({
            "bron": "axe", "gesprek": "AXE", "gesprek_id": r.get("conversation_id"),
            "wie": "Luka" if r.get("role") == "user" else "AXE",
            "tekst": stukje(r.get("content"), q), "op": r.get("created_at"), "id": r.get("id"),
        })
    for r in managers:
        m = manager_van(r)
        uit.append({
            "bron": "manager", "gesprek": m, "gesprek_id": m,
            "wie": "Luka" if r.get("from_agent") == LUKA else m,
            "tekst": stukje(r.get("body"), q), "op": r.get("created_at"), "id": r.get("id"),
        })
    return sorted(uit, key=lambda t: str(t.get("op") or ""), reverse=True)


def overzicht(axe: list[dict[str, Any]], managers: list[dict[str, Any]], nu: datetime) -> list[dict[str, Any]]:
    """Puur: per gesprek laatst, aantal in 7 dagen, laatste drie regels (nieuwste onderaan)."""
    week = (nu - timedelta(days=7)).isoformat()
    groepen: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for r in axe:
        groepen.setdefault(("axe", str(r.get("conversation_id") or "")), []).append(
            {"wie": "Luka" if r.get("role") == "user" else "AXE", "tekst": r.get("content"), "op": r.get("created_at")})
    for r in managers:
        m = manager_van(r)
        if not m:
            continue
        groepen.setdefault(("manager", m), []).append(
            {"wie": "Luka" if r.get("from_agent") == LUKA else m, "tekst": r.get("body"), "op": r.get("created_at")})
    uit = []
    for (bron, sleutel), rijen in groepen.items():
        rijen.sort(key=lambda x: str(x.get("op") or ""))
        uit.append({
            "bron": bron, "gesprek": "AXE" if bron == "axe" else sleutel, "gesprek_id": sleutel,
            "laatst": rijen[-1].get("op"),
            "deze_week": sum(1 for x in rijen if str(x.get("op") or "") >= week),
            "laatste_regels": [{"wie": x["wie"], "tekst": _schoon(x["tekst"])[:160], "op": x["op"]} for x in rijen[-3:]],
        })
    return sorted(uit, key=lambda g: str(g.get("laatst") or ""), reverse=True)


def build_router(sb: Callable[[], Any]) -> Any:
    from fastapi import APIRouter, HTTPException

    router = APIRouter()

    def _manager_rijen(db: Any, q: str | None, limit: int) -> list[dict[str, Any]]:
        kol = "id,from_agent,to_agent,body,created_at"
        rijen: list[dict[str, Any]] = []
        for veld in ("from_agent", "to_agent"):
            vraag = db.table("core_manager_messages").select(kol).eq(veld, LUKA)
            if q:
                vraag = vraag.ilike("body", _like(q))
            rijen += vraag.order("created_at", desc=True).limit(limit).execute().data or []
        gezien, uniek = set(), []
        for r in rijen:
            if r.get("id") not in gezien:
                gezien.add(r.get("id"))
                uniek.append(r)
        return uniek

    @router.get("/search")
    async def chats_zoek(q: str = "", limit: int = MAX_PER_BRON):
        q = (q or "").strip()
        if len(q) < 2:
            raise HTTPException(400, "q needs at least 2 characters")
        limit = max(1, min(int(limit or MAX_PER_BRON), MAX_PER_BRON))
        db = sb()
        axe = (db.table("axe_messages").select("id,conversation_id,role,content,created_at")
               .ilike("content", _like(q)).order("created_at", desc=True).limit(limit).execute().data) or []
        return {"q": q, "treffers": treffers(axe, _manager_rijen(db, q, limit), q)[: limit * 2]}

    @router.get("/overview")
    async def chats_overzicht():
        db = sb()
        axe = (db.table("axe_messages").select("id,conversation_id,role,content,created_at")
               .order("created_at", desc=True).limit(300).execute().data) or []
        return {"gesprekken": overzicht(axe, _manager_rijen(db, None, 600), datetime.now(timezone.utc))}

    return router
