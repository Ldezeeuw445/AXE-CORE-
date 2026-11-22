"""De manager-lus als betrouwbaar systeem, niet als slimme prompt (audit 22 nov).

Het model mag plannen en redeneren. Wat het NIET bepaalt:
  * of een taak dubbel wordt          -> idem-sleutel per opdracht
  * of hetzelfde probleem steeds weer -> vingerafdruk, max 2 pogingen, 24 u afkoelen
  * of half-geldige uitvoer een actie wordt -> strikte JSON, één herstelpoging
  * of twee rondes elkaar overlappen  -> één ronde tegelijk (lock in manager_werk)
  * of het zichtbaar is wat er misgaat -> tellers + GET /managers/gezondheid
  * of een fout een les wordt         -> ervaring per manager, terug in zijn context

Puur waar het kan; de I/O staat in manager_werk / taak_verslag / manager_context.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Any

MAX_POGINGEN = 2
AFKOELEN = timedelta(hours=24)
TERUGKIJKEN = timedelta(days=7)
OPEN = {"pending", "queued", "planning", "running", "in_progress", "verifying", "retrying", "waiting_approval", "claimed"}
MISLUKT = {"failed", "error", "blocked", "rejected"}
KLAAR = {"completed", "done"}
ERVARING = "ervaring"   # core_manager_messages.to_agent voor lessen uit taken (Luka's eigen lessen: "lessen")

_STOP = set("""de het een en of van in op te voor met aan bij uit als dat die dit is zijn wordt worden om naar
door over nog niet geen ook maar dan wat waarom hoe zoek zoeken uit repareer repareren controleer
controleren onderzoek onderzoeken kijk fix check the a an and or of to in on for with why how find
investigate repair waarom sinds nu weer alle elke jouw je mijn""".split())


def _woorden(tekst: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9][a-z0-9_.-]{2,}", (tekst or "").lower()) if w not in _STOP]


def vingerafdruk(agent: str, opdracht: str) -> str:
    """Hetzelfde probleem in andere woorden -> dezelfde afdruk (de 6 zwaarste woorden, gesorteerd)."""
    w = _woorden(opdracht)
    gezien: list[str] = []
    for x in sorted(w, key=lambda s: (-len(s), s)):
        if x not in gezien:
            gezien.append(x)
    kern = sorted(gezien[:6])
    return f"{agent}:" + ("-".join(kern) if kern else hashlib.sha1((opdracht or '').encode()).hexdigest()[:10])


def idem_sleutel(agent: str, bron_id: Any, opdracht: str) -> str:
    norm = " ".join((opdracht or "").lower().split())
    return f"{agent}:{bron_id or 'ronde'}:{hashlib.sha1(norm.encode()).hexdigest()[:12]}"


def beslis(bestaand: list[dict[str, Any]], idem: str, vinger: str, nu: datetime) -> tuple[str, dict[str, Any] | None]:
    """Mag er een nieuwe taak komen?

    'maak' | 'dubbel' (zelfde opdracht al gemaakt) | 'loopt' (zelfde probleem staat open)
    | 'geblokkeerd' (al MAX_POGINGEN keer mislukt) | 'afkoelen' (net opgelost)."""
    def meta(t: dict[str, Any]) -> dict[str, Any]:
        m = t.get("metadata")
        return m if isinstance(m, dict) else {}

    def tijd(t: dict[str, Any]) -> datetime | None:
        for k in ("completed_at", "created_at"):
            try:
                return datetime.fromisoformat(str(t.get(k)).replace("Z", "+00:00"))
            except (TypeError, ValueError):
                continue
        return None

    for t in bestaand:
        if meta(t).get("idem") == idem:
            return "dubbel", t
    zelfde = [t for t in bestaand if meta(t).get("vinger") == vinger]
    # Luka gaf het probleem weer vrij: hij zette de stap "... loopt vast" op Done. Mislukkingen
    # van daarvoor tellen niet meer (anders bleef het voor altijd geblokkeerd).
    vrij = [tijd(t) for t in bestaand
            if str(t.get("capability")) == "stap" and str(t.get("status")) in KLAAR
            and (meta(t).get("vinger") == vinger or vinger in str(t.get("goal") or ""))]
    vrij_sinds = max([v for v in vrij if v], default=None)
    if vrij_sinds:
        zelfde = [t for t in zelfde if (tt := tijd(t)) is None or tt > vrij_sinds
                  or str(t.get("status")) in OPEN]
    for t in zelfde:
        if str(t.get("status")) in OPEN:
            return "loopt", t
    mislukt = [t for t in zelfde if str(t.get("status")) in MISLUKT]
    if len(mislukt) >= MAX_POGINGEN:
        return "geblokkeerd", mislukt[0]
    for t in zelfde:
        if str(t.get("status")) in KLAAR and (tt := tijd(t)) and nu - tt < AFKOELEN and not _vals_klaar(t):
            return "afkoelen", t
    return "maak", None


def _vals_klaar(t: dict[str, Any]) -> bool:
    """'completed' terwijl de eigen samenvatting zegt dat het niet lukte (van vóór klaar_regels)."""
    r = t.get("result")
    if not isinstance(r, dict):
        return False
    import klaar_regels
    return klaar_regels.geeft_falen_toe(str(r.get("summary") or ""))


def poging(bestaand: list[dict[str, Any]], vinger: str) -> int:
    return 1 + sum(1 for t in bestaand
                   if isinstance(t.get("metadata"), dict) and t["metadata"].get("vinger") == vinger
                   and str(t.get("status")) in MISLUKT)


# ── strikte model-uitvoer ───────────────────────────────────────────────────

HERSTEL_VRAAG = ("Je vorige antwoord was geen geldige JSON. Geef UITSLUITEND één JSON-object, zonder uitleg "
                 "of codeblok, precies volgens het schema: {\"antwoord\": string, \"taken\": [string], "
                 "\"overleg\": [{\"met\": string, \"vraag\": string}]}.")


def lees_model_json(tekst: str) -> dict[str, Any] | None:
    """Eén geldig object volgens het schema, of None. Nooit een half-geldig antwoord."""
    t = (tekst or "").strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.I)
    dec = json.JSONDecoder()
    for i, ch in enumerate(t):
        if ch != "{":
            continue
        try:
            d, _ = dec.raw_decode(t[i:])
        except ValueError:
            continue
        if geldig(d):
            return d
    return None


def geldig(d: Any) -> bool:
    if not isinstance(d, dict) or not isinstance(d.get("antwoord", ""), str):
        return False
    if not ({"antwoord", "taken", "overleg"} & d.keys()):
        return False
    taken = d.get("taken", [])
    if not isinstance(taken, list) or not all(isinstance(x, str) for x in taken):
        return False
    overleg = d.get("overleg", [])
    if not isinstance(overleg, list) or not all(isinstance(o, dict) for o in overleg):
        return False
    return True


# ── tellers (in het proces; GET /managers/gezondheid) ───────────────────────

TELLERS: dict[str, dict[str, Any]] = {}


def tel(agent: str, wat: str, n: int = 1) -> None:
    t = TELLERS.setdefault(agent, {})
    t[wat] = int(t.get(wat) or 0) + n


def zet(agent: str, wat: str, waarde: Any) -> None:
    TELLERS.setdefault(agent, {})[wat] = waarde


REM = "rem"                 # core_manager_messages.to_agent
REM_AGENT = "managerwerk"   # from_agent: niet de manager zelf, anders telt het als zijn eigen bericht


def rem_rij(agent: str, wat: str, detail: str = "") -> dict[str, Any]:
    """Een rem of fout van de lus als rij -- de API draait met 2 workers, dus tellen in het
    geheugen van één proces klopt niet; de database telt voor allebei.

    Niet in core_agent_events: dat is een VIEW (union van taak- en missie-events),
    inserts daarin falen altijd (gemeten 22 nov)."""
    return {"from_agent": REM_AGENT, "to_agent": REM, "kind": "report",
            "body": f"{agent}|{wat}|{' '.join(str(detail).split())}"[:300]}


def tel_rems(events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    uit: dict[str, dict[str, Any]] = {}
    for e in sorted(events, key=lambda e: str(e.get("created_at") or "")):
        delen = str(e.get("body") or e.get("message") or "").split("|", 2)
        if len(delen) < 2:
            continue
        agent, wat = delen[0], delen[1]
        t = uit.setdefault(agent, {})
        t[wat] = int(t.get(wat) or 0) + 1
        if wat == "model_fout":
            t["laatste_fout"] = f"{str(e.get('created_at'))[:16]} {delen[2] if len(delen) > 2 else ''}"[:200]
    return uit


def gezondheid(managers: tuple[str, ...], taken: list[dict[str, Any]], nu: datetime,
               laatste_run: datetime | None, ronde_loopt_sinds: datetime | None,
               rems: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    """Per manager wat er gebeurt + alarmen. `taken` = core_tasks van de managers, laatste 24 u;
    `rems` = tel_rems(events van de laatste 24 u); zonder rems de tellers van dit proces."""
    per: dict[str, Any] = {}
    alarmen: list[str] = []
    for m in managers:
        eigen = [t for t in taken if t.get("requested_by") == m]
        klaar = sum(1 for t in eigen if t.get("status") in KLAAR)
        mis = sum(1 for t in eigen if t.get("status") in MISLUKT)
        afgerond = klaar + mis
        tel_ = (rems if rems is not None else TELLERS).get(m, {})
        per[m] = {
            "taken_24u": len(eigen),
            "open": sum(1 for t in eigen if t.get("status") in OPEN),
            "wacht_op_ok": sum(1 for t in eigen if t.get("status") == "waiting_approval"),
            "succes_24u": round(klaar / afgerond, 2) if afgerond else None,
            "dubbel_tegengehouden": int(tel_.get("dubbel", 0)) + int(tel_.get("loopt", 0)),
            "afgekoeld": int(tel_.get("afkoelen", 0)),
            "geblokkeerd": int(tel_.get("geblokkeerd", 0)),
            "ongeldige_json": int(tel_.get("ongeldige_json", 0)),
            "json_hersteld": int(tel_.get("json_hersteld", 0)),
            "model_fouten": int(tel_.get("model_fout", 0)),
            "laatste_fout": tel_.get("laatste_fout"),
        }
        if tel_.get("geblokkeerd"):
            alarmen.append(f"{m}: een probleem mislukte {MAX_POGINGEN}x -- staat bij Luka (Your turn)")
        if int(tel_.get("ongeldige_json", 0)) >= 3:
            alarmen.append(f"{m}: model gaf {tel_['ongeldige_json']}x onbruikbare uitvoer")
    if laatste_run is None or nu - laatste_run > timedelta(minutes=10):
        alarmen.append("de managerlus draaide de laatste 10 minuten niet (sinds herstart of gestopt)")
    if ronde_loopt_sinds and nu - ronde_loopt_sinds > timedelta(minutes=10):
        alarmen.append("een ronde loopt al langer dan 10 minuten (vastgelopen model?)")
    return {"managers": per, "alarmen": alarmen,
            "laatste_run": laatste_run.isoformat() if laatste_run else None, "ok": not alarmen}


# ── ervaring: elke afgeronde managertaak een les ────────────────────────────

def ervaring_les(taak: dict[str, Any], status: str, v: dict[str, str]) -> str | None:
    """Eén les uit een taakverslag, of None als er niets te leren valt."""
    titel = " ".join(str(taak.get("title") or "").split(": ", 1)[-1].split())[:100]
    app = ""
    m = taak.get("metadata")
    if isinstance(m, dict):
        app = str(m.get("app_naam") or m.get("app") or "")
    if status in KLAAR:
        if not v.get("werkte"):
            return None
        return (f"# Werkte: {titel}.\nHoe: {v['werkte']}" + (f"\nBesluit: {v['besluit']}" if v.get("besluit") else "")
                + (f"\nToepassen op: {app}" if app else ""))
    if not v.get("faalde"):
        return None
    return (f"# Mislukt: {titel}.\nWaarom: {v['faalde']}"
            + (f"\nVolgende keer: {v['volgende']}" if v.get("volgende") else "")
            + (f"\nToepassen op: {app}" if app else ""))


__all__ = ["rem_rij", "tel_rems", "REM", "REM_AGENT", "vingerafdruk", "idem_sleutel", "beslis", "poging", "lees_model_json", "geldig", "HERSTEL_VRAAG",
           "tel", "zet", "gezondheid", "ervaring_les", "ERVARING", "TELLERS"]
