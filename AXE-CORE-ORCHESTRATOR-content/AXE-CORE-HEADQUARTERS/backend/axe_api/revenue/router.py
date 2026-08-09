"""HTTP surface for the Demand Fusion Engine — mounted at /revenue by main.py.

Same contract as the rest of axe_api: bearer-authed at the include site, JSON
in and out, and no route that quietly does something irreversible. Nothing here
publishes to any platform or charges any card; the engine produces artifacts
and decisions, a human ships them.

State lives in the JSON store (REVENUE_STATE_PATH). On the VPS, where Supabase
credentials are present, it mirrors to `core_revenue_*` — see store.py.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import distribution, fusion, ledger, loop, offers, packs
from . import signals as harvesters
from .models import LedgerEntry, stable_id
from .store import JsonStore, SupabaseStore

log = logging.getLogger("axe_core_api.revenue")

router = APIRouter()

_store_singleton: Optional[JsonStore] = None


def _supabase_client() -> Any:
    """Reuse main.py's service-role client when we are running inside axe_api;
    return None when running standalone (CLI, tests) so the JSON store is used
    on its own."""
    try:
        import main  # type: ignore

        return main.sb()
    except Exception:  # noqa: BLE001 — standalone is a supported mode, not an error
        return None


def get_store() -> JsonStore:
    global _store_singleton
    if _store_singleton is None:
        client = _supabase_client() if os.environ.get("SUPABASE_URL") else None
        _store_singleton = SupabaseStore(client) if client else JsonStore()
        log.info(
            "revenue store ready: %s (%s)",
            _store_singleton.path,
            "supabase-mirrored" if client else "local only",
        )
    return _store_singleton


def reset_store(store: Optional[JsonStore] = None) -> None:
    """Test seam — swap the singleton for a temp-file store."""
    global _store_singleton
    _store_singleton = store


# ── request bodies ────────────────────────────────────────────────────────────

class HarvestBody(BaseModel):
    queries: list[str] = Field(default_factory=list)
    packs: list[str] = Field(default_factory=list)
    sources: Optional[list[str]] = None
    offline: bool = False


class FuseBody(BaseModel):
    min_cluster_size: int = 2
    threshold: float = fusion.JACCARD_THRESHOLD


class OfferBody(BaseModel):
    cluster_id: Optional[str] = None
    target_cents: Optional[int] = None
    conversion_rate: Optional[float] = None
    price_multiplier: float = 1.0


class PlanBody(BaseModel):
    offer_id: Optional[str] = None
    identity: str
    base_url: str
    channels: Optional[list[str]] = None
    tier_rungs: Optional[list[str]] = None
    postal_address: str = ""


class LedgerBody(BaseModel):
    offer_id: str
    tier_id: str
    channel: str
    reach: int = 0
    clicks: int = 0
    sales: int = 0
    revenue_cents: int = 0
    cost_cents: int = 0
    effort_minutes: int = 0
    note: str = ""
    occurred_at: Optional[str] = None


class CycleBody(BaseModel):
    queries: list[str] = Field(default_factory=list)
    sources: Optional[list[str]] = None
    offline: bool = False
    packs: list[str] = Field(default_factory=list)
    identity: str = ""
    base_url: str = ""
    channels: Optional[list[str]] = None
    effort_units: int = 10


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def revenue_status():
    return loop.status(get_store())


def _expand(queries: list[str], pack_names: list[str]) -> list[str]:
    """Explicit queries plus pack expansions, deduped, order preserved."""
    out = list(queries)
    for name in pack_names:
        try:
            out.extend(packs.pack_queries(name))
        except KeyError as e:
            raise HTTPException(400, str(e))
    seen: set[str] = set()
    return [q for q in out if not (q in seen or seen.add(q))]


@router.get("/packs")
async def revenue_packs():
    return {"packs": packs.describe_packs()}


@router.get("/channels")
async def revenue_channels():
    return {"channels": [distribution.channel_brief(c) for c in sorted(distribution.CHANNELS)]}


@router.post("/harvest")
async def revenue_harvest(body: HarvestBody):
    store = get_store()
    if body.offline:
        found = harvesters.harvest_offline()
        warnings = ["offline mode: seed corpus, NOT live market evidence"]
    else:
        queries = _expand(body.queries, body.packs)
        if not queries:
            raise HTTPException(400, "queries or packs required unless offline=true")
        found, warnings = await harvesters.harvest_live(queries, sources=body.sources)
    added = store.put_signals(found)
    store.save()
    return {"harvested": len(found), "new": added, "warnings": warnings}


@router.post("/fuse")
async def revenue_fuse(body: FuseBody):
    store = get_store()
    clusters = fusion.fuse(
        store.signals(), min_cluster_size=body.min_cluster_size, threshold=body.threshold
    )
    store.put_clusters(clusters)
    store.save()
    return {
        "count": len(clusters),
        "clusters": [{**c.to_dict(), "explanation": fusion.explain(c)} for c in clusters],
    }


@router.get("/clusters")
async def revenue_clusters():
    clusters = get_store().clusters()
    return {
        "count": len(clusters),
        "clusters": [{**c.to_dict(), "explanation": fusion.explain(c)} for c in clusters],
    }


@router.post("/offers")
async def revenue_offers(body: OfferBody):
    store = get_store()
    clusters = store.clusters()
    if not clusters:
        raise HTTPException(409, "no clusters yet — POST /revenue/harvest then /revenue/fuse")
    cluster = next((c for c in clusters if c.id == body.cluster_id), None) if body.cluster_id else clusters[0]
    if cluster is None:
        raise HTTPException(404, f"cluster '{body.cluster_id}' not found")

    stack = offers.build_stack(cluster, price_multiplier=body.price_multiplier)
    store.put_offers([stack])
    store.save()
    target = body.target_cents or store.target_cents
    return {
        "offer": stack.to_dict(),
        "audit": offers.audit_stack(stack),
        "target_cents": target,
        "routes": [
            {**r, "description": offers.describe_route(r, target)}
            for r in offers.path_to_target(stack, target, conversion_rate=body.conversion_rate)
        ],
    }


@router.post("/plan")
async def revenue_plan(body: PlanBody):
    store = get_store()
    stacks = store.offers()
    if not stacks:
        raise HTTPException(409, "no offer stacks yet — POST /revenue/offers first")
    stack = next((s for s in stacks if s.id == body.offer_id), None) if body.offer_id else stacks[0]
    if stack is None:
        raise HTTPException(404, f"offer '{body.offer_id}' not found")

    clusters = {c.id: c for c in store.clusters()}
    cluster = clusters.get(stack.cluster_id)
    questions = loop._questions_for(cluster, store.signals()) if cluster else [stack.positioning]

    try:
        assets, warnings = distribution.build_plan(
            stack, questions, identity=body.identity, base_url=body.base_url,
            channels=body.channels, tier_rungs=body.tier_rungs,
            postal_address=body.postal_address,
        )
    except distribution.DistributionError as e:
        # A plan-level violation (two identities on one channel) is a client
        # error, not a server fault — say exactly what broke.
        raise HTTPException(400, str(e))

    if not assets and warnings:
        # Every asset was rejected (missing identity, banned claim, …). Returning
        # 200 with an empty list reads as "nothing to do" when it actually means
        # "your request was unusable".
        raise HTTPException(400, "; ".join(warnings[:5]))

    store.put_assets(assets)
    store.save()
    return {
        "count": len(assets),
        "assets": [a.to_dict() for a in assets],
        "warnings": warnings,
    }


@router.post("/ledger")
async def revenue_ledger_add(body: LedgerBody):
    if body.channel not in distribution.CHANNELS:
        raise HTTPException(400, f"unknown channel '{body.channel}'")
    store = get_store()
    entry = LedgerEntry(
        id=stable_id("led", body.offer_id, body.tier_id, body.channel, body.occurred_at or ""),
        offer_id=body.offer_id,
        tier_id=body.tier_id,
        channel=body.channel,
        reach=body.reach,
        clicks=body.clicks,
        sales=body.sales,
        revenue_cents=body.revenue_cents,
        cost_cents=body.cost_cents,
        effort_minutes=body.effort_minutes,
        note=body.note,
        **({"occurred_at": body.occurred_at} if body.occurred_at else {}),
    )
    store.put_ledger([entry])
    store.save()
    entries = store.ledger()
    return {
        "entry": entry.to_dict(),
        "totals": ledger.totals(entries),
        "decisions": ledger.decisions(entries),
    }


@router.get("/ledger")
async def revenue_ledger_list():
    entries = get_store().ledger()
    return {
        "count": len(entries),
        "entries": [e.to_dict() for e in entries],
        "totals": ledger.totals(entries),
        "decisions": ledger.decisions(entries),
    }


@router.get("/projection")
async def revenue_projection(target_cents: Optional[int] = None):
    store = get_store()
    return ledger.project_to_target(store.ledger(), target_cents or store.scale_target_cents)


@router.post("/cycle")
async def revenue_cycle(body: CycleBody):
    store = get_store()
    warnings: list[str] = []
    if body.offline:
        found = harvesters.harvest_offline()
        warnings.append("offline mode: seed corpus, NOT live market evidence")
    elif _expand(body.queries, body.packs):
        found, warnings = await harvesters.harvest_live(
            _expand(body.queries, body.packs), sources=body.sources
        )
    else:
        found = []
        warnings.append("no queries/packs and not offline: reusing stored signals only")

    report = loop.run_cycle(
        store,
        new_signals=found,
        identity=body.identity,
        base_url=body.base_url,
        channels=body.channels,
        effort_units=body.effort_units,
        warnings=warnings,
    )
    return {"report": report.to_dict(), "allocation": store.data.get("last_allocation", [])}
