"""
Meldingen uit `core_notifications` naar de apparaten van Luka duwen.

## Waarom dit hier draait en niet in de app

De app ziet een melding alleen zolang hij open staat (`NotificationContext`
luistert live op Supabase). Dicht is stil. Web Push is het enige dat een
slotscherm bereikt, en dat vraagt om een zender met de privé-VAPID-sleutel --
die hoort op de server, niet in een bundel die iedereen kan lezen.

Aangeroepen vanuit `/cron/tick`, dat de VPS-crontab al elke minuut aanroept. Geen
nieuwe dienst, geen tweede plek die kan omvallen.

## Dezelfde regel, twee talen -- en waarom dat hier mag

`src/domain/pushBericht.ts` doet precies dit voor de app, met een test per vorm.
Deze module is de tweede uitvoering van diezelfde regel, in Python, omdat de
zender nu eenmaal niet in TypeScript draait. Dat is een kopie en dus een risico:
veranderen ze los van elkaar, dan ziet je slotscherm iets anders dan de bel.

Daarom staat het hier expliciet, en staat het daar ook: **wijzig je er één, wijzig
dan de ander.** `test_push_meldingen.py` gebruikt dezelfde voorbeelden als
`pushBericht.test.ts`, zodat ze samen rood worden als ze uit elkaar lopen.

De alternatieven waren slechter: de payload in de service worker bouwen geeft een
DERDE kopie (die worker is los JavaScript en kan de domeinmodule niet importeren),
en de payload bij het invoegen laten berekenen vraagt om een wijziging op elke
plek die een melding schrijft.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

# Hoe lang terug we nog versturen. Een melding van gisteren die nu alsnog
# binnenkomt is geen nieuws maar ruis, en bij een storing van een paar uur wil je
# niet dat er dertig meldingen tegelijk afgaan zodra het weer werkt.
MAX_LEEFTIJD = timedelta(hours=1)
# Per tik, zodat een bui het minuutvenster van de cron niet opeet.
MAX_PER_TIK = 20

# Zelfde grens als MAX_TITLE_LENGTH in src/domain/notification.ts.
MAX_TITEL = 80

# Zelfde tabel als TARGETS in src/domain/notification.ts, op het ONDERWERP
# gematcht en niet op de hele tekst -- een detailalinea noemt het halve systeem
# en zou je naar de verkeerde tab sturen.
DOELEN: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"provider|model|api[- ]?key|sleutel", re.I), "/settings"),
    (re.compile(r"taak|task|todo", re.I), "/tasks"),
    (re.compile(r"geheugen|memory", re.I), "/memory"),
    (re.compile(r"cron|schema|schedule", re.I), "/cron-manager"),
    (re.compile(r"trading|algo|positie", re.I), "/trading-intel"),
    (re.compile(r"agent|crew|skill", re.I), "/agents"),
]


def titel_en_detail(bericht: str) -> tuple[str, str]:
    """Onderwerp en rest. Zie notificationText() -- `core_notifications` heeft
    geen title-kolom, dus het onderwerp komt uit het bericht zelf."""
    tekst = (bericht or "").strip()
    if not tekst:
        return ("Zonder tekst", "")
    regel = tekst.find("\n")
    if 0 < regel <= MAX_TITEL:
        return (tekst[:regel].strip(), tekst[regel + 1:].strip())
    dubbel = tekst.find(": ")
    if 0 < dubbel <= MAX_TITEL:
        return (tekst[:dubbel].strip(), tekst[dubbel + 2:].strip())
    return (tekst, "")


def tag_van(titel: str) -> str:
    """Eén tag per soort bericht, niet per rij: meldingen met dezelfde tag
    vervangen elkaar in plaats van het slotscherm vol te zetten. Cijfers eruit,
    zodat '3 van de 5 mislukt' en '4 van de 5 mislukt' samenvallen."""
    kaal = re.sub(r"[0-9]+", "", titel.lower())
    kaal = re.sub(r"[^a-zà-ÿ ]+", " ", kaal).strip()
    kaal = re.sub(r"\s+", "-", kaal)
    return f"axe-{kaal[:40]}" if kaal else "axe-melding"


def route_van(titel: str) -> str:
    for patroon, route in DOELEN:
        if patroon.search(titel):
            return route
    return "/"


def push_bericht_van(rij: dict[str, Any]) -> dict[str, str] | None:
    """De melding voor deze rij, of None als er niets te melden valt."""
    bericht = (rij.get("message") or "").strip()
    if not bericht:
        return None
    titel, detail = titel_en_detail(bericht)
    return {"titel": titel, "body": detail, "tag": tag_van(titel), "url": route_van(titel)}


async def stuur_meldingen(sb_factory, nu: datetime | None = None) -> dict[str, int]:
    """Alle nog niet verstuurde meldingen naar alle aangemelde apparaten.

    Geeft een telling terug zodat /cron/tick kan laten zien dat het liep. Gooit
    niet: een mislukte pushronde mag nooit de cron-tik omver halen.
    """
    nu = nu or datetime.now(timezone.utc)
    verstuurd = 0
    opgeruimd = 0
    try:
        from pywebpush import WebPushException, webpush
    except Exception as e:  # pragma: no cover - alleen op een box zonder dependency
        print(f"[push] pywebpush ontbreekt: {e}", flush=True)
        return {"verstuurd": 0, "opgeruimd": 0}

    import os

    prive = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    contact = os.environ.get("VAPID_CONTACT", "mailto:admin@axecompanion.com")
    if not prive:
        # Stil blijven zou betekenen dat niemand merkt dat meldingen niet gaan.
        print("[push] VAPID_PRIVATE_KEY niet gezet — er gaat niets uit", flush=True)
        return {"verstuurd": 0, "opgeruimd": 0}

    sb = sb_factory()
    grens = (nu - MAX_LEEFTIJD).isoformat()
    rijen = (
        sb.table("core_notifications")
        .select("id,type,message,created_at")
        .is_("pushed_at", "null")
        .gte("created_at", grens)
        .order("created_at", desc=False)
        .limit(MAX_PER_TIK)
        .execute()
        .data
        or []
    )
    if not rijen:
        return {"verstuurd": 0, "opgeruimd": 0}

    abonnementen = (
        sb.table("core_push_subscriptions").select("endpoint,p256dh,auth").execute().data or []
    )

    for rij in rijen:
        payload = push_bericht_van(rij)
        # Ook een rij zonder tekst markeren, anders blijft hij elke minuut
        # opnieuw opgehaald worden.
        if payload is not None:
            for ab in abonnementen:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": ab["endpoint"],
                            "keys": {"p256dh": ab["p256dh"], "auth": ab["auth"]},
                        },
                        data=json.dumps(payload),
                        vapid_private_key=prive,
                        vapid_claims={"sub": contact},
                    )
                    verstuurd += 1
                except WebPushException as e:
                    status = getattr(getattr(e, "response", None), "status_code", None)
                    # 404/410: het abonnement bestaat niet meer. Blijven proberen
                    # levert elke minuut dezelfde fout op, dus die rij gaat weg.
                    if status in (404, 410):
                        sb.table("core_push_subscriptions").delete().eq(
                            "endpoint", ab["endpoint"]
                        ).execute()
                        opgeruimd += 1
                    else:
                        print(f"[push] mislukt ({status}): {e}", flush=True)
        sb.table("core_notifications").update({"pushed_at": nu.isoformat()}).eq(
            "id", rij["id"]
        ).execute()

    return {"verstuurd": verstuurd, "opgeruimd": opgeruimd}
