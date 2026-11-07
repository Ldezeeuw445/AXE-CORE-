"""Nieuwe mail bij de NorthSea-desk: binnen een minuut bij Luka, niet bij de volgende ronde.

## Waarom dit bestaat

Luka, 6 november: NorthSea is een lopend bedrijf, partijen sturen ondertekende
documenten terug, en "sommige dingen kunnen zo belangrijk zijn dat er meteen
wat mee moet". De NorthSea-manager kijkt elk kwartier; een getekende NCNDA mag
niet een kwartier (of een dagoverzicht) wachten.

Deze wachter hangt aan `/cron/tick` (elke minuut, zelfde tik die de meldingen
naar het slotscherm duwt) en leest alleen de inkomende mail van het laatste
etmaal via de NorthSea-gateway. Elke mail wordt precies één keer gemeld.

## Wat hier wel en niet gebeurt

* Lezen en melden. Nooit antwoorden, nooit iets goedkeuren, nooit een deal
  wijzigen: de NorthSea-motor (resend-inbound) maakt zelf de concepten, en
  alle auto_send-vlaggen staan uit.
* `beoordeel_mail` is puur en testbaar: één inbound-rij erin, een melding (of
  niets) eruit.
* "nu": iets dat Luka moet zien en waar een kaart bij hoort (getekende of
  juridische documenten, betaling/bank, deadline, een concept dat op hem wacht,
  een mail die niet eenduidig aan een deal te koppelen is).
* "gewoon": elke andere echte reactie. Bij een desk van deze omvang is iedere
  reactie van een tegenpartij nieuws; alleen geen kaart.
* Niets: testrecords, afwezigheidsberichten, bounces.
"""
from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

# Ouder dan dit melden we niet meer: na een storing van een paar uur wil je niet
# dat er twintig oude mails tegelijk afgaan. De desk zelf heeft ze dan al.
VENSTER = timedelta(hours=6)
JOB = "northsea_mail"
# Een belangrijke mail krijgt ook een leesbeurt van de NorthSea-manager in zijn
# werklus (agent_loop, tool northsea_read): wat staat er, bij welke deal, wat
# moet Luka beslissen. Gratis modellen, alleen lezen, hooguit zoveel per dag.
ANALYSE_DOOR = "northsea-mailwachter"
MAX_ANALYSES_PER_DAG = 8

BELANGRIJK: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(signed|countersigned|executed|ondertekend|getekend|signature)\b", re.I), "getekend document"),
    (re.compile(r"\b(ncnda|imfpa|fpa|spa|loi|icpo|fco|sco|contract|agreement|overeenkomst)\b", re.I), "juridisch document"),
    (re.compile(r"\b(payment|invoice|factuur|betaling|swift|mt103|letter of credit|l/c|sblc|bank)\b", re.I), "betaling of bank"),
    (re.compile(r"\b(urgent|asap|deadline|today|vandaag|expires?|verloopt)\b", re.I), "haast of deadline"),
]
AUTOMATISCH = re.compile(
    r"(out of (the )?office|automatic reply|auto[- ]?reply|automatisch antwoord|afwezig|"
    r"delivery status notification|undeliverable|mail delivery (failed|subsystem)|mailer-daemon|returned mail)",
    re.I,
)


@dataclass(frozen=True)
class MailMelding:
    communicatie_id: str
    niveau: str  # "nu" of "gewoon"
    titel: str
    detail: str
    reden: str


def _tijd(s: Any) -> datetime | None:
    if not isinstance(s, str) or not s:
        return None
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _afzender(item: dict[str, Any]) -> str:
    for bron in (item.get("counterparty"), item.get("contact")):
        if isinstance(bron, dict):
            naam = str(bron.get("name") or bron.get("display_name") or "").strip()
            if naam:
                return naam
    return "nieuwe afzender"


def beoordeel_mail(item: dict[str, Any]) -> MailMelding | None:
    """Puur. Alleen inbound mail die een mens schreef wordt een melding."""
    cid = str(item.get("communication_id") or "")
    if not cid or item.get("direction") not in (None, "inbound") or item.get("is_synthetic"):
        return None
    onderwerp = str(item.get("subject") or "").strip()
    analyse = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    tekst = " ".join([onderwerp, str(item.get("preview") or ""), str(analyse.get("summary") or "")])
    if AUTOMATISCH.search(onderwerp) or AUTOMATISCH.search(str(item.get("preview") or "")[:200]):
        return None

    redenen = [label for patroon, label in BELANGRIJK if patroon.search(tekst)]
    if analyse.get("requires_human_approval"):
        redenen.append("concept wacht op jouw ok")
    if str(analyse.get("risk_level") or "").lower() == "high":
        redenen.append("gevoelige inhoud")
    mapping = item.get("mapping") if isinstance(item.get("mapping"), dict) else {}
    if mapping.get("status") == "ambiguous":
        redenen.append("niet eenduidig aan een deal te koppelen")
    redenen = list(dict.fromkeys(redenen))

    # Geen tegenpartij, geen contact en de desk weet niet wat het is: systeempost
    # (zoals de Google Workspace-facturen van 8 okt), geen nieuws. Een getekend
    # document van een onbekend adres heeft hierboven al een reden en gaat door.
    onbekend = not item.get("counterparty") and not item.get("contact") \
        and str(analyse.get("classification") or "unknown").lower() == "unknown"
    if onbekend and not redenen:
        return None

    niveau = "nu" if redenen else "gewoon"
    kanaal = "Bel" if item.get("channel") == "phone" else "Mail"
    kop = f"NorthSea {kanaal.lower()} van {_afzender(item)}"
    if onderwerp:
        kop = f"{kop} - {onderwerp}"
    # push_meldingen knipt het onderwerp bij ": " binnen 80 tekens.
    kop = kop.replace(":", " ")[:78].rstrip()
    deal = f" Deal: {item['deal']}." if item.get("deal") else ""
    inhoud = str(analyse.get("summary") or item.get("preview") or "").strip().replace("\n", " ")[:300]
    waarom = f"Belangrijk: {', '.join(redenen)}. " if redenen else ""
    detail = f"{waarom}{inhoud}{deal} Lees en beantwoord vanuit trade@ in Gmail; de desk heeft hem al verwerkt.".strip()
    return MailMelding(cid, niveau, kop, detail, ", ".join(redenen) or "nieuwe reactie")


def nieuwe(items: list[dict[str, Any]], nu: datetime) -> list[MailMelding]:
    """Binnen het venster, oudste eerst, zodat het slotscherm de volgorde houdt."""
    grens = nu - VENSTER
    vers = [i for i in items if (_tijd(i.get("occurred_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= grens]
    vers.sort(key=lambda i: _tijd(i.get("occurred_at")) or grens)
    return [m for m in (beoordeel_mail(i) for i in vers) if m]


Claim = Callable[[str, str], bool]


def analyse_opdracht(m: MailMelding) -> str:
    return (
        f"A mail just reached the NorthSea desk (communication {m.communicatie_id}): {m.titel}. "
        f"Why it matters: {m.reden}.\n"
        "Use northsea_read: get_communication_thread for this communication, then the deal "
        "(get_deal, get_deal_blockers) if it belongs to one, and list_pending_approvals for a "
        "draft the desk already made. Do not research, send or approve anything.\n"
        "Finish with three short Dutch lines for Luka: 1) wat er staat, 2) bij welke deal en "
        "wat dat verandert, 3) wat hij nu moet beslissen of doen (of: niets). Prove it with "
        "`echo` of the communication id you read."
    )


def zet_analyse_klaar(db: Any, m: MailMelding, nu: datetime) -> bool:
    """Eén leestaak voor northseamgr. False als het dagbudget op is of de insert faalt."""
    try:
        vandaag = (db.table("core_tasks").select("id").eq("requested_by", ANALYSE_DOOR)
                   .gte("created_at", nu.replace(hour=0, minute=0, second=0, microsecond=0).isoformat())
                   .execute().data) or []
        if len(vandaag) >= MAX_ANALYSES_PER_DAG:
            return False
        db.table("core_tasks").insert({
            "title": f"Duiden: {m.titel}"[:120],
            "goal": analyse_opdracht(m),
            "status": "queued", "priority": "high", "source_app": "axe_core",
            "requested_by": ANALYSE_DOOR, "capability": "agentic", "assignee": "northseamgr",
            "execution_mode": "read",
            "payload": {"crew": False, "free_models": True, "northsea_communication_id": m.communicatie_id},
            "metadata": {"northsea_mail_analyse": True, "northsea_communication_id": m.communicatie_id},
        }).execute()
        return True
    except Exception:  # noqa: BLE001 -- de melding zelf is al weg; dit is extra
        return False


def meld(db: Any, meldingen: list[MailMelding], claim: Claim) -> dict[str, int]:
    """Schrijf elke melding één keer. `claim` is de atomaire (job, sleutel)-claim
    uit main.py: bij meerdere uvicorn-workers meldt er precies één."""
    from goedkeuring_melding import LUKA_USER_ID, melding_voor_goedkeuring, vraag_luka

    uit = {"nu": 0, "gewoon": 0, "al_gemeld": 0, "analyses": 0}
    for m in meldingen:
        if not claim(JOB, m.communicatie_id):
            uit["al_gemeld"] += 1
            continue
        if m.niveau == "nu":
            if zet_analyse_klaar(db, m, datetime.now(timezone.utc)):
                uit["analyses"] += 1
            taak = None
            try:
                taak = (db.table("core_tasks").insert({
                    "title": m.titel, "status": "waiting_approval", "assignee": "northseamgr",
                    "capability": "task_manage", "source_app": "axe_core", "goal": m.detail,
                    "metadata": {"agent": "northseamgr", "northsea_communication_id": m.communicatie_id},
                }).execute().data or [None])[0]
            except Exception:  # noqa: BLE001 -- zonder taak toch melden, hieronder
                taak = None
            if taak and taak.get("id"):
                vraag_luka(db, taak["id"], titel=m.titel, detail=m.detail, kind="northsea_mail",
                           requested_by="northseamgr",
                           metadata={"northsea_communication_id": m.communicatie_id, "reden": m.reden})
                uit["nu"] += 1
                continue
        try:
            db.table("core_notifications").insert({
                "recipient": LUKA_USER_ID,
                "type": "warning" if m.niveau == "nu" else "info",
                "message": melding_voor_goedkeuring(m.titel, m.detail),
            }).execute()
            uit[m.niveau] += 1
        except Exception:  # noqa: BLE001
            pass
    return uit


Ophaler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]


async def haal(ophaler: Ophaler | None = None) -> list[dict[str, Any]]:
    if ophaler is None:
        import northsea_gateway
        ophaler = northsea_gateway.call_action
    antwoord = await ophaler("list_recent_inbound", {"days": 1, "limit": 25})
    items = ((antwoord or {}).get("result") or {}).get("items") or []
    return [i for i in items if isinstance(i, dict)]


async def ronde(db: Any, claim: Claim, nu: datetime | None = None, ophaler: Ophaler | None = None) -> dict[str, int]:
    """Eén minuutronde. Gooit niet: hangt aan /cron/tick."""
    nu = nu or datetime.now(timezone.utc)
    items = await haal(ophaler)
    return await asyncio.to_thread(meld, db, nieuwe(items, nu), claim)
