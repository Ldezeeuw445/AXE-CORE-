"""De desk opruimen: wat zeker kan gaat vanzelf, de rest wordt een voorstel.

Luka, 10 nov 2026: de NorthSea Manager moet "alles kunnen regelen en besluiten";
gekozen niveau: opruimen + voorstellen. Op de desk wachtten 72 dingen op hem, waarvan
16 al weggezette mails, dubbele concepten (Lagos 2x, Colombo 2x, Mundra 3x) en
taken die zowel in action_queue als in deal_tasks stonden.

## Wat deze module NOOIT doet

Iets versturen, goedkeuren, een prijs/voorwaarde/contract accepteren of een
partij voorstellen. Alleen drie soorten "wegzetten", elk terug te draaien:

- een ingekomen mail -> email_intelligence.status 'dismissed'
- een niet-verzonden concept -> reply_drafts.approval_status 'rejected'
- een open wachtrij-item -> action_queue.status 'cancelled'

Elke wijziging krijgt een northsea_audit_events-rij met de vorige status, zodat
`terug` (de vorige waarde) altijd vast ligt.

## Automatisch (stap 1) tegenover voorstel (stap 2)

Automatisch alleen wat geen oordeel vraagt: ruis-mails, exacte dubbele
concepten (de nieuwste blijft), en een wachtrij-item dat als zelfde taak al in
deal_tasks staat. Al het andere dat oud is, wordt een genummerd voorstel
(V1, V2, ...) dat pas gebeurt als Luka "ok V1" zegt. Een voorstel is
deterministisch: dezelfde stand geeft dezelfde lijst, dus "ok V1" voert precies
uit wat hij zag (en wat sindsdien al weg is, slaat hij over).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from northsea_mcp.canon import is_open

RUIS_KLASSE = {"spam", "internal"}
RUIS_MOTOR = {"spam_noise", "bounce_failure"}
OUDE_MAIL = timedelta(days=30)
OUD_CONCEPT = timedelta(days=21)
DOOD_ONDERZOEK = timedelta(days=14)
OPEN_WACHTRIJ = ("open", "in_progress", "waiting")


@dataclass(frozen=True)
class Stap:
    tabel: str
    id: str
    veld: str
    nieuw: str
    oud: str | None
    reden: str
    label: str


@dataclass
class Voorstel:
    code: str
    titel: str
    waarom: str
    stappen: list[Stap] = field(default_factory=list)


@dataclass
class Plan:
    automatisch: list[Stap]
    voorstellen: list[Voorstel]


def _tijd(s: Any) -> datetime | None:
    if not s:
        return None
    try:
        t = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _norm(s: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"^(re|fwd?)\s*:\s*", "", str(s or "").strip(), flags=re.I)).lower()


def _kort(s: Any, n: int = 70) -> str:
    t = re.sub(r"\s+", " ", str(s or "")).strip() or "(geen onderwerp)"
    return t if len(t) <= n else t[: n - 1] + "…"


def _open_inbound(rows: list[dict]) -> list[dict]:
    return [e for e in rows if e.get("requires_human_approval") and str(e.get("status") or "").lower() == "analyzed"]


def _open_concepten(rows: list[dict]) -> list[dict]:
    return [d for d in rows if d.get("approval_status") == "pending" and not d.get("sent_at") and not d.get("resend_email_id")]


def maak_plan(tabellen: dict[str, list[dict]], nu: datetime) -> Plan:
    inbound = _open_inbound(tabellen.get("email_intelligence") or [])
    concepten = _open_concepten(tabellen.get("reply_drafts") or [])
    wachtrij = [a for a in tabellen.get("action_queue") or [] if a.get("status") in OPEN_WACHTRIJ]
    taken = [t for t in tabellen.get("deal_tasks") or [] if t.get("status") in OPEN_WACHTRIJ]

    auto: list[Stap] = []
    weg: set[str] = set()

    # 1. Ruis: spam, interne meldingen, bounces. Daar beslist niemand iets over.
    for e in inbound:
        if str(e.get("classification") or "") in RUIS_KLASSE or str(e.get("engine_primary") or "") in RUIS_MOTOR:
            auto.append(Stap("email_intelligence", str(e["id"]), "status", "dismissed", e.get("status"),
                             "ruis (spam, intern of bounce)", _kort(e.get("summary"))))
            weg.add(str(e["id"]))

    # 2. Exact dubbele concepten: zelfde mail beantwoord, of zelfde ontvanger en onderwerp.
    # Twee rondes: eerst per beantwoorde mail, dan per ontvanger + onderwerp
    # (Lagos 2x hing aan twee verschillende ingekomen mails van dezelfde partij).
    def per_mail(d: dict) -> tuple | None:
        return ("c", d.get("communication_id")) if d.get("communication_id") else None

    def per_ontvanger(d: dict) -> tuple | None:
        wie = str(d.get("to_email") or d.get("company_id") or "").lower()
        onderwerp = _norm(d.get("subject"))
        return ("o", wie, onderwerp) if wie and onderwerp else None

    for sleutel_van in (per_mail, per_ontvanger):
        groepen: dict[tuple, list[dict]] = {}
        for d in concepten:
            k = sleutel_van(d)
            if k and str(d["id"]) not in weg:
                groepen.setdefault(k, []).append(d)
        for leden in groepen.values():
            if len(leden) < 2:
                continue
            leden.sort(key=lambda d: _tijd(d.get("created_at")) or nu, reverse=True)
            for d in leden[1:]:
                auto.append(Stap("reply_drafts", str(d["id"]), "approval_status", "rejected", d.get("approval_status"),
                                 "dubbel concept; het nieuwste blijft staan", _kort(d.get("subject"))))
                weg.add(str(d["id"]))

    # 3. Een wachtrij-item dat als zelfde taak al in deal_tasks staat.
    taak_sleutels = {(str(t.get("opportunity_id")), _norm(t.get("title"))) for t in taken}
    for a in wachtrij:
        if (str(a.get("opportunity_id")), _norm(a.get("title"))) in taak_sleutels and a.get("opportunity_id"):
            auto.append(Stap("action_queue", str(a["id"]), "status", "cancelled", a.get("status"),
                             "staat al als taak in de desk", _kort(a.get("title"))))
            weg.add(str(a["id"]))

    voorstellen: list[Voorstel] = []

    # Mails van een deal waar nog een beslissing van Luka op ligt (DEAL-002)
    # horen bij die beslissing, niet in een opruimvoorstel.
    beslist_nog = {str(o.get("id")) for o in tabellen.get("opportunities") or []
                   if o.get("approval_required") and is_open(o)}
    oude_mails = [e for e in inbound if str(e["id"]) not in weg
                  and str(e.get("opportunity_id")) not in beslist_nog
                  and (t := _tijd(e.get("created_at"))) and nu - t > OUDE_MAIL]
    if oude_mails:
        voorstellen.append(Voorstel(
            "V1", f"Sluit {len(oude_mails)} ingekomen mails ouder dan 30 dagen",
            "Ze zijn geanalyseerd maar nooit beantwoord; na een maand is het gesprek koud. De mail zelf blijft bewaard.",
            [Stap("email_intelligence", str(e["id"]), "status", "dismissed", e.get("status"),
                  "ouder dan 30 dagen (Luka: ok)", _kort(e.get("summary"))) for e in oude_mails]))

    oude_concepten = [d for d in concepten if str(d["id"]) not in weg
                      and (t := _tijd(d.get("created_at"))) and nu - t > OUD_CONCEPT]
    if oude_concepten:
        voorstellen.append(Voorstel(
            "V2", f"Zet {len(oude_concepten)} conceptantwoorden ouder dan 3 weken weg",
            "Nooit verstuurd; een antwoord van weken later leest als een nieuw begin. Wil je er een toch sturen, "
            "dan maakt de manager een vers concept.",
            [Stap("reply_drafts", str(d["id"]), "approval_status", "rejected", d.get("approval_status"),
                  "ouder dan 3 weken (Luka: ok)", _kort(d.get("subject"))) for d in oude_concepten]))

    dood = [a for a in wachtrij if str(a["id"]) not in weg
            and str(a.get("title") or "").lower().startswith("research approved, budget exhausted")
            and (t := _tijd(a.get("updated_at") or a.get("created_at"))) and nu - t > DOOD_ONDERZOEK]
    if dood:
        voorstellen.append(Voorstel(
            "V3", f"Stop {len(dood)} onderzoek(en) dat op budget vastliep",
            "Goedgekeurd maar nooit uitgevoerd en al weken stil; als het nog nodig is start de manager het opnieuw.",
            [Stap("action_queue", str(a["id"]), "status", "cancelled", a.get("status"),
                  "onderzoek liep vast op budget (Luka: ok)", _kort(a.get("title"))) for a in dood]))

    return Plan(automatisch=auto, voorstellen=voorstellen)


def plan_als_dict(plan: Plan) -> dict[str, Any]:
    def stap(s: Stap) -> dict:
        return {"table": s.tabel, "id": s.id, "set": {s.veld: s.nieuw}, "was": s.oud, "reason": s.reden, "label": s.label}
    return {
        "automatic": [stap(s) for s in plan.automatisch],
        "proposals": [{"code": v.code, "title": v.titel, "why": v.waarom, "count": len(v.stappen),
                       "items": [stap(s) for s in v.stappen]} for v in plan.voorstellen],
    }


__all__ = ["maak_plan", "plan_als_dict", "Plan", "Stap", "Voorstel"]
