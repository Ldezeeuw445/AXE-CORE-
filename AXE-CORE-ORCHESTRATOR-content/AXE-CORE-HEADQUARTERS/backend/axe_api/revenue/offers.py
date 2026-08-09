"""Micro-offer stacking — turn one demand cluster into a priced ladder.

The stack exists because a cold buyer will not hand a stranger $199, but a lot
of them will risk $19 on a thing that solves the exact sentence they wrote
last Tuesday. Every rung is a real, separately-deliverable artifact:

    tripwire  $9–29    an artifact they can use in 10 minutes, no call
    core      $39–89   the artifact plus the thing that makes it work on
                       *their* data
    stack     $99–199  done-with-you: their setup, their edge cases
    depth     $249–599 done-for-you, one-off, capped scope
    retainer  $99+/mo  the part that turns a spike into a floor

Two guardrails live here, because they are the two ways this fails:
`audit_stack()` flags rungs whose fulfilment time makes the price a bad wage,
and `path_to_target()` is honest arithmetic — it says how many units and how
much reach the target actually needs, so "$330 fast" turns into "11 tripwire
sales, ~1,100 qualified readers at 1%" instead of a mood.
"""

from __future__ import annotations

import math
import statistics
from typing import Optional, Sequence

from .models import DemandCluster, OfferStack, OfferTier, stable_id

# (rung, default price cents, default fulfilment minutes, share of promise)
RUNG_DEFAULTS: list[tuple[str, int, int]] = [
    ("tripwire", 1900, 25),
    ("core", 4900, 60),
    ("stack", 14900, 150),
    ("depth", 39900, 360),
    ("retainer", 9900, 90),
]

# Below this, the rung is a bad trade for a solo operator: it is not a business,
# it is a hobby with extra steps. $25/h floor, expressed in cents.
MIN_EFFECTIVE_HOURLY_CENTS = 2500


def _titlecase(words: Sequence[str], n: int = 2) -> str:
    return " ".join(w.capitalize() for w in list(words)[:n] if w)


def product_name(cluster: DemandCluster) -> str:
    """A faceless product name from the cluster's own vocabulary.

    Deliberately boring and descriptive. A buyer searching their problem should
    recognise their own words; nobody needs another invented brand.
    """
    head = _titlecase(cluster.keywords, 2) or "Demand"
    return f"{head} Fix Kit"


def anchor_price_cents(cluster: DemandCluster) -> Optional[int]:
    """If people stated budgets, that is the market talking — use the median
    rather than a guess. One stated budget is an anecdote; the median of
    several is a price."""
    if not cluster.stated_budgets_cents:
        return None
    return int(statistics.median(cluster.stated_budgets_cents))


def _deliverables(rung: str, cluster: DemandCluster) -> list[str]:
    """Concrete artifacts per rung, phrased in the cluster's own nouns so the
    operator knows exactly what to build tonight."""
    topic = " / ".join(cluster.keywords[:3]) or cluster.label
    if rung == "tripwire":
        return [
            f"1-page diagnostic checklist for: {topic}",
            "The 5 failure modes, each with the exact symptom to look for",
            "Copy-paste starter file (spreadsheet or script) they can run today",
        ]
    if rung == "core":
        return [
            f"The full {topic} playbook (PDF, ~12 pages, no fluff)",
            "Working template pre-filled with the common case",
            "10-minute Loom walkthrough of the template on real data",
            "Email support for one round of questions",
        ]
    if rung == "stack":
        return [
            "Their data run through the template once, by you, with the output returned",
            "A written diagnosis of what is actually breaking in their setup",
            "45-minute working session (recorded, they keep the recording)",
            "Two weeks of async follow-up questions",
        ]
    if rung == "depth":
        return [
            "Done-for-you build against their real inputs, capped at a fixed scope",
            "Handover doc so they are not dependent on you afterwards",
            "30 days of bug-fix support on what you built",
        ]
    return [
        "Monthly re-run and re-check on their live data",
        "Priority async channel, replies within one business day",
        "Changelog of what changed and what it saved them this month",
    ]


def _promise(rung: str, cluster: DemandCluster) -> str:
    topic = cluster.label
    return {
        "tripwire": f"Find out in 10 minutes exactly why {topic} is failing for you.",
        "core": f"Fix {topic} yourself this week with a template that already works.",
        "stack": f"I run it on your data, tell you what is broken, and you watch me do it.",
        "depth": f"You send the inputs, I hand back the working thing. Fixed scope.",
        "retainer": f"It keeps working every month without you thinking about {topic}.",
    }[rung]


def build_stack(
    cluster: DemandCluster,
    rungs: Optional[Sequence[str]] = None,
    price_multiplier: float = 1.0,
) -> OfferStack:
    """Build the ladder for a cluster.

    When the cluster carries stated budgets, the `depth` rung is anchored to
    the median stated budget and the cheaper rungs are scaled to sit under it —
    pricing against evidence beats pricing against a template.
    """
    picked = list(rungs or [r for r, _, _ in RUNG_DEFAULTS])
    anchor = anchor_price_cents(cluster)
    tiers: list[OfferTier] = []

    for rung, default_cents, minutes in RUNG_DEFAULTS:
        if rung not in picked:
            continue
        price = default_cents
        if anchor:
            # depth == the stated budget; everything else keeps its ratio to
            # the default depth price so the ladder stays proportional.
            depth_default = next(c for r, c, _ in RUNG_DEFAULTS if r == "depth")
            price = int(round(default_cents * (anchor / depth_default)))
        price = int(round(price * price_multiplier))
        price = max(price, 500)  # nothing under $5; card fees eat it
        # Round to a .00/.99-ish charm price without pretending that is science.
        price = int(round(price / 100.0)) * 100 - 1
        tiers.append(
            OfferTier(
                id=stable_id("tier", cluster.id, rung),
                rung=rung,
                name=f"{product_name(cluster)} — {rung.capitalize()}",
                price_cents=price,
                promise=_promise(rung, cluster),
                deliverables=_deliverables(rung, cluster),
                fulfillment_minutes=minutes,
                recurring=(rung == "retainer"),
            )
        )

    return OfferStack(
        id=stable_id("off", cluster.id),
        cluster_id=cluster.id,
        product_name=product_name(cluster),
        positioning=(
            f"For people dealing with {cluster.label}. Evidence: {cluster.size} "
            f"independent posts describing it, fusion score {cluster.fusion_score:.1f}."
        ),
        tiers=tiers,
    )


def audit_stack(stack: OfferStack) -> list[str]:
    """Structural problems worth knowing before you sell anything. Returns
    plain sentences, empty list when the stack is sane."""
    problems: list[str] = []
    by_rung = {t.rung: t for t in stack.tiers}

    for tier in stack.tiers:
        if tier.recurring:
            continue  # a retainer's hourly only makes sense over months
        if tier.hourly_cents < MIN_EFFECTIVE_HOURLY_CENTS:
            problems.append(
                f"{tier.rung}: ${tier.price_cents/100:.0f} for {tier.fulfillment_minutes}min "
                f"= ${tier.hourly_cents/100:.0f}/h effective — below the ${MIN_EFFECTIVE_HOURLY_CENTS/100:.0f}/h floor. "
                "Raise the price or cut the deliverables."
            )

    if "tripwire" in by_rung and "core" in by_rung:
        ratio = by_rung["core"].price_cents / max(by_rung["tripwire"].price_cents, 1)
        if ratio < 1.8:
            problems.append(
                "tripwire and core are priced too close — the tripwire stops being an "
                "easy yes and just cannibalises the core sale."
            )
        if ratio > 8:
            problems.append(
                "the jump from tripwire to core is steep enough that almost nobody will "
                "make it; consider a rung in between."
            )

    if "retainer" not in by_rung:
        problems.append(
            "no recurring rung — every month restarts from zero, which is the difference "
            "between a spike and a floor."
        )

    return problems


# ── the arithmetic that makes a target real ───────────────────────────────────

def units_needed(target_cents: int, tier: OfferTier) -> int:
    return math.ceil(target_cents / max(tier.price_cents, 1))


def required_reach(units: int, conversion_rate: float) -> Optional[int]:
    """How many qualified people have to see it. None when there is no
    conversion estimate — a made-up CVR is the most expensive number in this
    whole system."""
    if conversion_rate <= 0:
        return None
    return math.ceil(units / conversion_rate)


def path_to_target(
    stack: OfferStack,
    target_cents: int,
    conversion_rate: Optional[float] = None,
    max_units_per_tier: int = 40,
    max_routes: int = 6,
) -> list[dict]:
    """Concrete ways to reach `target_cents` with this ladder.

    Returns routes sorted by total units (fewest sales first), each with the
    fulfilment hours it costs you and — when a conversion rate is supplied —
    the reach it implies. Recurring rungs count one month only; counting a
    retainer's lifetime value toward a "this week" target is how people talk
    themselves out of shipping.
    """
    tiers = sorted(stack.tiers, key=lambda t: -t.price_cents)
    routes: list[dict] = []

    def record(counts: dict[str, int]) -> None:
        revenue = sum(
            counts[t.id] * t.price_cents for t in tiers if counts.get(t.id)
        )
        if revenue < target_cents:
            return
        # Keep only minimal routes: if dropping any single unit still clears the
        # target, this route is padded and a shorter one already covers it
        # ("1× depth + 1× tripwire" when "1× depth" alone was enough).
        price_by_id = {t.id: t.price_cents for t in tiers}
        if any(
            revenue - price_by_id[tier_id] >= target_cents
            for tier_id, n in counts.items()
            if n > 0
        ):
            return
        minutes = sum(counts[t.id] * t.fulfillment_minutes for t in tiers if counts.get(t.id))
        units = sum(counts.values())
        routes.append(
            {
                "units": units,
                "by_tier": {
                    t.id: counts[t.id] for t in tiers if counts.get(t.id)
                },
                "labels": {
                    t.rung: counts[t.id] for t in tiers if counts.get(t.id)
                },
                "revenue_cents": revenue,
                "overshoot_cents": revenue - target_cents,
                "fulfilment_hours": round(minutes / 60, 1),
                "required_reach": required_reach(units, conversion_rate) if conversion_rate else None,
            }
        )

    # Single-rung routes: the honest "if only this one thing sells" answer.
    for t in tiers:
        n = units_needed(target_cents, t)
        if n <= max_units_per_tier:
            record({t.id: n})

    # Mixed routes: one higher rung carrying the load, tripwires filling the gap.
    if len(tiers) >= 2:
        for anchor in tiers:
            for k in range(1, 4):
                remaining = target_cents - anchor.price_cents * k
                if remaining <= 0:
                    continue
                for filler in tiers:
                    if filler.id == anchor.id:
                        continue
                    n = units_needed(remaining, filler)
                    if n <= max_units_per_tier:
                        record({anchor.id: k, filler.id: n})

    # Dedupe identical mixes, cheapest-effort first.
    seen: set[str] = set()
    unique: list[dict] = []
    for r in sorted(routes, key=lambda r: (r["units"], r["fulfilment_hours"], r["overshoot_cents"])):
        key = ",".join(f"{k}:{v}" for k, v in sorted(r["by_tier"].items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)
    return unique[:max_routes]


def describe_route(route: dict, target_cents: int) -> str:
    mix = ", ".join(f"{n}× {rung}" for rung, n in route["labels"].items())
    line = (
        f"{mix} = ${route['revenue_cents']/100:,.0f} "
        f"(target ${target_cents/100:,.0f}), {route['fulfilment_hours']}h of delivery"
    )
    if route.get("required_reach"):
        line += f", needs ~{route['required_reach']:,} qualified views at the observed rate"
    return line
