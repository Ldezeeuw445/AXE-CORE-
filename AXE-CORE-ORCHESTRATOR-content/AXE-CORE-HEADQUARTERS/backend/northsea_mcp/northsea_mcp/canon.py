"""De canonieke definities van de Global Trade Center, in Python.

## Waarom dit bestand bestaat

AXE CORE rekent de getallen van de Global Trade Center uit in TypeScript
(src/domain/northsea/*.ts) op rijen uit backend/axe_api/northsea.py. De MCP moet
DEZELFDE getallen geven, anders zegt ChatGPT "24 actief" en het dashboard iets
anders, en weet niemand welke klopt.

Elke functie hier is een regel-voor-regel-port van één TS-functie; de bron staat
erbij. Drift wordt bewaakt door één gedeeld bestand met gevallen
(tests/canon_fixtures.json), dat zowel pytest (tests/test_canon.py) als vitest
(src/domain/northsea/canonPariteit.test.ts) leest. Verandert een regel aan één
kant, dan faalt de test aan de andere kant.

## Integriteitsregels die in de data zelf niet als veld bestaan

- De Hamburg/Jasmine-"koper" is een INTERNE testcase (STRATO-testgesprek). Hij
  wordt nooit als echte vraag getoond.
- ABAKUS heeft tussenpersonen expliciet afgewezen: do-not-contact.
Er is (16 september 2026) geen kolom voor. De regels herkennen het aan de
tekst die NorthSea er zelf bij schreef, plus de bekende ids; elke markering zegt
waarom, zodat hij te controleren is.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

# ── Dealcode (chase.ts: isDealCode) ─────────────────────────────────────────
DEAL_CODE = re.compile(r"^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-\d{2,}[A-Z0-9-]*$")


def is_deal_code(value: Any) -> bool:
    return isinstance(value, str) and bool(DEAL_CODE.match(value.strip()))


def deal_label(opp: dict) -> str:
    """desk.ts: dealId -- de code, anders het begin van de database-id."""
    code = opp.get("deal_priority")
    return code.strip() if is_deal_code(code) else f"#{str(opp.get('id', ''))[:6]}"


# ── Stand van een deal (kaart.ts: isActief, dealStand; desk.ts) ────────────
_ACTIEVE_UITVOERING = {"", "discovered", "matched"}


def _s(v: Any) -> str:
    return (v or "").strip() if isinstance(v, str) else ""


def is_open(opp: dict) -> bool:
    return _s(opp.get("stage")) not in ("won", "lost")


def is_active(opp: dict) -> bool:
    """Actief = open, en voorbij 'identified' OF al in uitvoering voorbij 'matched'."""
    stage, uitvoering = _s(opp.get("stage")), _s(opp.get("execution_state"))
    if stage in ("won", "lost"):
        return False
    return stage != "identified" or uitvoering not in _ACTIEVE_UITVOERING


def is_blocked(opp: dict) -> bool:
    """northsea.py kaart/pipeline: geblokkeerd = er staat een primary_blocker."""
    return _s(opp.get("primary_blocker")) != ""


def deal_state(opp: dict) -> str:
    """kaart.ts dealStand: blocked gaat voor alles; dan won/lost, active, matched, other."""
    stage, uitvoering = _s(opp.get("stage")), _s(opp.get("execution_state"))
    if is_blocked(opp):
        return "blocked"
    if stage == "won":
        return "completed"
    if stage == "lost":
        return "other"
    if is_active(opp):
        return "active"
    if uitvoering == "matched":
        return "matched"
    return "other"


DEAL_STATE_DEFINITIONS = {
    "active": "Open (not won/lost) AND (stage beyond 'identified' OR execution_state not in {'', discovered, matched}). "
              "Source: src/domain/northsea/kaart.ts isActief; same rule as northsea.py 'actief'.",
    "blocked": "primary_blocker is non-empty. A blocked deal is shown as blocked on the map even when it is also active.",
    "matched": "Open, not active, execution_state = 'matched'. A match is NOT an executable deal.",
    "completed": "stage = 'won'.",
    "other": "Everything else (e.g. identified/discovered, or lost).",
    "pipeline": "Open opportunities: stage not in (won, lost).",
}


# ── Kaart (plaatsen.ts + kaart.ts) ───────────────────────────────────────────
_LANDEN: frozenset[str] = frozenset(json.loads((Path(__file__).parent / "data" / "landen.json").read_text())["namen"])

_P = [
    (["hamburg"], "Hamburg", "haven", "Germany"), (["rotterdam"], "Rotterdam", "haven", "Netherlands"),
    (["jebel ali"], "Jebel Ali", "haven", "United Arab Emirates"), (["fujairah"], "Fujairah", "haven", "United Arab Emirates"),
    (["sohar"], "Sohar", "haven", "Oman"), (["mersin"], "Mersin", "haven", "Turkey"),
    (["novorossiysk"], "Novorossiysk", "haven", "Russia"), (["durban"], "Durban", "haven", "South Africa"),
    (["dar es salaam"], "Dar es Salaam", "haven", "Tanzania"), (["houston"], "Houston", "haven", "United States of America"),
    (["qinzhou"], "Qinzhou", "haven", "China"), (["shanghai"], "Shanghai", "haven", "China"),
    (["guangzhou"], "Guangzhou", "haven", "China"), (["huelva"], "Huelva", "haven", "Spain"),
    (["dubai"], "Dubai", "stad", "United Arab Emirates"), (["bangkok"], "Bangkok", "stad", "Thailand"),
    (["phichit"], "Phichit", "stad", "Thailand"), (["lampang"], "Lampang", "stad", "Thailand"),
    (["breda"], "Breda", "stad", "Netherlands"), (["london"], "London", "stad", "United Kingdom"),
    (["berlin"], "Berlin", "stad", "Germany"), (["ulm"], "Ulm", "stad", "Germany"),
    (["buchholz i.d. nordheide", "buchholz in der nordheide", "buchholz"], "Buchholz", "stad", "Germany"),
    (["istanbul"], "Istanbul", "stad", "Turkey"),
    (["darıca", "darica", "gebze", "darıca / gebze"], "Darıca / Gebze", "stad", "Turkey"),
    (["ronneby"], "Ronneby", "stad", "Sweden"), (["rome", "roma"], "Rome", "stad", "Italy"),
    (["bor"], "Bor", "stad", "Serbia"), (["warsaw", "warszawa"], "Warsaw", "stad", "Poland"),
    (["al wakra", "al wakrah"], "Al Wakra", "stad", "Qatar"),
]
PLACES: dict[str, dict] = {n: {"label": label, "kind": soort, "country": land} for namen, label, soort, land in _P for n in namen}

LAND_ALIAS = {
    "turkey": "Turkey", "türkiye": "Turkey", "turkiye": "Turkey", "republic of türkiye": "Turkey",
    "united states": "United States of America", "usa": "United States of America", "us": "United States of America",
    "uae": "United Arab Emirates",
    "drc": "Dem. Rep. Congo", "dr congo": "Dem. Rep. Congo", "democratic republic of congo": "Dem. Rep. Congo",
    "democratic republic of the congo": "Dem. Rep. Congo",
    "uk": "United Kingdom", "great britain": "United Kingdom",
    "korea": "South Korea", "republic of korea": "South Korea",
}
REGION_WORDS = ("africa", "african", "copper belt", "worldwide", "europe", "asia", "middle east", "latin america",
                "south america", "north america", "unknown", "global", "various")
_LAND_NORM = {}


def _normaal(t: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", t.lower())).strip()


for _naam in _LANDEN:
    _LAND_NORM.setdefault(_normaal(_naam), _naam)


def _los_enkel(stuk: str) -> dict | str | None:
    delen = [re.sub(r"\s+port$", "", _normaal(d)).strip() for d in stuk.split(",")]
    delen = [d for d in delen if d]
    for d in delen:
        p = PLACES.get(d)
        if p:
            return {"key": f"place:{p['label']}", "label": p["label"], "kind": p["kind"], "country": p["country"]}
    for d in delen:
        naam = LAND_ALIAS.get(d) or _LAND_NORM.get(d)
        if naam and naam in _LANDEN:
            return {"key": f"country:{naam}", "label": naam, "kind": "country", "country": naam}
    return "region" if any(any(w in d for w in REGION_WORDS) for d in delen) else None


def resolve_place(text: Any) -> tuple[dict | None, str | None]:
    """plaatsen.ts losOp: (locatie, None) of (None, reden in empty|multiple|region|unknown)."""
    if not isinstance(text, str) or not text.strip():
        return None, "empty"
    kern = re.sub(r"\bstated\b.*$", " ", re.sub(r"\([^)]*\)", " ", text), flags=re.I)
    alternatieven = [a.strip() for a in re.split(r"\s+or\s+|/|;", kern, flags=re.I) if a.strip()]
    gevonden: dict[str, dict] = {}
    regio = False
    for alt in alternatieven:
        uit = _los_enkel(alt)
        if uit == "region":
            regio = True
        elif isinstance(uit, dict):
            gevonden[uit["key"]] = uit
    if len(gevonden) > 1 or (len(gevonden) == 1 and regio):
        return None, "multiple"
    if len(gevonden) == 1:
        return next(iter(gevonden.values())), None
    return None, "region" if regio else "unknown"


_REDEN_ERNST = {"multiple": 3, "region": 2, "unknown": 1, "empty": 0}


def _eerste(velden: list[tuple[str, Any]]) -> dict:
    ergste = "empty"
    for bron, tekst in velden:
        loc, reden = resolve_place(tekst)
        if loc:
            return {"location": loc, "source": bron}
        if reden and _REDEN_ERNST[reden] > _REDEN_ERNST[ergste]:
            ergste = reden
    return {"location": None, "reason": ergste}


def _vestiging(stad: Any, land: Any) -> str | None:
    s, l = _s(stad), _s(land)
    if s and l:
        return f"{s}, {l}"
    return s or l or None


def supplier_end(d: dict) -> dict:
    return _eerste([("loading_port", d.get("loading_port")), ("origin", d.get("origin")),
                    ("establishment", _vestiging(d.get("supplier_city"), d.get("supplier_country")))])


def buyer_end(d: dict) -> dict:
    return _eerste([("destination", d.get("destination")),
                    ("establishment", _vestiging(d.get("buyer_city"), d.get("buyer_country")))])


def build_map(deals: Iterable[dict]) -> dict:
    """kaart.ts bouwKaart, zonder coördinaten. `deals` in de vorm van map_row()."""
    routes, not_placed = [], []
    counts = {"active": 0, "matched": 0, "blocked": 0, "completed": 0, "other": 0}
    blocked_active = 0
    for d in deals:
        stand = deal_state(d)
        counts[stand] += 1
        if stand == "blocked" and is_active(d):
            blocked_active += 1
        van, naar = supplier_end(d), buyer_end(d)
        if van["location"] and naar["location"]:
            routes.append({"deal_id": d["id"], "deal": deal_label(d), "state": stand,
                           "from": van["location"]["label"], "from_source": van["source"],
                           "to": naar["location"]["label"], "to_source": naar["source"],
                           "approximate": van["source"] == "establishment" or naar["source"] == "establishment"})
        else:
            kant = "both" if not van["location"] and not naar["location"] else ("supplier" if not van["location"] else "buyer")
            redenen = sorted([r for r in (van.get("reason"), naar.get("reason")) if r], key=lambda r: -_REDEN_ERNST[r])
            not_placed.append({"deal_id": d["id"], "deal": deal_label(d), "state": stand, "side": kant,
                               "reason": redenen[0] if redenen else "unknown"})
    return {"routes": routes, "not_placed": not_placed, "state_counts": counts, "blocked_and_active": blocked_active}


def map_row(opp: dict, req: dict | None, off: dict | None, buyer: dict | None, seller: dict | None) -> dict:
    """De velden die northsea.py 'kaart' per deal levert, onder Engelse namen."""
    req, off, buyer, seller = req or {}, off or {}, buyer or {}, seller or {}
    return {**{k: opp.get(k) for k in ("id", "stage", "execution_state", "primary_blocker", "deal_priority", "approval_required",
                                       "readiness_score", "commission_rate", "commission_amount", "estimated_value", "currency",
                                       "created_at", "updated_at")},
            "product": off.get("product") or req.get("product") or off.get("commodity") or req.get("commodity"),
            "origin": off.get("origin"), "loading_port": off.get("loading_port"), "destination": req.get("destination"),
            "supplier_country": seller.get("country"), "supplier_city": seller.get("city"),
            "buyer_country": buyer.get("country"), "buyer_city": buyer.get("city"),
            "volume_mt": off.get("quantity_mt") or req.get("quantity_mt")}


# ── Kaartjes bovenin (desk.ts: deskTellers) ─────────────────────────────────
_WEEK_S = 7 * 24 * 3600


def _ts(v: Any) -> float:
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return 0.0


def _getal(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) != float("inf") else None


def desk_counters(deals: list[dict], now: datetime) -> dict:
    t = now.timestamp()
    open_deals = [d for d in deals if is_open(d)]
    wachten = [d for d in open_deals if d.get("approval_required")]
    bedragen = [n for n in (_getal(d.get("commission_amount")) for d in open_deals) if n is not None]
    return {
        "active": sum(1 for d in deals if is_active(d)),
        "pipeline": len(open_deals),
        "won": sum(1 for d in deals if _s(d.get("stage")) == "won"),
        "new_active_this_week": sum(1 for d in deals if is_active(d) and t - _ts(d.get("created_at")) < _WEEK_S),
        "awaiting_approval": len(wachten),
        "blocked": sum(1 for d in open_deals if is_blocked(d)),
        "commission_amount_sum": sum(bedragen) if bedragen else None,
        "deals_with_commission_amount": len(bedragen),
    }


# ── AXE Chase (chase.ts) ─────────────────────────────────────────────────────
_GENERIEK = {"resolve current primary blocker"}
_SOORT = {"qualify_match": "Qualify match", "qualification": "Qualification", "review_supplier_reply": "Supplier reply",
          "source_verification": "Source verification", "follow_up": "Follow-up", "resolve_blocker": "Blocker",
          "parallel_qualification": "Parallel qualification"}


def _soort(s: Any) -> str:
    if not s:
        return "Action"
    return _SOORT.get(s) or str(s).replace("_", " ").capitalize()


def chase_item(r: dict, source: str, now: datetime) -> dict:
    """chase.ts naarItem. `r` in de vorm van northsea.py acties/taken/concepten/bounces."""
    t = now.timestamp()
    prio = int(_getal(r.get("priority")) or 0)
    wanneer = r.get("updated_at") or r.get("created_at")
    verlopen = bool(r.get("due_at")) and _ts(r.get("due_at")) < t and _ts(r.get("due_at")) > 0
    code = r.get("code")
    kop = code.strip() if is_deal_code(code) else ("Email Failure" if source == "bounce" else (_s(r.get("product")) or _soort(r.get("kind"))))
    partijen = " ↔ ".join([x for x in (_s(r.get("buyer")), _s(r.get("supplier"))) if x]) or None
    titel = _s(r.get("title"))
    if source == "bounce":
        aan = r.get("to")
        adres = aan[0] if isinstance(aan, list) and aan else (aan if isinstance(aan, str) else None)
        regel = f"{partijen or adres or 'Outbound email'} bounced"
    else:
        regel = titel if titel and titel.lower() not in _GENERIEK else (_s(r.get("blocker")) or partijen or _soort(r.get("kind")))
    kritiek = prio >= 90
    if source == "bounce":
        stand, toon, kritiek = "Find alternative contact", "red", True
    elif r.get("error"):
        stand, toon, kritiek = "Execution failed", "red", True
    elif verlopen:
        stand, toon, kritiek = "Follow up required", "red", True
    elif r.get("requires_approval"):
        stand, toon = "Approval required", "amber"
    elif source == "draft":
        stand, toon = ("Draft ready · sensitive", "amber") if r.get("sensitive") else ("Draft ready", "green")
    elif r.get("status") == "waiting":
        stand, toon = "Waiting for reply", "amber"
    else:
        stand, toon = (_s(r.get("next_action")) or _soort(r.get("kind"))), "green"
    return {"id": f"{source}:{r.get('id')}", "record_id": r.get("id"), "source": source, "headline": kop, "line": regel,
            "state": stand, "tone": toon, "critical": kritiek,
            "new": 0 < t - _ts(r.get("created_at") or wanneer) < 86400, "overdue": verlopen,
            "when": wanneer, "priority": prio, "deal_id": r.get("deal_id")}


def sort_chase(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda i: (not i["critical"], -i["priority"], -_ts(i["when"])))


CHASE_RULES = [
    "bounce -> 'Find alternative contact' (red, critical)", "execution_error -> 'Execution failed' (red, critical)",
    "due_at in the past -> 'Follow up required' (red, critical)", "requires_approval -> 'Approval required' (amber)",
    "pending draft, sensitive -> 'Draft ready · sensitive' (amber)", "pending draft -> 'Draft ready' (green)",
    "status waiting -> 'Waiting for reply' (amber)", "otherwise -> the deal's next action (green)",
    "priority >= 90 is also critical; new = created in the last 24h",
    "Source: src/domain/northsea/chase.ts. Inputs: action_queue (open/waiting), deal_tasks (open), reply_drafts "
    "(pending, unsent), communications (bounced, last 30 days).",
]


# ── Verificatie (tabs/status.ts) ─────────────────────────────────────────────
COMPANY_VERIFICATION = {
    "verified": "Verified against an independent source.",
    "reviewing": "Being checked; NOT verified yet.",
    "unverified": "No verification done yet.",
    "rejected": "Verification failed.",
}
_BEWIJS_GROEN = {"verified", "source_verified", "confirmed"}
_BEWIJS_ROOD = {"rejected", "contradicted", "failed", "expired", "invalid"}
_BEWIJS_GEEL = {"partial", "partially_corroborated", "counterparty_stated", "reviewing", "under_review", "pending"}


def evidence_class(status: Any) -> str:
    """verified | contradicted | partial | unverified -- only 'verified' may be presented as verified."""
    s = _s(status).lower()
    if s in _BEWIJS_GROEN:
        return "verified"
    if s in _BEWIJS_ROOD:
        return "contradicted"
    if s in _BEWIJS_GEEL:
        return "partial"
    return "unverified"


# ── Integriteit: testcases en do-not-contact ────────────────────────────────
KNOWN_TESTCASE_REQUIREMENTS = {"7c328c1a-fd41-4592-86bb-de954a384e2b"}
KNOWN_DO_NOT_CONTACT_COMPANIES = {"2991d3a0-e15e-4158-b7b8-9a798d3b9476", "f5008747-2a96-4c84-b308-e7ae4670ee2f"}
_TEST_MARKERS = re.compile(r"\bSTRATO TEST CALL\b|\bsynthetic\b.{0,40}\btest\b|\binternal test ?case\b", re.I)
_DNC_MARKERS = re.compile(r"declined intermediary|rejected intermediary|do[- ]not[- ]contact|no intermediar", re.I)


def testcase_reason(record: dict, company: dict | None = None) -> str | None:
    """Waarom een vraag/aanbod/bedrijf een interne test is, of None.

    Canoniek sinds P0 (2026-09-16): de kolom is_synthetic. De bekende id en de
    tekstmarkeringen blijven als vangnet voor rijen van vóór die kolom."""
    if record.get("is_synthetic") is True:
        return f"Synthetic/test record (is_synthetic): {record.get('synthetic_reason') or 'no reason recorded'}"
    if (company or {}).get("is_synthetic") is True:
        return f"Synthetic/test counterparty (is_synthetic): {(company or {}).get('synthetic_reason') or 'no reason recorded'}"
    if str(record.get("id")) in KNOWN_TESTCASE_REQUIREMENTS:
        return "Known internal testcase (STRATO/Jasmine test call, Hamburg). Not genuine demand."
    for veld in ("evidence", "notes", "documentation"):
        tekst = record.get(veld)
        tekst = json.dumps(tekst) if isinstance(tekst, (dict, list)) else tekst
        if isinstance(tekst, str) and _TEST_MARKERS.search(tekst):
            return f"Marked as test in {veld}: '{_TEST_MARKERS.search(tekst).group(0)}'."
    naam = _s((company or {}).get("company_name"))
    if naam.lower().startswith("test "):
        return f"Company name starts with 'Test' ({naam})."
    return None


def do_not_contact_reason(company: dict | None) -> str | None:
    """Machine-afgedwongen do-not-contact: companies.contact_policy (sinds P0). De database weigert
    elk uitgaand pad naar zo'n partij. Bekende ABAKUS-id's blijven vangnet voor oude snapshots."""
    if not company:
        return None
    if company.get("contact_policy") == "do_not_contact":
        return f"contact_policy=do_not_contact: {company.get('contact_policy_reason') or 'no reason recorded'}"
    if "contact_policy" not in company and str(company.get("id")) in KNOWN_DO_NOT_CONTACT_COMPANIES:
        return "ABAKUS explicitly declined intermediary involvement (inbound reply 2026-09-12). Do not contact."
    return None


def contact_review_reason(company: dict | None) -> str | None:
    """review_required (automatisering geblokkeerd, mens beslist), of een notitie die op
    geen-tussenpersoon/niet-contacteren wijst zonder dat het beleid al is gezet."""
    if not company or do_not_contact_reason(company):
        return None
    if company.get("contact_policy") == "review_required":
        return f"contact_policy=review_required: {company.get('contact_policy_reason') or 'no reason recorded'}"
    notes = company.get("notes")
    if isinstance(notes, str) and _DNC_MARKERS.search(notes):
        return f"Notes say: '{_DNC_MARKERS.search(notes).group(0)}' — contact policy not set; needs Luka's review."
    return None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
