"""Een goedgekeurd concept versturen — het enige schrijfpad van de desk.

## Waarom dit apart staat van northsea.py

`northsea.py` leest, en leest via een verbinding die op `read_only=true` staat.
Dat is met opzet: een tabblad dat per ongeluk schrijft is het soort fout dat je
pas ziet als er een mail uit is. Versturen is daarom een eigen bestand, een
eigen route en een eigen sleutel.

## Wat dit NIET doet

Niets goedkeuren. De edge function `send-approved-reply` eist een concept dat
al `approved` is MET menselijke herkomst (wie, via welk kanaal), en de database
weigert alles daaronder. Deze module stuurt dus alleen "verstuur nummer X" en
geeft het antwoord onveranderd terug -- ook de weigering.

## Waarom de weigering letterlijk doorgaat

`human_approval_provenance_missing`, `contact_policy_blocked` en
`draft_not_approved` vragen om drie verschillende handelingen. Eén nette zin
("versturen mislukt") verbergt precies welke van de drie je hebt.
"""
from __future__ import annotations

import os
from typing import Any

import httpx

SLEUTEL_BESTAND = os.path.expanduser(os.environ.get("AXE_MCP_SLEUTELS", "~/.axe/mcp-sleutels.env"))

# De naam waaronder de scoped sleutel voor dit endpoint staat. Bewust NIET de
# service-role van het NorthSea-project: die hoort niet op deze Mac te liggen.
SLEUTEL_NAAM = "NORTHSEA_SEND_SERVICE_KEY"
URL_NAAM = "NORTHSEA_SEND_URL"

TIMEOUT_S = 30


class VerstuurNietKlaar(RuntimeError):
    """De Mac kan niet versturen: er ontbreekt een URL of een sleutel."""


def _uit_bestand(naam: str) -> str:
    try:
        with open(SLEUTEL_BESTAND, encoding="utf-8") as f:
            for regel in f:
                regel = regel.strip()
                if not regel or regel.startswith("#") or "=" not in regel:
                    continue
                k, _, v = regel.partition("=")
                if k.strip().removeprefix("export ").strip() == naam:
                    return v.strip().strip('"').strip("'")
    except OSError:
        pass
    return ""


def instelling(naam: str) -> str:
    """Eerst de omgeving, dan het sleutelbestand dat de MCP-hub ook gebruikt."""
    return (os.environ.get(naam) or _uit_bestand(naam)).strip()


def gereed() -> tuple[bool, str]:
    """Kan deze Mac versturen? Zo niet: welke naam ontbreekt."""
    ontbreekt = [n for n in (URL_NAAM, SLEUTEL_NAAM) if not instelling(n)]
    if ontbreekt:
        return False, "ontbreekt: " + ", ".join(ontbreekt)
    return True, "klaar"


async def verstuur(draft_id: str, gevraagd_door: str) -> tuple[int, dict[str, Any]]:
    """Vraag de edge function dit concept te versturen.

    Geeft (status, antwoord) terug zoals de functie ze gaf. Alleen als de Mac
    zelf niet kan vragen -- geen URL of geen sleutel -- gooit hij.
    """
    url, sleutel = instelling(URL_NAAM), instelling(SLEUTEL_NAAM)
    if not url or not sleutel:
        raise VerstuurNietKlaar(gereed()[1])

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as client:
        r = await client.post(
            url,
            headers={"authorization": f"Bearer {sleutel}", "content-type": "application/json"},
            json={"draft_id": draft_id, "requested_by": gevraagd_door[:120]},
        )
    try:
        body = r.json()
    except ValueError:
        body = {"ok": False, "error": "geen_json_antwoord", "detail": r.text[:400]}
    return r.status_code, body
