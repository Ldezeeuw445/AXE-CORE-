"""One turn of the whole engine.

    harvest → fuse → stack → distribute → measure → reallocate → checklist

`run_cycle()` is deliberately synchronous and side-effect-light: it reads the
store, computes, writes once, and returns a `LoopReport` whose `next_actions`
is an ordered list of things a human does today. The loop does not post
anything anywhere — publishing is a human action with a human's account behind
it, and an engine that auto-posts is an engine that gets its accounts banned
while its operator sleeps.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Sequence

from . import distribution, fusion, ledger, offers, signals as harvesters
from .models import LoopReport, now_iso
from .store import JsonStore

DEFAULT_TARGET_CENTS = 33_000     # the first $330
DEFAULT_SCALE_CENTS = 900_000     # the $9,000/month run-rate


def run_cycle(
    store: JsonStore,
    new_signals: Optional[Sequence] = None,
    identity: str = "",
    base_url: str = "",
    channels: Optional[Sequence[str]] = None,
    effort_units: int = 10,
    now: Optional[datetime] = None,
    warnings: Optional[list[str]] = None,
) -> LoopReport:
    """Run one cycle against whatever state and signals exist.

    `new_signals` is injected rather than harvested here so the caller decides
    between live and offline — `run_cycle` itself never touches the network,
    which is what makes it testable and what keeps a network blip from
    corrupting a cycle halfway through.
    """
    now = now or datetime.now(timezone.utc)
    warn: list[str] = list(warnings or [])
    actions: list[str] = []

    # 1 — harvest (already done by the caller; we just record it)
    added = store.put_signals(list(new_signals or []))
    all_signals = store.signals()

    # 2 — fuse
    clusters = fusion.fuse(all_signals, now=now)
    store.put_clusters(clusters)
    if not clusters:
        warn.append(
            "no clusters formed — either the harvest was empty/blocked, or every "
            "signal was a one-off. Widen the queries before drawing any conclusion."
        )

    # 3 — stack offers for the top clusters
    top = clusters[:3]
    stacks = [offers.build_stack(c) for c in top]
    store.put_offers(stacks)
    for stack in stacks:
        for problem in offers.audit_stack(stack):
            warn.append(f"{stack.product_name}: {problem}")

    # 4 — distribution assets for the single best cluster only
    assets = []
    if stacks and identity and base_url:
        best_cluster = top[0]
        questions = _questions_for(best_cluster, all_signals)
        assets, plan_warnings = distribution.build_plan(
            stacks[0], questions, identity=identity, base_url=base_url, channels=channels
        )
        store.put_assets(assets)
        warn.extend(plan_warnings)
    elif stacks:
        warn.append(
            "no distribution assets built — pass identity= and base_url= "
            "(the handle you post under and the page the tracked link points at)."
        )

    # 5 — measure what already ran
    entries = store.ledger()
    rows = ledger.decisions(entries)
    tot = ledger.totals(entries)
    allocation = ledger.allocate(effort_units, rows)

    # 6 — the checklist
    target = store.target_cents
    progress = min(tot["revenue_cents"] / target, 1.0) if target else 0.0

    if stacks:
        stack = stacks[0]
        cvr = _observed_cvr(rows)
        routes = offers.path_to_target(stack, target - tot["revenue_cents"], conversion_rate=cvr)
        if routes:
            actions.append(
                "Fastest remaining route to the target: "
                + offers.describe_route(routes[0], target - tot["revenue_cents"])
                + ("" if cvr else " (no conversion data yet — reach figure unavailable until sales are recorded)")
            )
        actions.append(
            f"Build the tripwire for “{stack.product_name}” today: "
            + "; ".join(stack.tiers[0].deliverables[:2])
        )
    if assets:
        by_channel: dict[str, int] = {}
        for a in assets:
            by_channel[a.channel] = by_channel.get(a.channel, 0) + 1
        actions.append(
            "Publish today (respecting each channel's warm-up and cap): "
            + ", ".join(f"{n}× {ch}" for ch, n in sorted(by_channel.items()))
        )
    for row in rows:
        if row["decision"] == "scale":
            actions.append(f"SCALE {row['channel']} — {row['reason']}")
        elif row["decision"] == "kill":
            actions.append(f"KILL {row['channel']} — {row['reason']}")
    if not entries:
        actions.append(
            "Record every result in the ledger (`revenue ledger add`) — reach, clicks, "
            "sales. Until something is recorded, the loop cannot tell you what to multiply."
        )

    report = LoopReport(
        cycle=store.bump_cycle(),
        ran_at=now_iso(),
        signals_harvested=added,
        clusters_formed=len(clusters),
        top_cluster_id=clusters[0].id if clusters else None,
        offers_built=len(stacks),
        assets_queued=len(assets),
        revenue_cents_to_date=tot["revenue_cents"],
        target_cents=target,
        target_progress=round(progress, 4),
        decisions=rows,
        next_actions=actions,
        warnings=warn,
    )
    store.append_report(report.to_dict())
    store.data["last_allocation"] = allocation
    store.save()
    return report


def _questions_for(cluster, all_signals, limit: int = 4) -> list[str]:
    """The real sentences behind a cluster — used as asset headlines so the
    copy matches what people actually typed."""
    by_id = {s.id: s for s in all_signals}
    titles = [by_id[i].title for i in cluster.signal_ids if i in by_id and by_id[i].title]
    return titles[:limit] or [cluster.label]


def _observed_cvr(rows: Sequence[dict]) -> Optional[float]:
    """Overall click→sale rate across everything recorded, or None when there
    is not enough traffic to have an opinion."""
    clicks = sum(r["clicks"] for r in rows)
    sales = sum(r["sales"] for r in rows)
    if clicks < ledger.MIN_CLICKS_FOR_CVR:
        return None
    return sales / clicks if clicks else None


def status(store: JsonStore, now: Optional[datetime] = None) -> dict:
    """Everything the dashboard needs in one call."""
    entries = store.ledger()
    tot = ledger.totals(entries)
    clusters = store.clusters()
    return {
        "cycle": store.cycle,
        "targets": {
            "first_cents": store.target_cents,
            "scale_cents": store.scale_target_cents,
        },
        "totals": tot,
        "progress_to_first_target": round(
            min(tot["revenue_cents"] / store.target_cents, 1.0), 4
        ) if store.target_cents else 0.0,
        "top_clusters": [
            {**c.to_dict(), "explanation": fusion.explain(c)} for c in clusters[:5]
        ],
        "decisions": ledger.decisions(entries),
        "allocation": store.data.get("last_allocation", []),
        "projection": ledger.project_to_target(entries, store.scale_target_cents, now=now),
        "last_report": (store.data.get("reports") or [None])[-1],
    }
