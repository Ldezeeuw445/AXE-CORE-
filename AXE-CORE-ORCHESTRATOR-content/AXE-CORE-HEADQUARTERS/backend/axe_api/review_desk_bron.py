"""
review_desk_bron.py — de eigen bronworker van Website Review Desk.

## Waarom dit bestaat

Het privérapport `axe_website_review_desk_v1` werd bijgehouden door een externe uurcontrole (een ChatGPT-
automatisering met eigen Gmail-, Sites-, Stripe- en Metricool-koppelingen). De AXE-backend had geen eigen
toegang tot die vier bronnen: "geen native API-authenticatie", stond in de sectie "Native aansluiting —
concrete blokkade". Dit is de native worker die dat overneemt, op de bestaande scheduler (core_schedules,
action_type "review_desk") en met CAS-opslag op dezelfde rapportrij.

## Wat hij doet, per run

1. Leest per bron wat er NIEUW is, begrensd (pagina's, aantallen) en met een cursor.
2. Ontdubbelt: een bericht, aanvraag, betaling of post telt één keer, ook als twee uitvoerders hem zien. Een
   betaling telt op het payment_intent-id, zodat een checkout en een factuur voor dezelfde betaling niet dubbel
   tellen.
3. Verwerkt de promotie-uitkomsten binnen de vastgelegde limieten: maximaal TWEE eerste voorstellen per
   Amsterdamse kalenderdag over ALLE uitvoerders, TWINTIG in totaal, nooit buiten 08:00–20:00, geen herinneringen
   bij stilte, nooit opnieuw benaderen wie zich afmeldde of bounceste.
4. Werkt het rapport bij met een voorwaarde op de eerder gelezen `updated_at`, alleen voor bronnen die ook echt
   gelezen zijn. Bij een bronfout geen nul invullen en geen datum verversen: de fout wordt genoteerd bij de
   eigen kanaalregel, de oude waarneming blijft staan.

## Wat hij bewust NIET doet

- Geen enkele AI-aanroep voor een lege controle. Alleen een nieuwe inkomende reactie kan een concept vragen,
  uitsluitend bij gratis aanbieders (Groq, Ollama), en alleen als REVIEW_DESK_CONCEPTEN=1.
- Geen e-mail versturen. Er is in dit bestand geen verzendfunctie: antwoorden zijn concepten.
- Geen sociale publicatie. Alleen lezen en ontdubbelen; `mag_publiceren` is de poort voor wie ooit publiceert.
- Geen "overname" claimen: `overname_status` telt alleen geslaagde GEPLANDE runs waarin élke bron gelezen is.

## Sleutels

Namen staan in VEREIST. Ze komen uit de omgeving, en anders uit de kluis (`secrets.env`, alleen die namen,
nooit gelogd). `STRIPE_SECRET_KEY` uit de kluis wordt bewust NIET gebruikt: op 10 okt bleek die een Supabase-
sleutel (`sb_secret…`) te bevatten die Stripe weigert. De worker wil een beperkte leessleutel (`rk_…`) onder
REVIEW_DESK_STRIPE_KEY.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import logging
import math
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

import httpx

log = logging.getLogger("axe_core_api.review_desk_bron")

AMS = ZoneInfo("Europe/Amsterdam")
RAPPORT_SLEUTEL = "axe_website_review_desk_v1"
STAAT_SLEUTEL = "axe_review_desk_state_v1"
KANAAL_NAAM = "AXE Core source worker"
WORKER_PREFIX = "[bronworker] "

# ── De vastgelegde limieten ─────────────────────────────────────────────────────────────────────────────
VENSTER_VAN_UUR = 8
VENSTER_TOT_UUR = 20
MAX_PER_DAG = 2
MAX_TOTAAL = 20

# ── Begrenzing van het lezen ────────────────────────────────────────────────────────────────────────────
PAGINA_GROOTTE = 100
MAX_PAGINAS = 5
BACKFILL_DAGEN = 60
GEZIEN_MAX = 3000
RUNS_BEWAAR = 60
ASOF_VERVERS_UREN = 6

BRONNEN = ("gmail", "stripe", "sites", "metricool")

VEREIST: dict[str, tuple[str, ...]] = {
    "gmail": ("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "REVIEW_DESK_GMAIL_REFRESH_TOKEN"),
    "stripe": ("REVIEW_DESK_STRIPE_KEY",),
    "sites": ("REVIEW_DESK_SITES_URL", "REVIEW_DESK_SITES_TOKEN"),
    "metricool": ("METRICOOL_USER_TOKEN", "METRICOOL_USER_ID"),
}
STANDAARD_WAARDEN = {"METRICOOL_BLOG_ID": "7244586"}
EXTRA_NAMEN = ("METRICOOL_BLOG_ID", "REVIEW_DESK_EIGEN_ADRESSEN", "REVIEW_DESK_UITGEZONDERD")
TOEGESTANE_NAMEN = tuple(sorted({n for ns in VEREIST.values() for n in ns} | set(EXTRA_NAMEN)))

# Wat Luka zelf moet afronden, per bron: letterlijk, zodat het in het rapport en in het antwoord klopt.
AUTORISATIE: dict[str, str] = {
    "gmail": (
        "Gmail: eenmalig toestemming geven voor support@axeheadquarters.com (scopes gmail.readonly en gmail.compose) "
        "door `python3 scripts/review-desk-gmail-auth.py` op de Mac te draaien en in de browser op Toestaan te klikken. "
        "De OAuth-client staat al in de kluis; alleen het refresh-token ontbreekt (REVIEW_DESK_GMAIL_REFRESH_TOKEN)."
    ),
    "stripe": (
        "Stripe: een beperkte leessleutel (rk_live_…) aanmaken in het Stripe-account met de Review Desk-betaallinks, "
        "met alleen Lezen op Checkout Sessions, PaymentIntents, Charges en Refunds, en als REVIEW_DESK_STRIPE_KEY in de kluis zetten. "
        "STRIPE_SECRET_KEY in de kluis is een Supabase-sleutel en werkt niet bij Stripe."
    ),
    "sites": (
        "Sites: de ChatGPT-site (axe-website-review) heeft geen leesinterface voor de eigenaar die de backend kan aanroepen "
        "(het privédashboard antwoordt 401, /api/inquiries is alleen POST). Nodig: een met een bearer-token beveiligd "
        "GET-eindpunt per verzameling (inquiries, payment_events) met offset-paginering, en dan REVIEW_DESK_SITES_URL en "
        "REVIEW_DESK_SITES_TOKEN in de kluis."
    ),
    "metricool": (
        "Metricool: het API-token van het account (Metricool → Instellingen → API; vereist een Advanced-abonnement) en het userId, "
        "als METRICOOL_USER_TOKEN en METRICOOL_USER_ID in de kluis. De merk-id 7244586 is al bekend."
    ),
}


class BronFout(Exception):
    """Een bron kon niet gelezen worden. `soort`: autorisatie | fout | onvolledig."""

    def __init__(self, bron: str, soort: str, bericht: str):
        super().__init__(f"{bron}: {bericht}")
        self.bron, self.soort, self.bericht = bron, soort, bericht


# ═══ Sleutels ═══════════════════════════════════════════════════════════════════════════════════════════

def _lees_kluis(pad: str) -> dict[str, str]:
    uit: dict[str, str] = {}
    try:
        with open(pad, encoding="utf-8") as f:
            for regel in f:
                m = re.match(r"^([A-Z0-9_]+)=(.*)$", regel.strip())
                if m and m.group(1) in TOEGESTANE_NAMEN:
                    uit[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    except OSError:
        pass
    return uit


def laad_sleutels(env: Optional[dict] = None, kluis_pad: Optional[str] = None) -> dict[str, str]:
    """Omgeving eerst, dan de kluis; alleen de namen in TOEGESTANE_NAMEN, lege waarden tellen niet."""
    env = os.environ if env is None else env
    pad = kluis_pad if kluis_pad is not None else os.environ.get("AXE_VAULT_ENV", "/Volumes/EagetSSD/AXE-VAULT/secrets.env")
    kluis = _lees_kluis(pad) if pad else {}
    uit: dict[str, str] = {}
    for naam in TOEGESTANE_NAMEN:
        waarde = (env.get(naam) or kluis.get(naam) or STANDAARD_WAARDEN.get(naam) or "").strip()
        if waarde:
            uit[naam] = waarde
    return uit


def stripe_sleutel_geldig(sleutel: str) -> tuple[bool, str]:
    """Een Stripe-sleutel heeft een bekende voorvoegsel; een beperkte leessleutel is wat we willen."""
    if not re.match(r"^(rk|sk)_(live|test)_", sleutel or ""):
        return False, "geen Stripe-sleutel (verwacht rk_live_… of rk_test_…)"
    if sleutel.startswith("sk_"):
        return False, "een volledige geheime sleutel (sk_…) is te ruim voor een leesworker; maak een beperkte rk_-sleutel"
    return True, ""


def ontbrekende_autorisatie(sleutels: dict[str, str]) -> dict[str, list[str]]:
    """Per bron de namen die ontbreken; een bron die er niet in staat is volledig aangesloten."""
    uit: dict[str, list[str]] = {}
    for bron, namen in VEREIST.items():
        weg = [n for n in namen if not sleutels.get(n)]
        if bron == "stripe" and not weg:
            ok, reden = stripe_sleutel_geldig(sleutels["REVIEW_DESK_STRIPE_KEY"])
            if not ok:
                weg = [f"REVIEW_DESK_STRIPE_KEY ({reden})"]
        if bron == "sites" and not weg and not sleutels["REVIEW_DESK_SITES_URL"].startswith("https://"):
            weg = ["REVIEW_DESK_SITES_URL (moet https zijn)"]
        if weg:
            uit[bron] = weg
    return uit


# ═══ Tijd en limieten (puur) ═══════════════════════════════════════════════════════════════════════════

def iso(dt: datetime) -> str:
    """ISO 8601 met tijdzone, zoals het rapportschema het wil."""
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.astimezone(timezone.utc).microsecond // 1000:03d}Z"


def parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def amsterdam_dag(dt: datetime) -> str:
    return dt.astimezone(AMS).strftime("%Y-%m-%d")


def in_acquisitievenster(nu: datetime) -> bool:
    uur = nu.astimezone(AMS).hour
    return VENSTER_VAN_UUR <= uur < VENSTER_TOT_UUR


def lege_staat() -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "proposals": [],          # {domain, thread, at|None, bron}
        "onderdrukt": {},         # domein -> {reden, at}
        "gezien": {b: [] for b in BRONNEN},
        "cursors": {},
        "tellers": {"inquiries": 0, "betalingen": 0, "posts": 0, "views": 0, "bevestigde_betalingen": []},
        "posts": {},              # uuid -> inhoudshash
        "runs": [],
    }


def acquisitie_ruimte(staat: dict, nu: datetime) -> dict[str, Any]:
    """Hoeveel NIEUWE eerste voorstellen mogen nu nog, over alle uitvoerders heen.

    Faalt dicht: staat er een voorstel in zonder bekende verzenddatum (alleen uit het rapport overgenomen),
    dan is de dagtelling onzeker en is de ruimte nul tot Gmail de echte datum leest.
    """
    voorstellen = staat.get("proposals") or []
    totaal = len(voorstellen)
    vandaag = amsterdam_dag(nu)
    onbekend = [v for v in voorstellen if not v.get("at")]
    vandaag_n = sum(1 for v in voorstellen if v.get("at") and amsterdam_dag(parse_iso(v["at"]) or nu) == vandaag)
    basis = {"vandaag": vandaag_n, "per_dag": MAX_PER_DAG, "totaal": totaal, "max_totaal": MAX_TOTAAL}
    if not in_acquisitievenster(nu):
        return {**basis, "toegestaan": 0, "reden": "buiten 08:00–20:00 Amsterdam"}
    if onbekend:
        return {**basis, "toegestaan": 0, "reden": f"verzenddatum van {len(onbekend)} voorstel(len) onbekend; wacht op een geslaagde Gmail-bronrun"}
    ruimte = max(0, min(MAX_PER_DAG - vandaag_n, MAX_TOTAAL - totaal))
    reden = "" if ruimte else ("daglimiet bereikt" if MAX_PER_DAG - vandaag_n <= 0 else "totaallimiet bereikt")
    return {**basis, "toegestaan": ruimte, "reden": reden}


def _domein(adres: str) -> str:
    m = re.search(r"@([A-Za-z0-9.-]+)", adres or "")
    return (m.group(1) if m else (adres or "")).strip().lower().rstrip(">")


def mag_benaderen(staat: dict, adres_of_domein: str) -> tuple[bool, str]:
    """Nooit opnieuw: wie al een voorstel kreeg, zich afmeldde of bounceste. Geen herinneringen bij stilte."""
    d = _domein(adres_of_domein)
    if d in (staat.get("onderdrukt") or {}):
        return False, f"onderdrukt ({staat['onderdrukt'][d].get('reden')})"
    if any(v.get("domain") == d for v in staat.get("proposals") or []):
        return False, "heeft al een eerste voorstel gekregen; geen herinnering bij stilte"
    return True, ""


def _inhoud_hash(tekst: str) -> str:
    """Hoofdletters en witruimte tellen niet: 'Review desk' en 'review  desk' zijn dezelfde post."""
    return hashlib.sha256(" ".join((tekst or "").lower().split()).encode()).hexdigest()[:16]


def mag_publiceren(staat: dict, uuid_of_hash: str, inhoud: str) -> bool:
    """De poort voor een publicatie: dezelfde inhoud of hetzelfde id gaat nooit twee keer de deur uit."""
    h = _inhoud_hash(inhoud)
    posts = staat.get("posts") or {}
    return uuid_of_hash not in posts and h not in posts.values()


# ═══ Ontdubbelen en classificeren (puur) ═══════════════════════════════════════════════════════════════

def nieuw_en_onthouden(staat: dict, bron: str, ids: list[str]) -> list[str]:
    """De ids die deze bron nog niet eerder zag, in volgorde en zonder dubbelen; ze worden onthouden (begrensd)."""
    gezien = staat["gezien"].setdefault(bron, [])
    bekend = set(gezien)
    nieuw: list[str] = []
    for i in ids:
        if i and i not in bekend:
            nieuw.append(i)
            bekend.add(i)
    gezien.extend(nieuw)
    if len(gezien) > GEZIEN_MAX:
        del gezien[: len(gezien) - GEZIEN_MAX]
    return nieuw


_BOUNCE = re.compile(r"(mailer-daemon|postmaster|mail delivery subsystem|mail delivery system)", re.I)
_BOUNCE_ONDERWERP = re.compile(r"(undeliver|delivery status|delivery failure|returned mail|bezorgd|niet afgeleverd|failure notice)", re.I)
_AUTO = re.compile(r"(out of office|automatic reply|auto-reply|autoreply|afwezig|automatisch antwoord|vacation)", re.I)
_AFMELD = re.compile(
    r"(afmelden|uitschrijven|uitgeschreven|unsubscribe|opt[- ]?out|geen interesse|niet ge[iï]nteresseerd|"
    r"verwijder mijn|remove me|do not contact|niet meer mailen|geen mail meer|stop met mailen|please stop)", re.I)


def classificeer_bericht(m: dict, eigen: set[str]) -> str:
    """eigen_verzonden | bounce | automatisch | afmelding | reactie."""
    van = (m.get("from") or "").lower()
    if any(e and e in van for e in eigen) or "SENT" in (m.get("labels") or []):
        return "eigen_verzonden"
    if _BOUNCE.search(van) or _BOUNCE_ONDERWERP.search(m.get("subject") or ""):
        return "bounce"
    if (m.get("auto_submitted") or "no").lower() not in ("", "no") or _AUTO.search(m.get("subject") or ""):
        return "automatisch"
    if _AFMELD.search((m.get("subject") or "") + " " + (m.get("snippet") or "")):
        return "afmelding"
    return "reactie"


def verwerk_gmail(staat: dict, berichten: list[dict], eigen: set[str], uitgezonderd: set[str], nu: datetime) -> dict[str, Any]:
    """Zet de nieuwe Gmail-berichten om in voorstellen, reacties, afmeldingen en bounces."""
    nieuwe = nieuw_en_onthouden(staat, "gmail", [m["id"] for m in berichten])
    per_id = {m["id"]: m for m in berichten}
    uit = {"voorstellen": [], "reacties": [], "afmeldingen": [], "bounces": [], "automatisch": 0, "andere_verzonden": 0}
    for i in nieuwe:
        m = per_id[i]
        soort = classificeer_bericht(m, eigen)
        at = m.get("date") or iso(nu)
        if soort == "eigen_verzonden":
            for naar in m.get("to") or []:
                d = _domein(naar)
                if not d or d in eigen or d in uitgezonderd:
                    uit["andere_verzonden"] += 1
                    continue
                bestaand = next((v for v in staat["proposals"] if v.get("domain") == d), None)
                if bestaand:
                    # De overgenomen datum was onbekend: nu is de echte bekend.
                    if not bestaand.get("at"):
                        bestaand["at"], bestaand["bron"] = at, "gmail"
                    bestaand.setdefault("thread", m.get("thread"))
                    continue
                staat["proposals"].append({"domain": d, "thread": m.get("thread"), "at": at, "bron": "gmail"})
                uit["voorstellen"].append({"domain": d, "thread": m.get("thread"), "at": at})
        else:
            d = _domein(m.get("from") or "")
            if soort in ("bounce", "afmelding") and d and d not in eigen:
                if soort == "bounce":
                    # De bounce komt van mailer-daemon; het domein dat het betreft staat bij de oorspronkelijke ontvanger.
                    for naar in m.get("bounce_voor") or []:
                        staat["onderdrukt"].setdefault(_domein(naar), {"reden": "bounce", "at": at})
                else:
                    staat["onderdrukt"].setdefault(d, {"reden": "afmelding", "at": at})
                uit["bounces" if soort == "bounce" else "afmeldingen"].append({"domain": d, "thread": m.get("thread"), "at": at})
            elif soort == "reactie":
                uit["reacties"].append({"domain": d, "thread": m.get("thread"), "at": at, "id": i})
            else:
                uit["automatisch"] += 1
    uit["nieuwe_berichten"] = len(nieuwe)
    return uit


def verwerk_betalingen(staat: dict, betalingen: list[dict]) -> dict[str, Any]:
    """Alleen bevestigde, betaalde gebeurtenissen; één keer per betaling (op payment_intent-id)."""
    bekend = set(staat["tellers"].get("bevestigde_betalingen") or [])
    nieuw: list[dict] = []
    for b in betalingen:
        sleutel = b.get("payment_intent") or b.get("id")
        if not sleutel or sleutel in bekend or not b.get("betaald"):
            continue
        bekend.add(sleutel)
        nieuw.append(b)
    staat["tellers"]["bevestigde_betalingen"] = sorted(bekend)[-GEZIEN_MAX:]
    staat["tellers"]["betalingen"] = len(bekend)
    return {"nieuwe_betalingen": len(nieuw), "totaal": len(bekend), "bedrag_cent": sum(int(b.get("bedrag_cent") or 0) for b in nieuw)}


def verwerk_aanvragen(staat: dict, aanvragen: list[dict]) -> dict[str, Any]:
    nieuw = nieuw_en_onthouden(staat, "sites", [a["id"] for a in aanvragen])
    staat["tellers"]["inquiries"] = int(staat["tellers"].get("inquiries", 0)) + len(nieuw)
    per_id = {a["id"]: a for a in aanvragen}
    return {"nieuwe_aanvragen": len(nieuw), "totaal": staat["tellers"]["inquiries"], "nieuw": [per_id[i] for i in nieuw]}


def verwerk_posts(staat: dict, posts: list[dict], views: Optional[int]) -> dict[str, Any]:
    """Posts ontdubbeld op uuid én op inhoudshash (dezelfde tekst twee keer ingepland telt één keer)."""
    nieuw = 0
    for p in posts:
        h = _inhoud_hash(p.get("tekst") or "")
        if p["id"] in staat["posts"] or (h in staat["posts"].values() and p.get("tekst")):
            continue
        staat["posts"][p["id"]] = h
        nieuw += 1
    staat["tellers"]["posts"] = len(staat["posts"])
    if views is not None:
        staat["tellers"]["views"] = int(views)
    return {"nieuwe_posts": nieuw, "totaal": len(staat["posts"]), "views": staat["tellers"].get("views")}


# ═══ Het rapport (puur): schema, validatie en bijwerken ═════════════════════════════════════════════════

_UNITS = {"EUR", "count", "percent"}


def _dt_ok(s: Any) -> bool:
    return isinstance(s, str) and re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$", s) is not None and parse_iso(s) is not None


def valideer_snapshot(s: Any) -> list[str]:
    """Dezelfde grenzen als reviewDeskSchema in reviewDeskService.ts; een ongeldig rapport laat de pagina breken."""
    f: list[str] = []
    if not isinstance(s, dict):
        return ["geen object"]
    if s.get("schemaVersion") != 1:
        f.append("schemaVersion")
    if not _dt_ok(s.get("updatedAt")):
        f.append("updatedAt")
    if not isinstance(s.get("summary"), str) or len(s["summary"]) > 30000:
        f.append("summary")
    grenzen = {"metrics": 20, "leads": 200, "channels": 20, "sections": 30, "actions": 30, "links": 20}
    for naam, mx in grenzen.items():
        if not isinstance(s.get(naam), list) or len(s[naam]) > mx:
            f.append(f"{naam} (max {mx})")
    for m in s.get("metrics") or []:
        if not (isinstance(m.get("label"), str) and len(m["label"]) <= 100 and m.get("unit") in _UNITS and _dt_ok(m.get("asOf"))
                and isinstance(m.get("source"), str) and len(m["source"]) <= 30000
                and (m.get("value") is None or (isinstance(m["value"], (int, float)) and not isinstance(m["value"], bool) and math.isfinite(m["value"])))):
            f.append(f"metric {m.get('label')}")
    for x in s.get("leads") or []:
        if not (isinstance(x.get("name"), str) and len(x["name"]) <= 200 and isinstance(x.get("status"), str) and len(x["status"]) <= 100
                and isinstance(x.get("note"), str) and len(x["note"]) <= 30000 and _dt_ok(x.get("asOf"))
                and (x.get("sourceUrl") is None or str(x["sourceUrl"]).startswith("https://"))):
            f.append(f"lead {x.get('name')}")
    for c in s.get("channels") or []:
        if not (isinstance(c.get("name"), str) and len(c["name"]) <= 100 and isinstance(c.get("status"), str) and len(c["status"]) <= 30000 and _dt_ok(c.get("asOf"))):
            f.append(f"channel {c.get('name')}")
    for x in s.get("sections") or []:
        if not (isinstance(x.get("title"), str) and len(x["title"]) <= 200 and isinstance(x.get("body"), str) and len(x["body"]) <= 30000 and _dt_ok(x.get("asOf"))):
            f.append(f"section {x.get('title')}")
    for a in s.get("actions") or []:
        if not (isinstance(a, str) and len(a) <= 30000):
            f.append("action")
    for l in s.get("links") or []:
        if not (isinstance(l.get("label"), str) and len(l["label"]) <= 100 and str(l.get("url", "")).startswith("https://")):
            f.append(f"link {l.get('label')}")
    return f


def _metric(snap: dict, label: str) -> Optional[dict]:
    return next((m for m in snap["metrics"] if m.get("label") == label), None)


def _zet_metric(snap: dict, label: str, waarde: int, bron_tekst: str, nu: datetime) -> bool:
    """Werk één waarneming bij; ververs `asOf` alleen bij een andere waarde of een verouderde datum."""
    m = _metric(snap, label)
    if m is None:
        if len(snap["metrics"]) >= 20:
            return False
        snap["metrics"].append({"label": label, "value": waarde, "unit": "count", "asOf": iso(nu), "source": bron_tekst})
        return True
    oud = parse_iso(m.get("asOf"))
    verouderd = oud is None or nu - oud > timedelta(hours=ASOF_VERVERS_UREN)
    if m.get("value") == waarde and not verouderd:
        return False
    m.update({"value": waarde, "asOf": iso(nu), "source": bron_tekst})
    return True


def _kanaal_tekst(resultaten: dict[str, dict], ruimte: dict, overname: dict) -> str:
    regels = []
    for b in BRONNEN:
        r = resultaten.get(b) or {"status": "niet_gelezen"}
        if r["status"] == "ok":
            regels.append(f"{b}: gelezen ({r.get('samenvatting', 'geen nieuws')})")
        elif r["status"] == "autorisatie":
            regels.append(f"{b}: NIET aangesloten, wacht op autorisatie ({', '.join(r.get('ontbreekt') or [])})")
        else:
            regels.append(f"{b}: fout ({r.get('bericht', 'onbekend')}); oude waarneming behouden")
    regels.append(
        f"Acquisitieruimte nu: {ruimte['toegestaan']} (vandaag {ruimte['vandaag']}/{ruimte['per_dag']}, totaal {ruimte['totaal']}/{ruimte['max_totaal']})"
        + (f" — {ruimte['reden']}" if ruimte.get("reden") else ""))
    regels.append(f"Overname: {overname['tekst']}")
    return "\n".join(regels)[:30000]


def overname_status(staat: dict) -> dict[str, Any]:
    """De overname is pas bewezen na twee geslaagde GEPLANDE bronruns waarin elke bron gelezen is, op twee verschillende slots."""
    gepland = [r for r in staat.get("runs") or [] if r.get("trigger") == "scheduled"]
    laatste = gepland[-2:]
    bewezen = len(laatste) == 2 and all(r.get("alle_bronnen_ok") for r in laatste) and laatste[0].get("slot") != laatste[1].get("slot")
    geslaagd = sum(1 for r in gepland if r.get("alle_bronnen_ok"))
    return {
        "bewezen": bewezen, "geslaagde_geplande_runs": geslaagd, "geplande_runs": len(gepland),
        "tekst": ("BEWEZEN: twee geslaagde geplande bronruns achter elkaar." if bewezen else
                  f"NIET bewezen — {geslaagd} geslaagde geplande bronruns met alle vier de bronnen gelezen (twee vereist)."),
    }


def pas_rapport_toe(snapshot: dict, resultaten: dict[str, dict], gebeurtenissen: dict[str, Any], staat: dict, nu: datetime) -> tuple[dict, bool]:
    """Het bijgewerkte rapport en of er iets veranderd is. Alleen bronnen die gelezen zijn raken hun waarneming aan."""
    snap = copy.deepcopy(snapshot)
    veranderd = False
    ok = {b for b, r in resultaten.items() if r.get("status") == "ok"}

    if "gmail" in ok:
        veranderd |= _zet_metric(snap, "Proposals sent", len(staat["proposals"]), "AXE Core source worker (Gmail, eigen verzonden berichten)", nu)
    if "sites" in ok:
        veranderd |= _zet_metric(snap, "Website inquiries", int(staat["tellers"]["inquiries"]), "AXE Core source worker (Sites, unieke aanvraag-id's)", nu)
    if "stripe" in ok:
        veranderd |= _zet_metric(snap, "Recorded payment events", int(staat["tellers"]["betalingen"]), "AXE Core source worker (Stripe, bevestigde betaling per payment_intent)", nu)
    if "metricool" in ok:
        veranderd |= _zet_metric(snap, "Published social posts", int(staat["tellers"]["posts"]), "AXE Core source worker (Metricool, ontdubbeld op id en inhoud)", nu)
        veranderd |= _zet_metric(snap, "TikTok video views", int(staat["tellers"]["views"]), "AXE Core source worker (Metricool analytics)", nu)

    g = gebeurtenissen.get("gmail") or {}
    for r in g.get("reacties", []):
        naam = (r.get("domain") or "onbekend")[:200]
        notitie = f"Nieuwe inkomende reactie op {r['at'][:10]}. Lees hem in Gmail (thread {r.get('thread')}); er is nog geen antwoord verstuurd."
        veranderd |= _zet_lead(snap, naam, "Reply received", notitie, r["at"])
        veranderd |= _voeg_actie_toe(snap, f"Reageer op {naam}: nieuwe inkomende reactie (Gmail-thread {r.get('thread')}). Antwoord eerst als concept.")
    for r in g.get("afmeldingen", []):
        veranderd |= _zet_lead(snap, r["domain"][:200], "Do not contact", f"Afmelding of weigering op {r['at'][:10]}; nooit meer benaderen.", r["at"])
    for r in g.get("bounces", []):
        veranderd |= _zet_lead(snap, r["domain"][:200], "Do not contact", f"Bezorgfout (bounce) op {r['at'][:10]}; adres niet opnieuw proberen.", r["at"])
    for a in (gebeurtenissen.get("sites") or {}).get("nieuw", []):
        naam = (a.get("naam") or "Website inquiry")[:200]
        veranderd |= _zet_lead(snap, naam, "Website inquiry", f"Nieuwe aanvraag via de site op {(a.get('at') or iso(nu))[:10]} (id {a['id']}).", a.get("at") or iso(nu))
        veranderd |= _voeg_actie_toe(snap, f"Lees de nieuwe aanvraag van {naam} (id {a['id']}) en beantwoord hem als concept.")

    # Eigen kanaalregel: de plek waar fouten en ontbrekende autorisatie staan, met behoud van de oude waarnemingen elders.
    ruimte = acquisitie_ruimte(staat, nu)
    tekst = _kanaal_tekst(resultaten, ruimte, overname_status(staat))
    kanaal = next((c for c in snap["channels"] if c.get("name") == KANAAL_NAAM), None)
    if kanaal is None:
        if len(snap["channels"]) < 20:
            snap["channels"].append({"name": KANAAL_NAAM, "status": tekst, "asOf": iso(nu)})
            veranderd = True
    else:
        oud = parse_iso(kanaal.get("asOf"))
        if kanaal.get("status") != tekst or oud is None or nu - oud > timedelta(hours=ASOF_VERVERS_UREN):
            kanaal.update({"status": tekst, "asOf": iso(nu)})
            veranderd = True
    if veranderd:
        snap["updatedAt"] = iso(nu)
    return snap, veranderd


def _zet_lead(snap: dict, naam: str, status: str, notitie: str, at: str) -> bool:
    lead = next((l for l in snap["leads"] if l.get("name") == naam), None)
    if lead is None:
        if len(snap["leads"]) >= 200:
            return False
        snap["leads"].append({"name": naam, "status": status[:100], "note": notitie[:30000], "asOf": at if _dt_ok(at) else iso(datetime.now(timezone.utc))})
        return True
    if lead.get("status") == status and lead.get("note") == notitie:
        return False
    lead.update({"status": status[:100], "note": notitie[:30000], "asOf": at if _dt_ok(at) else lead["asOf"]})
    return True


def _voeg_actie_toe(snap: dict, tekst: str) -> bool:
    tekst = (WORKER_PREFIX + tekst)[:30000]
    if tekst in snap["actions"]:
        return False
    if len(snap["actions"]) >= 30:
        # Maak ruimte met het oudste door de worker zelf toegevoegde item; wat een mens schreef blijft staan.
        eigen = next((i for i, a in enumerate(snap["actions"]) if a.startswith(WORKER_PREFIX)), None)
        if eigen is None:
            return False
        del snap["actions"][eigen]
    snap["actions"].append(tekst)
    return True


# ═══ Opslag met CAS ═════════════════════════════════════════════════════════════════════════════════════

class Rij:
    def __init__(self, user_id: str, value: Any, updated_at: str):
        self.user_id, self.value, self.updated_at = user_id, value, updated_at


class SupabaseOpslag:
    """user_settings via REST met de service-sleutel; schrijven alleen met een voorwaarde op de eerder gelezen updated_at."""

    def __init__(self, url: str, service_key: str, http: Optional[httpx.Client] = None):
        self.url = url.rstrip("/") + "/rest/v1/user_settings"
        self.kop = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}
        self.http = http or httpx.Client(timeout=20)

    def lees(self, sleutel: str, user_id: Optional[str] = None) -> Optional[Rij]:
        params = {"key": f"eq.{sleutel}", "select": "user_id,value,updated_at", "limit": "2"}
        if user_id:
            params["user_id"] = f"eq.{user_id}"
        r = self.http.get(self.url, params=params, headers=self.kop)
        r.raise_for_status()
        rijen = r.json()
        if not rijen:
            return None
        if len(rijen) > 1:
            raise RuntimeError(f"{sleutel}: meer dan één eigenaar; weiger te gokken welke")
        v = rijen[0]["value"]
        return Rij(rijen[0]["user_id"], json.loads(v) if isinstance(v, str) else v, rijen[0]["updated_at"])

    def schrijf_cas(self, user_id: str, sleutel: str, waarde: Any, verwacht: str) -> Optional[str]:
        """Nieuwe updated_at bij succes, None bij een conflict (iemand schreef intussen)."""
        vorig = parse_iso(verwacht) or datetime.now(timezone.utc)
        nieuw = iso(max(datetime.now(timezone.utc), vorig + timedelta(milliseconds=1)))
        r = self.http.patch(
            self.url,
            params={"user_id": f"eq.{user_id}", "key": f"eq.{sleutel}", "updated_at": f"eq.{verwacht}"},
            headers={**self.kop, "Prefer": "return=representation"},
            json={"value": waarde, "updated_at": nieuw},
        )
        r.raise_for_status()
        return nieuw if r.json() else None

    def maak(self, user_id: str, sleutel: str, waarde: Any) -> bool:
        r = self.http.post(self.url, headers={**self.kop, "Prefer": "return=minimal,resolution=ignore-duplicates"},
                           params={"on_conflict": "user_id,key"}, json={"user_id": user_id, "key": sleutel, "value": waarde})
        return r.status_code in (200, 201, 204)


# ═══ De bronnen ═════════════════════════════════════════════════════════════════════════════════════════

def _kop(headers: list[dict], naam: str) -> str:
    for h in headers or []:
        if (h.get("name") or "").lower() == naam.lower():
            return h.get("value") or ""
    return ""


def _adressen(veld: str) -> list[str]:
    return [a.lower() for a in re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", veld or "")]


class GmailBron:
    """Alleen lezen (metadata + snippet). Geen verzendfunctie, met opzet."""

    def __init__(self, http: httpx.Client, sleutels: dict[str, str]):
        self.http, self.s = http, sleutels
        self._token: Optional[str] = None

    def _toegang(self) -> str:
        if self._token:
            return self._token
        r = self.http.post("https://oauth2.googleapis.com/token", data={
            "client_id": self.s["GOOGLE_OAUTH_CLIENT_ID"], "client_secret": self.s["GOOGLE_OAUTH_CLIENT_SECRET"],
            "refresh_token": self.s["REVIEW_DESK_GMAIL_REFRESH_TOKEN"], "grant_type": "refresh_token"})
        if r.status_code in (400, 401):
            raise BronFout("gmail", "autorisatie", "refresh-token geweigerd (ingetrokken of verlopen); opnieuw toestemming geven")
        r.raise_for_status()
        self._token = r.json()["access_token"]
        return self._token

    def _get(self, pad: str, params: dict) -> dict:
        r = self.http.get(f"https://gmail.googleapis.com/gmail/v1/users/me/{pad}", params=params, headers={"Authorization": f"Bearer {self._toegang()}"})
        if r.status_code in (401, 403):
            raise BronFout("gmail", "autorisatie", f"toegang geweigerd ({r.status_code}); controleer de scopes")
        r.raise_for_status()
        return r.json()

    def _ids(self, query: str) -> tuple[list[str], bool]:
        ids: list[str] = []
        pagina = None
        for n in range(MAX_PAGINAS):
            d = self._get("messages", {"q": query, "maxResults": PAGINA_GROOTTE, **({"pageToken": pagina} if pagina else {})})
            ids += [m["id"] for m in d.get("messages") or []]
            pagina = d.get("nextPageToken")
            if not pagina:
                return ids, False
        return ids, True

    def lees(self, sinds_epoch: int) -> tuple[list[dict], bool]:
        """(genormaliseerde berichten, onvolledig). Verzonden, inkomend en bounce-achtige berichten sinds de cursor."""
        queries = [f"in:sent after:{sinds_epoch}", f"in:inbox after:{sinds_epoch}", f"from:(mailer-daemon OR postmaster) after:{sinds_epoch}"]
        alle: dict[str, dict] = {}
        onvolledig = False
        for q in queries:
            ids, afgekapt = self._ids(q)
            onvolledig |= afgekapt
            for i in ids:
                if i in alle:
                    continue
                d = self._get(f"messages/{i}", {"format": "metadata", "metadataHeaders": ["From", "To", "Subject", "Date", "Auto-Submitted", "X-Failed-Recipients"]})
                h = (d.get("payload") or {}).get("headers") or []
                alle[i] = {
                    "id": i, "thread": d.get("threadId"), "labels": d.get("labelIds") or [], "snippet": d.get("snippet") or "",
                    "from": _kop(h, "From"), "to": _adressen(_kop(h, "To")), "subject": _kop(h, "Subject"),
                    "auto_submitted": _kop(h, "Auto-Submitted") or "no",
                    "bounce_voor": _adressen(_kop(h, "X-Failed-Recipients")),
                    "date": iso(datetime.fromtimestamp(int(d.get("internalDate") or 0) / 1000, tz=timezone.utc)) if d.get("internalDate") else None,
                }
        return list(alle.values()), onvolledig


    def tekst_van(self, bericht_id: str, max_tekens: int = 2500) -> tuple[str, dict]:
        """De platte tekst van één inkomend bericht (voor een concept) en zijn koppen. Alleen op verzoek, nooit in een lege run."""
        d = self._get(f"messages/{bericht_id}", {"format": "full"})
        koppen = (d.get("payload") or {}).get("headers") or []

        def plat(deel: dict) -> str:
            if (deel.get("mimeType") or "") == "text/plain" and (deel.get("body") or {}).get("data"):
                return base64.urlsafe_b64decode(deel["body"]["data"] + "=" * (-len(deel["body"]["data"]) % 4)).decode("utf-8", "replace")
            return "\n".join(plat(x) for x in deel.get("parts") or [])
        return plat(d.get("payload") or {})[:max_tekens], {"thread": d.get("threadId"), "van": _kop(koppen, "From"),
                                                          "onderwerp": _kop(koppen, "Subject"), "message_id": _kop(koppen, "Message-ID")}

    def maak_concept(self, thread: str, aan: str, onderwerp: str, tekst: str, in_reply_to: str = "") -> str:
        """Een CONCEPT in Gmail (drafts.create). Er bestaat in deze klasse geen verzendaanroep, met opzet."""
        regels = [f"To: {aan}", f"Subject: {onderwerp if onderwerp.lower().startswith('re:') else 'Re: ' + onderwerp}",
                  'Content-Type: text/plain; charset="UTF-8"']
        if in_reply_to:
            regels += [f"In-Reply-To: {in_reply_to}", f"References: {in_reply_to}"]
        raw = base64.urlsafe_b64encode(("\r\n".join(regels) + "\r\n\r\n" + tekst).encode("utf-8")).decode()
        r = self.http.post("https://gmail.googleapis.com/gmail/v1/users/me/drafts", headers={"Authorization": f"Bearer {self._toegang()}"},
                           json={"message": {"raw": raw, "threadId": thread}})
        if r.status_code in (401, 403):
            raise BronFout("gmail", "autorisatie", f"concept maken geweigerd ({r.status_code}); de scope gmail.compose ontbreekt")
        r.raise_for_status()
        return r.json().get("id", "")


def concept_fabriek(http: httpx.Client, sleutels: dict[str, str], vraag_model: Callable[[list[dict]], str], aanbod: str = "") -> Callable[[dict], Optional[str]]:
    """Het concept voor een nieuwe inkomende reactie: leest dat ene bericht, vraagt een GRATIS model om een antwoord
    en bewaart het als Gmail-concept. `vraag_model` is door de aanroeper beperkt tot gratis aanbieders."""
    gmail = GmailBron(http, sleutels)

    def maak(reactie: dict) -> Optional[str]:
        tekst, kop = gmail.tekst_van(reactie["id"])
        if not tekst.strip():
            return None
        antwoord = vraag_model([
            {"role": "system", "content": "Je schrijft in het Nederlands, kort en vriendelijk, namens Luka van AXE Website Review Desk. "
             "Beantwoord alleen wat er gevraagd is, verzin geen prijzen of beloftes buiten dit aanbod en vraag niet om geld. "
             f"Aanbod: {aanbod or 'Pilot: één websitereview, geleverd binnen 3 werkdagen na een volledige briefing.'}"},
            {"role": "user", "content": f"Bericht van {kop['van']}:\n{tekst}\n\nSchrijf een conceptantwoord."},
        ])
        if not (antwoord or "").strip():
            return None
        return gmail.maak_concept(kop["thread"], kop["van"], kop["onderwerp"], antwoord.strip(), kop["message_id"])
    return maak


class StripeBron:
    def __init__(self, http: httpx.Client, sleutel: str):
        self.http, self.k = http, sleutel

    def _lijst(self, pad: str, params: dict) -> tuple[list[dict], bool]:
        uit: list[dict] = []
        na = None
        for _ in range(MAX_PAGINAS):
            r = self.http.get(f"https://api.stripe.com/v1/{pad}", params={"limit": PAGINA_GROOTTE, **params, **({"starting_after": na} if na else {})},
                              headers={"Authorization": f"Bearer {self.k}"})
            if r.status_code in (401, 403):
                raise BronFout("stripe", "autorisatie", f"sleutel geweigerd ({r.status_code}): {(r.json().get('error') or {}).get('message', '')[:120]}")
            r.raise_for_status()
            d = r.json()
            uit += d.get("data") or []
            if not d.get("has_more") or not d.get("data"):
                return uit, False
            na = d["data"][-1]["id"]
        return uit, True

    def lees(self, sinds_epoch: int) -> tuple[list[dict], bool]:
        sessies, afgekapt = self._lijst("checkout/sessions", {"created[gte]": sinds_epoch})
        uit = [{
            "id": s["id"], "payment_intent": s.get("payment_intent"), "betaald": s.get("status") == "complete" and s.get("payment_status") == "paid",
            "bedrag_cent": s.get("amount_total") or 0, "valuta": s.get("currency"), "at": iso(datetime.fromtimestamp(s["created"], tz=timezone.utc)),
        } for s in sessies]
        return uit, afgekapt


class SitesBron:
    """Een door de eigenaar beveiligd GET-eindpunt: {base}/{verzameling}?offset=&limit= → {rows|items|data, next_offset}."""

    def __init__(self, http: httpx.Client, basis: str, token: str):
        self.http, self.basis, self.token = http, basis.rstrip("/"), token

    def _rijen(self, verzameling: str) -> tuple[list[dict], bool]:
        rijen: list[dict] = []
        offset: Any = 0
        for _ in range(MAX_PAGINAS):
            r = self.http.get(f"{self.basis}/{verzameling}", params={"offset": offset, "limit": PAGINA_GROOTTE}, headers={"Authorization": f"Bearer {self.token}"})
            if r.status_code in (401, 403):
                raise BronFout("sites", "autorisatie", f"toegang geweigerd ({r.status_code}) op /{verzameling}")
            r.raise_for_status()
            d = r.json()
            blok = d.get("rows") if isinstance(d, dict) else d
            blok = blok if blok is not None else (d.get("items") if isinstance(d, dict) else None)
            blok = blok if blok is not None else (d.get("data") if isinstance(d, dict) else [])
            rijen += blok or []
            offset = d.get("next_offset") if isinstance(d, dict) else None
            if offset in (None, "", False):
                return rijen, False
        return rijen, True

    def lees(self) -> tuple[list[dict], list[dict], bool]:
        aanvragen, a1 = self._rijen("inquiries")
        betalingen, a2 = self._rijen("payment_events")
        a = [{"id": str(x.get("id") or x.get("uuid")), "naam": (x.get("company") or x.get("name") or x.get("bedrijf") or "")[:200] or None,
              "at": x.get("created_at") or x.get("createdAt")} for x in aanvragen if x.get("id") or x.get("uuid")]
        b = [{"id": str(x.get("id") or x.get("uuid")), "payment_intent": x.get("payment_intent") or x.get("stripe_payment_intent"),
              "betaald": str(x.get("status", "")).lower() in ("paid", "succeeded", "complete", "completed"), "bedrag_cent": x.get("amount_cents") or x.get("amount") or 0}
             for x in betalingen if x.get("id") or x.get("uuid")]
        return a, b, a1 or a2


class MetricoolBron:
    BASIS = "https://app.metricool.com/api"

    def __init__(self, http: httpx.Client, sleutels: dict[str, str]):
        self.http = http
        self.kop = {"X-Mc-Auth": sleutels["METRICOOL_USER_TOKEN"]}
        self.params = {"userId": sleutels["METRICOOL_USER_ID"], "blogId": sleutels["METRICOOL_BLOG_ID"]}

    def _get(self, pad: str, extra: dict) -> Any:
        r = self.http.get(f"{self.BASIS}{pad}", params={**self.params, **extra}, headers=self.kop)
        if r.status_code in (401, 403):
            raise BronFout("metricool", "autorisatie", f"token geweigerd ({r.status_code}); API vraagt een Advanced-abonnement")
        r.raise_for_status()
        return r.json()

    def lees(self, nu: datetime) -> tuple[list[dict], Optional[int]]:
        van, tot = nu - timedelta(days=BACKFILL_DAGEN), nu + timedelta(days=30)
        d = self._get("/v2/scheduler/posts", {"start": van.astimezone(AMS).strftime("%Y-%m-%dT%H:%M:%S"), "end": tot.astimezone(AMS).strftime("%Y-%m-%dT%H:%M:%S"), "timezone": "Europe/Amsterdam"})
        posts = []
        for p in (d.get("data") if isinstance(d, dict) else d) or []:
            gepubliceerd = not p.get("draft") and any(str(pr.get("status", "")).upper() == "PUBLISHED" for pr in p.get("providers") or [])
            if gepubliceerd:
                posts.append({"id": str(p.get("uuid") or p.get("id")), "tekst": p.get("text") or ""})
        t = self._get("/v2/analytics/posts/tiktok", {"from": van.astimezone(AMS).strftime("%Y-%m-%dT%H:%M:%S"), "to": nu.astimezone(AMS).strftime("%Y-%m-%dT%H:%M:%S"), "timezone": "Europe/Amsterdam"})
        videos = (t.get("data") if isinstance(t, dict) else t) or []
        # Per video de laatste meting, dus nooit cumulatief optellen over runs heen.
        views = sum(int(v.get("viewCount") or 0) for v in videos)
        return posts, views


# ═══ Eén run ════════════════════════════════════════════════════════════════════════════════════════════

def _seed_uit_rapport(snapshot: dict) -> list[dict]:
    """Bekende eigen voorstellen uit de sectie 'Bron-ID's en deduplicatie', met onbekende verzenddatum."""
    sectie = next((s for s in snapshot.get("sections", []) if "deduplicatie" in (s.get("title") or "").lower()), None)
    if not sectie:
        return []
    uit = []
    for m in re.finditer(r"([\w.+-]+@[\w-]+(?:\.[\w-]+)+):\s*message/thread\s+([0-9a-f]+)", sectie.get("body") or ""):
        uit.append({"domain": _domein(m.group(1)), "thread": m.group(2), "at": None, "bron": "rapport"})
    return uit


def run_bronrun(
    opslag: SupabaseOpslag, http: httpx.Client, sleutels: dict[str, str], nu: Optional[datetime] = None,
    trigger: str = "manual", slot: Optional[str] = None,
    concept_maker: Optional[Callable[[dict], Optional[str]]] = None,
) -> dict[str, Any]:
    """Eén controle. Geeft {status: ok|skipped|fail, output, resultaten}; status 'ok' alleen als elke bron gelezen is."""
    nu = nu or datetime.now(timezone.utc)
    rij = opslag.lees(RAPPORT_SLEUTEL)
    if rij is None:
        return {"status": "skipped", "output": "geen privérapport gevonden", "resultaten": {}}
    staat_rij = opslag.lees(STAAT_SLEUTEL, rij.user_id)
    staat = staat_rij.value if staat_rij and isinstance(staat_rij.value, dict) else lege_staat()
    for b in BRONNEN:
        staat["gezien"].setdefault(b, [])
    if not staat["proposals"] and not (staat_rij and staat_rij.value):
        staat["proposals"] = _seed_uit_rapport(rij.value)

    ontbreekt = ontbrekende_autorisatie(sleutels)
    eigen = {a.strip().lower() for a in (sleutels.get("REVIEW_DESK_EIGEN_ADRESSEN") or "support@axeheadquarters.com").split(",") if a.strip()}
    eigen |= {_domein(a) for a in eigen}
    uitgezonderd = {d.strip().lower() for d in (sleutels.get("REVIEW_DESK_UITGEZONDERD") or "").split(",") if d.strip()}
    resultaten: dict[str, dict] = {}
    gebeurtenissen: dict[str, Any] = {}

    def draai(bron: str, f: Callable[[], dict]) -> None:
        if bron in ontbreekt:
            resultaten[bron] = {"status": "autorisatie", "ontbreekt": ontbreekt[bron], "autorisatie": AUTORISATIE[bron]}
            return
        try:
            resultaten[bron] = f()
        except BronFout as e:
            resultaten[bron] = {"status": "autorisatie" if e.soort == "autorisatie" else "fout", "bericht": e.bericht, "ontbreekt": [], "autorisatie": AUTORISATIE[bron] if e.soort == "autorisatie" else None}
        except (httpx.HTTPError, ValueError, KeyError) as e:
            resultaten[bron] = {"status": "fout", "bericht": f"{e.__class__.__name__}: {str(e)[:160]}"}

    def gmail() -> dict:
        cur = int((staat["cursors"].get("gmail") or {}).get("epoch") or (nu - timedelta(days=BACKFILL_DAGEN)).timestamp())
        start = int(nu.timestamp())
        berichten, onvolledig = GmailBron(http, sleutels).lees(max(0, cur - 3600))
        g = verwerk_gmail(staat, berichten, eigen, uitgezonderd, nu)
        gebeurtenissen["gmail"] = g
        if onvolledig:
            # De cursor schuift niet op: de volgende run leest verder, de gezien-lijst voorkomt dubbel werk.
            return {"status": "fout", "bericht": f"meer dan {MAX_PAGINAS * PAGINA_GROOTTE} berichten sinds de cursor; gedeeltelijk verwerkt", "ontbreekt": []}
        staat["cursors"]["gmail"] = {"epoch": start}
        if concept_maker:
            for r in g["reacties"]:
                try:
                    concept_maker(r)
                except Exception as e:  # noqa: BLE001 — een concept mag de bronrun nooit laten falen
                    log.warning("concept voor %s mislukt: %s", r.get("thread"), e.__class__.__name__)
        return {"status": "ok", "samenvatting": f"{g['nieuwe_berichten']} nieuw: {len(g['voorstellen'])} voorstellen, {len(g['reacties'])} reacties, {len(g['afmeldingen'])} afmeldingen, {len(g['bounces'])} bounces"}

    sites_betalingen: list[dict] = []

    def sites() -> dict:
        a, b, onvolledig = SitesBron(http, sleutels["REVIEW_DESK_SITES_URL"], sleutels["REVIEW_DESK_SITES_TOKEN"]).lees()
        gebeurtenissen["sites"] = verwerk_aanvragen(staat, a)
        sites_betalingen.extend(b)
        if onvolledig:
            return {"status": "fout", "bericht": "meer rijen dan de paginalimiet; gedeeltelijk verwerkt", "ontbreekt": []}
        return {"status": "ok", "samenvatting": f"{gebeurtenissen['sites']['nieuwe_aanvragen']} nieuwe aanvragen"}

    def stripe() -> dict:
        cur = int((staat["cursors"].get("stripe") or {}).get("epoch") or (nu - timedelta(days=BACKFILL_DAGEN)).timestamp())
        start = int(nu.timestamp())
        betalingen, onvolledig = StripeBron(http, sleutels["REVIEW_DESK_STRIPE_KEY"]).lees(max(0, cur - 86400))
        gebeurtenissen["stripe"] = verwerk_betalingen(staat, betalingen + sites_betalingen)
        if onvolledig:
            return {"status": "fout", "bericht": "meer sessies dan de paginalimiet; gedeeltelijk verwerkt", "ontbreekt": []}
        staat["cursors"]["stripe"] = {"epoch": start}
        return {"status": "ok", "samenvatting": f"{gebeurtenissen['stripe']['nieuwe_betalingen']} nieuwe betalingen"}

    def metricool() -> dict:
        posts, views = MetricoolBron(http, sleutels).lees(nu)
        gebeurtenissen["metricool"] = verwerk_posts(staat, posts, views)
        return {"status": "ok", "samenvatting": f"{gebeurtenissen['metricool']['nieuwe_posts']} nieuwe posts, {gebeurtenissen['metricool']['views']} views"}

    draai("gmail", gmail)
    draai("sites", sites)
    draai("stripe", stripe)
    draai("metricool", metricool)

    alle_ok = all(resultaten[b]["status"] == "ok" for b in BRONNEN)
    staat["runs"].append({"at": iso(nu), "trigger": trigger, "slot": slot or iso(nu)[:13], "alle_bronnen_ok": alle_ok,
                          "bronnen": {b: resultaten[b]["status"] for b in BRONNEN}})
    del staat["runs"][: max(0, len(staat["runs"]) - RUNS_BEWAAR)]

    # Rapport eerst, dan de staat: faalt de tweede schrijfactie, dan herberekent de volgende run dezelfde waarden.
    geschreven = False
    for _ in range(3):
        snap, veranderd = pas_rapport_toe(rij.value, resultaten, gebeurtenissen, staat, nu)
        if not veranderd:
            break
        fouten = valideer_snapshot(snap)
        if fouten:
            return {"status": "fail", "output": f"bijgewerkt rapport is ongeldig ({', '.join(fouten[:5])}); niets geschreven", "resultaten": resultaten}
        nieuw = opslag.schrijf_cas(rij.user_id, RAPPORT_SLEUTEL, snap, rij.updated_at)
        if nieuw:
            geschreven = True
            break
        rij = opslag.lees(RAPPORT_SLEUTEL, rij.user_id) or rij   # conflict: opnieuw lezen en dezelfde mutatie op de nieuwste versie
    else:
        return {"status": "fail", "output": "rapport bleef botsen met een andere schrijver na 3 pogingen", "resultaten": resultaten}

    if staat_rij is None:
        opslag.maak(rij.user_id, STAAT_SLEUTEL, staat)
        staat_rij = opslag.lees(STAAT_SLEUTEL, rij.user_id)
    elif not opslag.schrijf_cas(rij.user_id, STAAT_SLEUTEL, staat, staat_rij.updated_at):
        return {"status": "fail", "output": "staat bleef botsen; rapport is wel bijgewerkt, volgende run herberekent", "resultaten": resultaten}

    fout = [b for b in BRONNEN if resultaten[b]["status"] == "fout"]
    geen_toegang = [b for b in BRONNEN if resultaten[b]["status"] == "autorisatie"]
    status = "ok" if alle_ok else ("fail" if fout else "skipped")
    samenvatting = {
        "bronnen": {b: resultaten[b]["status"] for b in BRONNEN}, "rapport_geschreven": geschreven,
        "wacht_op_autorisatie": geen_toegang, "fouten": fout, "ruimte": acquisitie_ruimte(staat, nu), "overname": overname_status(staat)["tekst"],
    }
    return {"status": status, "output": json.dumps(samenvatting, ensure_ascii=False)[:3900], "resultaten": resultaten}
