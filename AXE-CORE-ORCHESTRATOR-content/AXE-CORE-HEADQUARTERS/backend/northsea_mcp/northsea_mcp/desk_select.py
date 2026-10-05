"""Welke deals de desk-run mag aanraken.

De operations-sweep (3 deals per ~30 min) behandelde tot 5 okt 2026 élke open
opportunity als levend werk: stage `identified` telde mee, park-staat werd
genegeerd, en marketplace-papiermatches zonder mail kregen opnieuw een qualify-
taak plus een missing-input-note. De operator had die backlog al geparkeerd
(`result`/`metadata`.parked_reason = backlog_park_marketplace_qualify).

Twee onafhankelijke redenen om over te slaan:

1. Bestaande deal_tasks of action_queue met een park-markering (waiting/open).
2. Oude, nooit-aangesproken marketplace-papiermatches (stage identified, geen
   communicatie, bron is een marktplaats of 'paper match').

Levende deals — mail op de file, of geen marketplace-papier — blijven in de
selectie. Recente crew_run-audits (12 uur) roteren het werk zoals voorheen.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

OPEN_STATUSES = frozenset({"open", "waiting", "in_progress"})
CLOSED_STAGES = frozenset({"won", "lost", "closed", "cancelled"})
OPERATIONS_BATCH = 3
CREW_ROTATION = timedelta(hours=12)

# Hosts die in de Commodities-data als marktplaats-bron staan (Freshdi, Go4WB,
# EximNext, TradeWheel). Geen goklijst: gemeten op de 5-okt-resurrecties.
MARKETPLACE_HOSTS = (
    "go4worldbusiness.com",
    "freshdi.com",
    "eximnext.com",
    "tradekey.com",
    "alibaba.com",
    "tradewheel.com",
    "ec21.com",
)

_MARKT_TEKST = re.compile(
    r"marketplace|paper match|public web listing|trade leads?",
    re.I,
)

_PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}


def _s(v: Any) -> str:
    return str(v or "").strip()


def park_reason(row: dict[str, Any] | None) -> str | None:
    """parked_reason staat op deal_tasks.result of action_queue.metadata."""
    if not isinstance(row, dict):
        return None
    for blob in (row.get("result"), row.get("metadata")):
        if not isinstance(blob, dict):
            continue
        reden = blob.get("parked_reason")
        if isinstance(reden, str) and reden.strip():
            return reden.strip()
    return None


def is_parked(row: dict[str, Any] | None) -> bool:
    if park_reason(row) is None:
        return False
    return _s(row.get("status")).lower() in OPEN_STATUSES  # type: ignore[union-attr]


def row_opportunity_id(row: dict[str, Any] | None) -> str | None:
    """opportunity_id, of deal_id in metadata — missing-input-notes zetten die
    extra omdat _lege_run tot deze fix opportunity_id=None schreef."""
    if not isinstance(row, dict):
        return None
    oid = row.get("opportunity_id")
    if oid:
        return str(oid)
    meta = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    deal = meta.get("deal_id")
    return str(deal) if deal else None


def parked_opportunity_ids(tasks: list[dict], queue: list[dict]) -> set[str]:
    ids: set[str] = set()
    for row in (*tasks, *queue):
        if not is_parked(row):
            continue
        oid = row_opportunity_id(row)
        if oid:
            ids.add(oid)
    return ids


def engaged_opportunity_ids(communications: list[dict]) -> set[str]:
    return {str(c["opportunity_id"]) for c in communications if c.get("opportunity_id")}


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except ValueError:
        return ""


def is_marketplace_sourced(opp: dict[str, Any], companies: list[dict[str, Any]]) -> bool:
    stukken = [
        _s(opp.get("notes")),
        _s(opp.get("next_action")),
        _s(opp.get("primary_blocker")),
    ]
    meta = opp.get("execution_metadata") if isinstance(opp.get("execution_metadata"), dict) else {}
    stukken.append(_s(meta.get("source")))
    urls = [_s(meta.get("source_url"))]
    for co in companies:
        stukken.append(_s(co.get("company_name")))
        urls.append(_s(co.get("source_url")))
        urls.append(_s(co.get("website")))
    tekst = " ".join(stukken)
    if _MARKT_TEKST.search(tekst):
        return True
    if _s(meta.get("source")).lower() in {"public web", "marketplace"}:
        return True
    for url in urls:
        host = _host(url)
        if host and any(host == h or host.endswith("." + h) for h in MARKETPLACE_HOSTS):
            return True
    return False


def companies_of_opportunity(
    opp: dict[str, Any],
    *,
    companies: dict[str, dict] | None = None,
    requirements: dict[str, dict] | None = None,
    offers: dict[str, dict] | None = None,
) -> list[dict[str, Any]]:
    """Bedrijven van deze deal: genest op de opportunity, of via req/offer-id."""
    gevonden: list[dict[str, Any]] = []
    gezien: set[str] = set()

    def _neem(co: dict[str, Any] | None) -> None:
        if not isinstance(co, dict):
            return
        cid = str(co.get("id") or "")
        if cid and cid in gezien:
            return
        if cid:
            gezien.add(cid)
        gevonden.append(co)

    for blob in (opp.get("buyer_requirements"), opp.get("supplier_offers")):
        if isinstance(blob, dict):
            _neem(blob.get("companies") if isinstance(blob.get("companies"), dict) else None)

    reqs = requirements or {}
    offs = offers or {}
    by_id = companies or {}
    req = reqs.get(opp.get("buyer_requirement_id")) or {}
    off = offs.get(opp.get("supplier_offer_id")) or {}
    for blob in (req, off):
        if isinstance(blob.get("companies"), dict):
            _neem(blob["companies"])
        cid = blob.get("company_id")
        if cid and cid in by_id:
            _neem(by_id[cid])
    return gevonden


def is_stale_marketplace_paper(
    opp: dict[str, Any],
    *,
    companies: list[dict[str, Any]],
    has_comms: bool,
) -> bool:
    """Identified, nooit mail, marktplaats/paper — geen levend dossier."""
    if has_comms or opp.get("is_synthetic"):
        return False
    if _s(opp.get("stage")).lower() != "identified":
        return False
    return is_marketplace_sourced(opp, companies)


def skip_desk_run(
    opp: dict[str, Any],
    *,
    parked_ids: set[str],
    companies: list[dict[str, Any]],
    engaged_ids: set[str],
) -> str | None:
    oid = str(opp.get("id") or "")
    if oid and oid in parked_ids:
        return "parked"
    if is_stale_marketplace_paper(opp, companies=companies, has_comms=oid in engaged_ids):
        return "stale_marketplace_paper"
    return None


def recent_crew_opportunity_ids(audits: list[dict], *, now: datetime, window: timedelta = CREW_ROTATION) -> set[str]:
    cutoff = now - window
    recent: set[str] = set()
    for a in audits:
        if a.get("action") != "crew_run" or not a.get("opportunity_id"):
            continue
        try:
            when = datetime.fromisoformat(str(a.get("occurred_at") or "").replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if when >= cutoff:
            recent.add(str(a["opportunity_id"]))
    return recent


def _open_pool(opportunities: list[dict]) -> list[dict]:
    return [
        o for o in opportunities
        if not o.get("is_synthetic")
        and _s(o.get("stage")).lower() not in CLOSED_STAGES
    ]


def select_operations_deals(
    opportunities: list[dict],
    *,
    audits: list[dict],
    tasks: list[dict],
    queue: list[dict],
    communications: list[dict],
    companies: list[dict],
    requirements: list[dict],
    offers: list[dict],
    now: datetime,
    limit: int = OPERATIONS_BATCH,
) -> dict[str, Any]:
    """Kies tot `limit` deals voor de operations-sweep.

    Slaat geparkeerde en stale marketplace-papier over vóór de 12-uursrotatie,
    zodat die rotatie niet drie paper-matches per run blijft oppikken.
    """
    parked_ids = parked_opportunity_ids(tasks, queue)
    engaged_ids = engaged_opportunity_ids(communications)
    co_by_id = {c["id"]: c for c in companies if c.get("id")}
    req_by_id = {r["id"]: r for r in requirements if r.get("id")}
    off_by_id = {o["id"]: o for o in offers if o.get("id")}
    recent = recent_crew_opportunity_ids(audits, now=now)

    pool = _open_pool(opportunities)
    skipped = {"parked": 0, "stale_marketplace_paper": 0}
    eligible: list[dict] = []
    for o in pool:
        partijen = companies_of_opportunity(
            o, companies=co_by_id, requirements=req_by_id, offers=off_by_id,
        )
        reden = skip_desk_run(o, parked_ids=parked_ids, companies=partijen, engaged_ids=engaged_ids)
        if reden:
            skipped[reden] = skipped.get(reden, 0) + 1
            continue
        eligible.append(o)

    eligible.sort(key=lambda o: (
        str(o.get("id")) in recent,
        _PRIORITY_RANK.get(_s(o.get("deal_priority")).upper(), 2),
        -int(o.get("readiness_score") or 0),
        str(o.get("updated_at") or ""),
    ))
    gekozen = [o for o in eligible if str(o.get("id")) not in recent][:limit]
    return {
        "chosen": gekozen,
        "active": pool,
        "eligible": eligible,
        "recent": recent,
        "skipped": skipped,
        "parked_ids": parked_ids,
        "engaged_ids": engaged_ids,
    }


# Per-deal desk-run-notes: geen datum in de sleutel, anders maakt elke dag een
# nieuwe missing-input-note aan terwijl de vorige nog waiting/geparkeerd is.
# Dagelijkse heartbeat-notes (engine idle, discovery, ops-idle) houden de datum.
_PER_DEAL_KIND = ("missing:", "wait:", "missing-opp:")


def desk_run_dedupe_key(kind: str, dag: str) -> str:
    if kind.startswith(_PER_DEAL_KIND):
        return f"desk-run:{kind}"
    return f"desk-run:{kind}:{dag}"
