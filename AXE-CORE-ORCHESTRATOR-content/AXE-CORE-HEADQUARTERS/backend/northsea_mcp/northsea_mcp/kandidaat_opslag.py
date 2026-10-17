"""N4 — discovery die blijft: elke kandidaat een rij in sourcing_candidates.

Canon (05, fase N4): search → normalize → dedupe → persist → score → review → qualify.
Nooit: search → vluchtig resultaat → crew-venster → kwijt.

Tot 17 okt stonden kandidaten alleen in `action_queue.metadata` van een
crew_candidate_review. Werd die review geannuleerd of overschreven, dan was er geen
spoor meer dat Mopani of Aurubis ooit voor deze vraag gevonden was, en tellers als
`candidates_found` op een campagne bleven 0. Nu:

- per buyer_requirement één campagne (`find_supplier`): een bestaande die niet
  geannuleerd is, anders een nieuwe. Is er alleen een geannuleerde, dan respecteren
  we dat besluit en slaan we niets op;
- elke kandidaat één rij met status `found`, bron-URL, fit_score en de herkomst
  (review-id, crew-route, specialisten) in `evidence`;
- dedupe per campagne op domein, of op naam als er geen URL is: dezelfde
  leverancier twee keer gevonden is één rij;
- `candidates_found` van de campagne telt mee, zodat discovery meetbaar is.

Wat dit NOOIT doet: een company, contact of outreach aanmaken. `company_id` en
`contact_id` blijven leeg tot een mens kwalificeert. Crew-output is analyse, geen
feit (crew.py); een rij hier zegt "gevonden", niet "geverifieerd".
"""
from __future__ import annotations

from datetime import datetime
from typing import Any
from urllib.parse import urlparse

STATUS_OPEN = ("active", "draft", "paused", "completed")


def domein(url: Any) -> str | None:
    if not isinstance(url, str) or not url.strip():
        return None
    u = url.strip()
    if "://" not in u:
        u = "https://" + u
    host = (urlparse(u).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None


def sleutel(kandidaat: dict) -> str | None:
    """Wat twee vondsten tot dezelfde leverancier maakt."""
    d = domein(kandidaat.get("url") or kandidaat.get("website"))
    if d:
        return "d:" + d
    naam = " ".join(str(kandidaat.get("name") or kandidaat.get("candidate_name") or "").lower().split())
    return "n:" + naam if naam and naam != "unknown" else None


def bestaande_sleutel(rij: dict) -> str | None:
    return sleutel({"url": rij.get("website") or rij.get("source_url"), "name": rij.get("candidate_name")})


def score(waarde: Any) -> int | None:
    try:
        getal = int(round(float(waarde)))
    except (TypeError, ValueError):
        return None
    return max(0, min(100, getal))


def kandidaat_rij(kandidaat: dict, *, campaign_id: str, herkomst: dict) -> dict:
    url = kandidaat.get("url") if isinstance(kandidaat.get("url"), str) else None
    d = domein(url)
    feiten = [f for f in (kandidaat.get("facts") or []) if isinstance(f, dict)]
    onbekend = sorted({str(f.get("field")) for f in feiten if str(f.get("level") or "").upper() == "UNKNOWN" and f.get("field")})
    return {
        "campaign_id": campaign_id,
        "candidate_name": str(kandidaat.get("name") or d or "UNKNOWN")[:300],
        "website": f"https://{d}" if d else None,
        "source_url": url,
        "source_type": "crew_discovery" if kandidaat.get("ranked", True) is not False else str(kandidaat.get("source") or "web_hit"),
        "fit_score": score(kandidaat.get("fit_score")),
        "status": "found",
        "fit_reasons": [f for f in feiten if str(f.get("level") or "").upper() != "UNKNOWN"][:20],
        "gaps": onbekend[:20],
        "evidence": {
            **herkomst,
            "role": kandidaat.get("role"),
            "priority": kandidaat.get("priority"),
            "page_status": kandidaat.get("page_status"),
            "email": kandidaat.get("email"),
            "phone": kandidaat.get("phone"),
        },
    }


async def zorg_voor_campagne(repo: Any, requirement: dict, now: datetime) -> tuple[dict | None, str | None]:
    """(campagne, None) of (None, reden). Maakt er een aan als er nog geen is."""
    campagnes = await repo.list_campaigns_for_requirement(requirement["id"])
    open_ = [c for c in campagnes if c.get("status") in STATUS_OPEN]
    if open_:
        actief = [c for c in open_ if c.get("status") == "active"]
        return (actief or open_)[0], None
    if campagnes:
        return None, "the sourcing campaign for this requirement was cancelled"
    geografie = requirement.get("origin_preference")
    rijen = await repo.discovery_insert("sourcing_campaigns", {
        "buyer_requirement_id": requirement["id"],
        "direction": "find_supplier",
        "commodity": str(requirement.get("commodity") or requirement.get("product") or "unknown")[:200],
        "product": requirement.get("product"),
        "search_geographies": [str(geografie)] if isinstance(geografie, str) and geografie.strip() else [],
        "status": "active",
        "next_action": "review discovered candidates",
        "next_action_at": now.isoformat(),
    })
    return (rijen[0] if rijen else None), (None if rijen else "campaign insert returned nothing")


async def bewaar_kandidaten(repo: Any, *, requirement: dict, kandidaten: list[dict], herkomst: dict,
                            now: datetime) -> dict:
    """Leg de kandidaten van één review vast. Gooit RepositoryError door; de aanroeper
    beslist of dat de review raakt (nee: zie discovery.crew_assisted_review)."""
    campagne, reden = await zorg_voor_campagne(repo, requirement, now)
    if campagne is None:
        return {"persisted": 0, "duplicates": 0, "campaign_id": None, "reason": reden}
    bestaand = await repo.list_campaign_candidates(campagne["id"])
    gezien = {k for k in (bestaande_sleutel(r) for r in bestaand) if k}
    nieuw, dubbel = 0, 0
    for k in kandidaten:
        if not isinstance(k, dict):
            continue
        s = sleutel(k)
        if s is None or s in gezien:
            dubbel += 1
            continue
        gezien.add(s)
        await repo.discovery_insert("sourcing_candidates", kandidaat_rij(k, campaign_id=campagne["id"], herkomst=herkomst))
        nieuw += 1
    if nieuw:
        await repo.discovery_patch_campaign(campagne["id"], {
            "candidates_found": len(bestaand) + nieuw,
            "next_action": "review discovered candidates",
            "next_action_at": now.isoformat(),
            "updated_at": now.isoformat(),
        })
    return {"persisted": nieuw, "duplicates": dubbel, "campaign_id": campagne["id"],
            "campaign_total": len(bestaand) + nieuw}
