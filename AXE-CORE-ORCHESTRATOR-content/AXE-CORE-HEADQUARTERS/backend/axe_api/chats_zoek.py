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

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

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


# ── Vragen en samenvatten (met bron) ──────────────────────────────────────

_STOP = set("""de het een en van in op te dat die voor met is zijn was wat waar wie hoe wanneer waarom
ik je jij hij zij we wij jullie ze mijn mij me ons onze er om aan als bij dan door naar niet nog ook of
over tot uit maar heb heeft hebben had kan kun kunnen moet moeten zou wil wilde deze dit al alle
the a an and of in on to that is are was what where who how when why i you he she we they my me our
it for with as at by from not but have has had can could should would do does did this these all""".split())


def zoekwoorden(vraag: str, max_n: int = 5) -> list[str]:
    """De woorden uit een vraag waarop gezocht wordt: lang genoeg, geen stopwoord, langste eerst."""
    woorden = [w for w in re.findall(r"[\w-]{3,}", vraag.lower()) if w not in _STOP]
    uniek = list(dict.fromkeys(woorden))
    return sorted(uniek, key=len, reverse=True)[:max_n]


def bron_tekst(bronnen: list[dict[str, Any]]) -> str:
    return "\n".join(f"[{i}] {b.get('gesprek')} · {b.get('wie')} · {str(b.get('op') or '')[:16]}: {b.get('tekst')}"
                     for i, b in enumerate(bronnen, 1))


VRAAG_PROMPT = ("You answer Luka's question using ONLY the excerpts from his conversations with AXE and his "
                "managers below. Cite every fact with its number, like [2]. If the excerpts do not contain the "
                "answer, say so plainly. Answer in the language of the question, in at most five short sentences.")
SAMENVAT_PROMPT = ("Summarise this conversation between Luka and {wie} in exactly three short lines: what was asked, "
                   "what was done or decided, and what is still open. Plain text, no bullets, no preamble. Use the "
                   "language the conversation is in.")

_MODELLEN = (
    ("GROQ_AGENTS_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-120b"),
    ("GROQ_LIGHT_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-20b"),
    ("GROQ_RESERVE_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "openai/gpt-oss-20b"),
    ("CEREBRAS_API_KEY", "https://api.cerebras.ai/v1/chat/completions", "gpt-oss-120b"),
    ("OPENROUTER3_API_KEY", "https://openrouter.ai/api/v1/chat/completions", "openrouter/free"),
    ("OPENROUTER4_API_KEY", "https://openrouter.ai/api/v1/chat/completions", "openrouter/free"),
    ("OPENROUTER5_API_KEY", "https://openrouter.ai/api/v1/chat/completions", "openrouter/free"),
)


async def vraag_model(systeem: str, inhoud: str, max_tokens: int = 1500) -> tuple[str | None, str | None]:
    """(antwoord, model) of (None, reden). Licht en snel: geen agent-lus, geen Mac-stoel."""
    import httpx
    redenen = []
    for env, url, model in _MODELLEN:
        sleutel = os.environ.get(env, "").strip()
        if not sleutel:
            continue
        try:
            async with httpx.AsyncClient(timeout=40) as c:
                vraag = {
                    # 25 nov live: met 600 tokens stopte het antwoord midden in een zin -- gpt-oss
                    # denkt eerst na en dat telt mee. Meer ruimte, en het nadenken op laag.
                    "model": model, "max_tokens": max_tokens,
                    "messages": [{"role": "system", "content": systeem}, {"role": "user", "content": inhoud[:24000]}],
                }
                if "gpt-oss" in model:
                    vraag["reasoning_effort"] = "low"
                r = await c.post(url, headers={"Authorization": f"Bearer {sleutel}"}, json=vraag)
            try:
                import sleutel_teller
                sleutel_teller.tel(env, r.status_code, tekst=None if r.is_success else r.text[:400])
            except Exception:  # noqa: BLE001
                pass
            if r.is_success:
                tekst = (((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or "").strip()
                if tekst:
                    return tekst, model
            redenen.append(f"{model} {r.status_code}")
        except Exception as exc:  # noqa: BLE001
            redenen.append(f"{model} {type(exc).__name__}")
    return None, ("no model available right now (" + ", ".join(redenen) + ")") if redenen else "no model key configured"


async def beantwoord(vraag: str, zoek: Callable[[str], Awaitable[list[dict[str, Any]]]],
                     model: Callable[[str, str], Awaitable[tuple[str | None, str | None]]] = vraag_model,
                     max_bronnen: int = 24) -> dict[str, Any]:
    """Zoek per zoekwoord, voeg samen (nieuwste eerst, zonder dubbelen), laat het model antwoorden met bron."""
    gezien, bronnen = set(), []
    for w in zoekwoorden(vraag):
        for t in await zoek(w):
            sleutel = (t.get("bron"), t.get("id"))
            if sleutel not in gezien:
                gezien.add(sleutel)
                bronnen.append(t)
    bronnen = sorted(bronnen, key=lambda t: str(t.get("op") or ""), reverse=True)[:max_bronnen]
    if not bronnen:
        return {"vraag": vraag, "antwoord": "I found nothing about this in any conversation.", "bronnen": [], "model": None}
    antwoord, wie = await model(VRAAG_PROMPT, f"QUESTION: {vraag}\n\nEXCERPTS:\n{bron_tekst(bronnen)}")
    return {"vraag": vraag, "antwoord": antwoord, "fout": None if antwoord else wie,
            "model": wie if antwoord else None,
            "bronnen": [{"n": i, **b} for i, b in enumerate(bronnen, 1)]}


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

    async def _zoek_een(q: str) -> list[dict[str, Any]]:
        db = sb()
        axe = (db.table("axe_messages").select("id,conversation_id,role,content,created_at")
               .ilike("content", _like(q)).order("created_at", desc=True).limit(12).execute().data) or []
        return treffers(axe, _manager_rijen(db, q, 12), q)

    @router.post("/ask")
    async def chats_vraag(body: dict):
        vraag = str((body or {}).get("vraag") or (body or {}).get("question") or "").strip()
        if len(vraag) < 3:
            raise HTTPException(400, "vraag needs at least 3 characters")
        return await beantwoord(vraag[:500], _zoek_een)

    @router.get("/summary")
    async def chats_samenvatting(gesprek: str):
        db = sb()
        if gesprek in ("AXE", "axe"):
            rijen = (db.table("axe_messages").select("role,content,created_at")
                     .order("created_at", desc=True).limit(25).execute().data) or []
            regels = [f"{'Luka' if r.get('role') == 'user' else 'AXE'}: {_schoon(r.get('content'))[:250]}" for r in reversed(rijen)]
            wie = "AXE"
        else:
            if not re.fullmatch(r"[a-z0-9_-]{2,40}", gesprek or ""):
                raise HTTPException(400, "unknown conversation")
            rijen = (db.table("core_manager_messages").select("from_agent,to_agent,body,created_at")
                     .or_(f"and(from_agent.eq.{LUKA},to_agent.eq.{gesprek}),and(from_agent.eq.{gesprek},to_agent.eq.{LUKA})")
                     .order("created_at", desc=True).limit(25).execute().data) or []
            rijen = list(reversed(rijen))
            regels = [f"{'Luka' if r.get('from_agent') == LUKA else gesprek}: {_schoon(r.get('body'))[:250]}" for r in rijen]
            wie = gesprek
        if not regels:
            return {"gesprek": gesprek, "samenvatting": None, "fout": "no messages in this conversation"}
        # 25 nov live: 40 berichten x 400 tekens + 1500 tokens gaf op elke gratis route 429 (tokens per
        # minuut); een vraag van dezelfde grootte als de bronnen lukte wel. Kleiner past.
        tekst, model = await vraag_model(SAMENVAT_PROMPT.format(wie=wie), "\n".join(regels), max_tokens=500)
        return {"gesprek": gesprek, "samenvatting": tekst, "fout": None if tekst else model,
                "model": model if tekst else None, "berichten": len(regels)}

    return router
