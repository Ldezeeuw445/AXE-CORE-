"""Acceptatie per taaktype, met een meting vóór en ná (sprint 3, 24 nov).

Tot nu toe was "klaar" een bewijscommando dat de agent zelf koos. Dat bewijst
dat er iets bestaat, niet dat het probleem weg is. Een feed-reparatie kon
"klaar" zijn terwijl de feed nog steeds niet ververste.

Bij het maken van een managertaak:
  - soort(opdracht): code / feed / sleutel / onderzoek / overig
  - criteria(soort): wat "af" betekent, in gewone zinnen (gaat mee in het doel)
  - voor: een echte meting van de toestand nu (feeds: last_sync_at + last_error)
Bij finish:
  - na: dezelfde meting opnieuw; voor een feed moet hij nieuwer zijn dan "voor"
    en zonder fout. Niet gehaald = geen klaar, met de reden en de cijfers erbij.

Code-taken hebben hun harde regel al in de oplevering (tests die echt draaiden,
alles gecommit); de andere soorten hebben (nog) geen meetbaar criterium en
krijgen alleen hun criteria als richtlijn, zonder blokkade.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

SOORTEN = ("code", "feed", "sleutel", "onderzoek", "overig")

_CODE = re.compile(r"\b[\w./-]+\.(py|ts|tsx|js|mjs|rs|sql)\b|\btest(s|en)?\b|\bcommit|\bbranch\b|\bbug\b|"
                   r"\bcode\b|claude_code|codex|refactor", re.I)
_FEED = re.compile(r"\bfeeds?\b|\bververs|\bsync\b|intel[- ]?(proxy|feed|bron)|\bmarkt(feed|data)\b", re.I)
_SLEUTEL = re.compile(r"\bsleutel|\bapi[ _-]?key|\btoken\b|\bkey\b|\bcredential|\binlog", re.I)
_ONDERZOEK = re.compile(r"\bzoek uit\b|\bonderzoek|\bwaarom\b|\banalyse|\brapport|\bvergelijk", re.I)

CRITERIA = {
    "code": ["Er is een test die het nieuwe gedrag bewijst, en die test is echt gedraaid en groen.",
             "Alles is gecommit op een eigen branch; niets gemerged of gedeployed."],
    "feed": ["De feed ververst weer: last_sync_at is na het werk nieuwer dan bij de start.",
             "De feed heeft daarna geen last_error meer."],
    "sleutel": ["De meting die faalde slaagt nu, of Luka krijgt precies de stap die alleen hij kan doen "
                "(welke sleutel, waar)."],
    "onderzoek": ["Het antwoord noemt de oorzaak plus de bron waar dat staat (log, tabel, bestand, regel)."],
    "overig": ["Het gevraagde resultaat is aantoonbaar: het bewijscommando laat het zelf zien."],
}


def soort(opdracht: str) -> str:
    t = opdracht or ""
    if _FEED.search(t) and not re.search(r"\.(py|ts|tsx)\b", t):
        return "feed"
    if _CODE.search(t):
        return "code"
    if _SLEUTEL.search(t):
        return "sleutel"
    if _ONDERZOEK.search(t):
        return "onderzoek"
    return "overig"


def _tijd(v: Any) -> datetime | None:
    try:
        t = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def feeds_in(opdracht: str, bekende: list[str]) -> list[str]:
    """Welke bekende feed-ids de opdracht noemt ('corporateJets', 'corporate jets', 'corporate-jets')."""
    tekst = _norm(opdracht)
    return [f for f in bekende if f and len(_norm(f)) >= 4 and _norm(f) in tekst]


def meet_feeds(db: Any, ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
    rijen = (db.table("intel_sync_log").select("feed_id,last_sync_at,last_error").limit(300).execute().data) or []
    uit = {}
    for r in rijen:
        fid = str(r.get("feed_id") or "")
        if fid and (ids is None or fid in ids):
            uit[fid] = {"last_sync_at": r.get("last_sync_at"), "last_error": str(r.get("last_error") or "")[:200]}
    return uit


def maak(db: Any, opdracht: str) -> dict[str, Any]:
    """Acceptatie voor een nieuwe taak: soort, criteria, en voor feeds de meting vooraf."""
    s = soort(opdracht)
    acc: dict[str, Any] = {"soort": s, "criteria": list(CRITERIA[s])}
    if s == "feed" and db is not None:
        try:
            alle = meet_feeds(db)
            ids = feeds_in(opdracht, list(alle))
            if ids:
                acc["feeds"] = ids
                acc["voor"] = {f: alle[f] for f in ids}
            else:
                # Geen feed bij naam: dan valt er niets hard te meten; criteria blijven richtlijn.
                acc["criteria"].append("Noem in je antwoord welke feed (feed_id) het was.")
        except Exception as e:  # noqa: BLE001
            acc["meting_fout"] = str(e)[:160]
    return acc


def doel_tekst(acc: dict[str, Any] | None) -> str:
    """Wat er onder de opdracht komt te staan, zodat de agent weet waar 'af' op getoetst wordt."""
    if not acc:
        return ""
    regels = [f"- {c}" for c in acc.get("criteria") or []]
    for f, v in (acc.get("voor") or {}).items():
        regels.append(f"- Gemeten bij de start: feed {f} laatst ververst {v.get('last_sync_at') or 'nooit'}"
                      + (f", fout: {v['last_error']}" if v.get("last_error") else ", geen fout") + ".")
    return ("ACCEPTATIE (" + str(acc.get("soort")) + "; wordt bij 'klaar' opnieuw gemeten):\n" + "\n".join(regels))


def oordeel(acc: dict[str, Any] | None, na: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """Puur: voor + na -> gehaald of niet, met één leesbare regel. None = niets hards te toetsen."""
    if not acc or acc.get("soort") != "feed" or not acc.get("voor"):
        return None
    regels, gehaald = [], True
    for f, v in acc["voor"].items():
        n = na.get(f) or {}
        t_voor, t_na = _tijd(v.get("last_sync_at")), _tijd(n.get("last_sync_at"))
        vers = bool(t_na and (t_voor is None or t_na > t_voor))
        fout = str(n.get("last_error") or "").strip()
        ok = vers and not fout
        gehaald = gehaald and ok
        regels.append(f"feed {f}: voor {v.get('last_sync_at') or 'nooit'}"
                      f"{' (fout: ' + v['last_error'][:80] + ')' if v.get('last_error') else ''}"
                      f" -> na {n.get('last_sync_at') or 'nooit'}{' (fout: ' + fout[:80] + ')' if fout else ''}"
                      f" = {'gehaald' if ok else 'NIET gehaald'}")
    return {"soort": "feed", "gehaald": gehaald, "regel": "; ".join(regels), "na": na}


def na_meting(db: Any, taak: dict[str, Any] | None) -> dict[str, Any] | None:
    acc = ((taak or {}).get("metadata") or {}).get("acceptatie")
    if not acc or acc.get("soort") != "feed" or not acc.get("feeds") or db is None:
        return None
    try:
        return oordeel(acc, meet_feeds(db, acc["feeds"]))
    except Exception:  # noqa: BLE001
        return None  # niet kunnen meten = niet blokkeren; het bewijscommando geldt nog steeds


def weigering(oordeel_: dict[str, Any] | None) -> str | None:
    if not oordeel_ or oordeel_.get("gehaald"):
        return None
    return ("Acceptatie niet gehaald, opnieuw gemeten: " + oordeel_["regel"] + ". Je bent NIET klaar: laat de "
            "feed echt verversen (en zonder fout), of eindig met een samenvatting die eerlijk zegt dat het niet lukte en waarom.")


def na_meting_voor_taak(db: Any, taak_id: str | None) -> dict[str, Any] | None:
    if not taak_id or db is None:
        return None
    try:
        rij = (db.table("core_tasks").select("metadata").eq("id", taak_id).limit(1).execute().data or [None])[0]
    except Exception:  # noqa: BLE001
        return None
    return na_meting(db, rij)
