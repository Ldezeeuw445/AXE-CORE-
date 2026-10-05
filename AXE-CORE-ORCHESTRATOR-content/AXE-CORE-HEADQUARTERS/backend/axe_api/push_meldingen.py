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


# Wat een apparaat met `verberg_inhoud` aan op zijn slotscherm krijgt. Zelfde
# tekst als VERBORGEN_TITEL in src/domain/pushBericht.ts: wijzig je er één, dan
# de ander (test_push_meldingen.py en pushBericht.test.ts bewaken dat samen).
VERBORGEN_TITEL = "AXE has something"


def verborgen(payload: dict[str, str]) -> dict[str, str]:
    """Dezelfde melding zonder inhoud, voor een apparaat dat die niet op een
    vergrendeld scherm wil. Eén vaste tag: een bui verborgen meldingen vervangt
    zichzelf, in plaats van "AXE has something" twintig keer te stapelen. De route
    blijft, want die is pas zichtbaar als je erop tikt en de app al open is."""
    return {"titel": VERBORGEN_TITEL, "body": "", "tag": "axe-melding", "url": payload["url"]}


def _abonnement_uit(rij: dict[str, Any], bron: str) -> dict[str, Any] | None:
    endpoint = (rij.get("endpoint") or "").strip()
    p256dh = (rij.get("p256dh") or "").strip()
    auth = (rij.get("auth") or "").strip()
    if not endpoint or not p256dh or not auth:
        return None
    return {
        "endpoint": endpoint,
        "p256dh": p256dh,
        "auth": auth,
        "verberg_inhoud": rij.get("verberg_inhoud") is True,
        "bron": bron,
    }


def lees_abonnementen(sb) -> list[dict[str, Any]]:
    """Live endpoints uit core_ én de oude push_subscriptions, één keer per URL."""
    gezien: dict[str, dict[str, Any]] = {}
    for tabel in ("core_push_subscriptions", "push_subscriptions"):
        try:
            rijen = sb.table(tabel).select("endpoint,p256dh,auth,verberg_inhoud").execute().data or []
        except Exception:
            try:
                rijen = sb.table(tabel).select("endpoint,p256dh,auth").execute().data or []
            except Exception:
                rijen = []
        for rij in rijen:
            ab = _abonnement_uit(rij, tabel)
            if ab and ab["endpoint"] not in gezien:
                gezien[ab["endpoint"]] = ab
    return list(gezien.values())


def schrap_dood_abonnement(sb, endpoint: str) -> int:
    """Dood endpoint: weg uit beide tabellen, anders blijft de zender hem proberen."""
    n = 0
    for tabel in ("core_push_subscriptions", "push_subscriptions"):
        try:
            sb.table(tabel).delete().eq("endpoint", endpoint).execute()
            n += 1
        except Exception:
            pass
    return n


# Apple (en soortgenoten) weigeren een abonnement dat met een ánder VAPID-paar
# is gemaakt. 404/410 is "dit endpoint is weg"; 400 VapidPkHashMismatch en
# 403 BadJwtToken is "dit endpoint hoort bij een andere sleutel". Allebei
# blijven proberen levert elke minuut dezelfde fout op.
_SLEUTEL_FOUT = (
    "vapidpkhashmismatch",
    "badjwttoken",
    "invalidvapid",
    "vapid public key mismatch",
)


def push_fout_tekst(fout: BaseException) -> str:
    stukken = [str(fout or "")]
    resp = getattr(fout, "response", None)
    if resp is not None:
        stukken.append(str(getattr(resp, "text", "") or ""))
        inhoud = getattr(resp, "content", None)
        if inhoud:
            stukken.append(inhoud.decode("utf-8", "replace") if isinstance(inhoud, (bytes, bytearray)) else str(inhoud))
        try:
            if callable(getattr(resp, "json", None)):
                stukken.append(json.dumps(resp.json()))
        except Exception:
            pass
    return " ".join(s for s in stukken if s)


def is_dood_abonnement(fout: BaseException) -> bool:
    """True als opnieuw sturen zinloos is: weg, of verkeerd VAPID-paar."""
    status = getattr(getattr(fout, "response", None), "status_code", None)
    if status in (404, 410):
        return True
    tekst = push_fout_tekst(fout).lower()
    kaal = tekst.replace("_", "").replace("-", "").replace(" ", "")
    sleutel = any(w.replace(" ", "") in kaal for w in _SLEUTEL_FOUT) or any(w in tekst for w in _SLEUTEL_FOUT)
    if status in (400, 401, 403) and sleutel:
        return True
    # Sommige wrappers zetten de status niet op .response maar wel in de tekst.
    return sleutel and ("vapidpkhashmismatch" in kaal or "badjwttoken" in kaal)


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
    mislukt = 0
    try:
        from pywebpush import WebPushException, webpush
    except Exception as e:  # pragma: no cover - alleen op een box zonder dependency
        print(f"[push] pywebpush ontbreekt: {e}", flush=True)
        return {"verstuurd": 0, "opgeruimd": 0, "mislukt": 0}

    import os

    prive = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    contact = os.environ.get("VAPID_CONTACT", "mailto:admin@axecompanion.com")
    if not prive:
        # Stil blijven zou betekenen dat niemand merkt dat meldingen niet gaan.
        print("[push] VAPID_PRIVATE_KEY niet gezet — er gaat niets uit", flush=True)
        return {"verstuurd": 0, "opgeruimd": 0, "mislukt": 0}

    sb = sb_factory()
    try:
        from goedkeuring_melding import verval_oude_shell_vragen
        verval_oude_shell_vragen(sb, nu)
    except Exception:
        pass
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
        return {"verstuurd": 0, "opgeruimd": 0, "mislukt": 0}

    abonnementen = lees_abonnementen(sb)

    for rij in rijen:
        payload = push_bericht_van(rij)
        geaccepteerd = 0
        # Ook een rij zonder tekst markeren, anders blijft hij elke minuut
        # opnieuw opgehaald worden. De A17 heeft aan een lege tekst niets.
        if payload is None:
            sb.table("core_notifications").update({"pushed_at": nu.isoformat()}).eq(
                "id", rij["id"]
            ).execute()
            continue
        if not abonnementen:
            mislukt += 1
            print(
                f"[push] melding {rij.get('id')} niet verstuurd: geen live abonnement. "
                "pushed_at blijft leeg zodat de A17 de rij nog ziet.",
                flush=True,
            )
            continue
        for ab in list(abonnementen):
            try:
                webpush(
                    subscription_info={
                        "endpoint": ab["endpoint"],
                        "keys": {"p256dh": ab["p256dh"], "auth": ab["auth"]},
                    },
                    # Per apparaat: wat de één op een slotscherm mag zien wil
                    # de ander niet. Niet-True (ook None) = gewoon tonen.
                    data=json.dumps(verborgen(payload) if ab.get("verberg_inhoud") is True else payload),
                    vapid_private_key=prive,
                    vapid_claims={"sub": contact},
                )
                verstuurd += 1
                geaccepteerd += 1
            except WebPushException as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                if is_dood_abonnement(e):
                    schrap_dood_abonnement(sb, ab["endpoint"])
                    abonnementen = [x for x in abonnementen if x["endpoint"] != ab["endpoint"]]
                    opgeruimd += 1
                    print(f"[push] dood abonnement ({status}): {push_fout_tekst(e)}", flush=True)
                else:
                    mislukt += 1
                    print(f"[push] mislukt ({status}): {e}", flush=True)
        if geaccepteerd:
            sb.table("core_notifications").update({"pushed_at": nu.isoformat()}).eq(
                "id", rij["id"]
            ).execute()
        else:
            mislukt += 1
            print(
                f"[push] melding {rij.get('id')} door geen endpoint geaccepteerd. "
                "pushed_at blijft leeg zodat de A17 de rij nog ziet.",
                flush=True,
            )

    return {"verstuurd": verstuurd, "opgeruimd": opgeruimd, "mislukt": mislukt}
