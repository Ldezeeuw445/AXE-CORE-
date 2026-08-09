"""The ledger — the only part of this engine allowed to say what is working.

Everything upstream is a hypothesis. This file is where hypotheses meet money,
and it is deliberately pessimistic:

* Nothing is killed or scaled before it has had a fair sample (`MIN_REACH`).
  Killing a channel after 40 views is superstition, not measurement.
* Rates are smoothed toward a prior, so one lucky sale off 12 views cannot
  masquerade as a 8% conversion rate and hijack the whole allocation.
* `project_to_target()` refuses to answer without enough weeks of real data,
  and when it does answer it hands back its assumptions with the number. A
  projection with the assumptions stripped off is just a wish with a decimal
  point.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional, Sequence

from .models import LedgerEntry

# A pair (offer/tier/channel) needs this much exposure before kill/scale calls
# mean anything.
MIN_REACH = 300
MIN_CLICKS_FOR_CVR = 20

# Revenue per 1,000 reach. These are the decision boundaries, in cents.
KILL_RPM_CENTS = 50        # under $0.50 per 1k views → stop feeding it
SCALE_RPM_CENTS = 400      # over $4.00 per 1k views → double the effort

# Beta prior on click→sale, roughly "1 sale per 60 clicks until proven
# otherwise". Weak enough to be overwhelmed by ~200 real clicks.
PRIOR_SALES = 1.0
PRIOR_CLICKS = 60.0

# Never starve exploration: this share of next cycle's effort goes to untested
# or losing pairs, because the ledger can only ever rank what it has seen.
EXPLORATION_FLOOR = 0.20


def _parse(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def pair_key(entry: LedgerEntry) -> str:
    return f"{entry.offer_id}|{entry.tier_id}|{entry.channel}"


def totals(entries: Sequence[LedgerEntry]) -> dict:
    revenue = sum(e.revenue_cents for e in entries)
    cost = sum(e.cost_cents for e in entries)
    minutes = sum(e.effort_minutes for e in entries)
    return {
        "entries": len(entries),
        "reach": sum(e.reach for e in entries),
        "clicks": sum(e.clicks for e in entries),
        "sales": sum(e.sales for e in entries),
        "revenue_cents": revenue,
        "cost_cents": cost,
        "net_cents": revenue - cost,
        "effort_hours": round(minutes / 60, 1),
        "revenue_per_hour_cents": int(revenue / (minutes / 60)) if minutes else 0,
    }


def smoothed_cvr(clicks: int, sales: int) -> float:
    """Click→sale rate pulled toward the prior when the sample is thin."""
    return (sales + PRIOR_SALES) / (clicks + PRIOR_CLICKS)


def aggregate(entries: Iterable[LedgerEntry]) -> list[dict]:
    """One row per (offer, tier, channel), newest activity first.

    `rpm_cents` — revenue per 1,000 reach — is the ranking metric rather than
    conversion rate, because it is the only one that fairly compares a channel
    with 50 hot readers against one with 50,000 cold ones.
    """
    buckets: dict[str, list[LedgerEntry]] = defaultdict(list)
    for e in entries:
        buckets[pair_key(e)].append(e)

    rows = []
    for key, group in buckets.items():
        offer_id, tier_id, channel = key.split("|")
        reach = sum(e.reach for e in group)
        clicks = sum(e.clicks for e in group)
        sales = sum(e.sales for e in group)
        revenue = sum(e.revenue_cents for e in group)
        cost = sum(e.cost_cents for e in group)
        minutes = sum(e.effort_minutes for e in group)
        last = max((e.occurred_at for e in group), default="")
        rows.append(
            {
                "key": key,
                "offer_id": offer_id,
                "tier_id": tier_id,
                "channel": channel,
                "entries": len(group),
                "reach": reach,
                "clicks": clicks,
                "sales": sales,
                "revenue_cents": revenue,
                "cost_cents": cost,
                "net_cents": revenue - cost,
                "effort_minutes": minutes,
                "ctr": round(clicks / reach, 4) if reach else 0.0,
                "cvr": round(sales / clicks, 4) if clicks else 0.0,
                "smoothed_cvr": round(smoothed_cvr(clicks, sales), 4),
                "rpm_cents": int(revenue * 1000 / reach) if reach else 0,
                "revenue_per_hour_cents": int(revenue / (minutes / 60)) if minutes else 0,
                "last_activity": last,
            }
        )

    rows.sort(key=lambda r: (-r["rpm_cents"], -r["revenue_cents"], r["key"]))
    return rows


def kill_threshold_reach(channel: str) -> int:
    """Sample a channel must reach before it can be killed. Compounding
    channels get a longer rope — see Channel.kill_min_reach."""
    from .distribution import CHANNELS  # local import keeps the dependency one-way

    ch = CHANNELS.get(channel)
    return ch.kill_min_reach if ch else MIN_REACH


def decide(row: dict) -> dict:
    """kill / keep / scale / insufficient_data, with the reason attached.

    The reason string is the point. A decision you cannot explain to yourself
    next week is one you will quietly reverse for no reason.
    """
    reach, revenue, rpm = row["reach"], row["revenue_cents"], row["rpm_cents"]
    min_reach = kill_threshold_reach(row["channel"])

    if reach < min_reach and revenue == 0:
        return {
            **row,
            "decision": "insufficient_data",
            "reason": f"only {reach} reach and no sales yet; needs {min_reach} before judging",
        }

    if revenue > 0 and rpm >= SCALE_RPM_CENTS:
        return {
            **row,
            "decision": "scale",
            "reason": (
                f"${rpm/100:.2f} per 1k reach (over the ${SCALE_RPM_CENTS/100:.2f} bar) "
                f"on {row['sales']} sale(s) — double the effort here next cycle"
            ),
        }

    if rpm < KILL_RPM_CENTS and reach >= min_reach:
        return {
            **row,
            "decision": "kill",
            "reason": (
                f"{reach} reach produced ${revenue/100:.2f} "
                f"(${rpm/100:.2f} per 1k) — under the ${KILL_RPM_CENTS/100:.2f} floor; stop feeding it"
            ),
        }

    return {
        **row,
        "decision": "keep",
        "reason": (
            f"${rpm/100:.2f} per 1k reach — working but not yet worth doubling; "
            "hold the current effort and let the sample grow"
        ),
    }


def decisions(entries: Sequence[LedgerEntry]) -> list[dict]:
    return [decide(row) for row in aggregate(entries)]


def allocate(effort_units: int, rows: Sequence[dict]) -> list[dict]:
    """Split next cycle's effort across pairs — "multiply what converts".

    Winners get effort proportional to observed RPM, but `EXPLORATION_FLOOR` of
    the budget is reserved for untested and losing pairs. A loop that only ever
    feeds its current best channel converges on a local maximum and then dies
    with it when the channel changes its rules.
    """
    if effort_units <= 0 or not rows:
        return []

    judged = [r if "decision" in r else decide(r) for r in rows]
    winners = [r for r in judged if r["decision"] in ("scale", "keep") and r["rpm_cents"] > 0]
    winner_keys = {r["key"] for r in winners}
    explorers = [r for r in judged if r["key"] not in winner_keys]

    explore_units = math.ceil(effort_units * EXPLORATION_FLOOR) if explorers else 0
    exploit_units = effort_units - explore_units

    out: list[dict] = []

    total_rpm = sum(r["rpm_cents"] for r in winners)
    if winners and total_rpm > 0:
        assigned = 0
        for i, r in enumerate(winners):
            share = r["rpm_cents"] / total_rpm
            units = (
                exploit_units - assigned
                if i == len(winners) - 1
                else int(round(exploit_units * share))
            )
            assigned += units
            if units > 0:
                out.append({"key": r["key"], "channel": r["channel"], "units": units, "role": "exploit"})
    else:
        explore_units = effort_units  # nothing has earned anything yet

    if explorers and explore_units > 0:
        per = max(1, explore_units // len(explorers))
        remaining = explore_units
        for r in explorers:
            units = min(per, remaining)
            remaining -= units
            if units > 0:
                out.append({"key": r["key"], "channel": r["channel"], "units": units, "role": "explore"})

    return out


def weekly_revenue(entries: Sequence[LedgerEntry], now: Optional[datetime] = None) -> list[tuple[str, int]]:
    """Settled revenue bucketed by ISO week, oldest first."""
    now = now or datetime.now(timezone.utc)
    buckets: dict[str, int] = defaultdict(int)
    for e in entries:
        ts = _parse(e.occurred_at)
        if ts is None or e.revenue_cents <= 0:
            continue
        iso = ts.isocalendar()
        buckets[f"{iso[0]}-W{iso[1]:02d}"] += e.revenue_cents
    return sorted(buckets.items())


def project_to_target(
    entries: Sequence[LedgerEntry],
    target_cents: int,
    now: Optional[datetime] = None,
    min_weeks: int = 3,
    max_weekly_growth: float = 0.35,
) -> dict:
    """When does the observed trajectory reach `target_cents` per month?

    Returns `{"status": "insufficient_data", ...}` until there are `min_weeks`
    of real weekly revenue. When it does project, growth is capped at
    `max_weekly_growth` — an early loop can post an 8x week off one lucky sale,
    and extrapolating that produces a number that is worse than useless because
    it is confident.
    """
    now = now or datetime.now(timezone.utc)
    weeks = weekly_revenue(entries, now)
    monthly_target = target_cents

    if len(weeks) < min_weeks:
        return {
            "status": "insufficient_data",
            "weeks_observed": len(weeks),
            "weeks_required": min_weeks,
            "revenue_to_date_cents": sum(e.revenue_cents for e in entries),
            "message": (
                f"{len(weeks)} week(s) of settled revenue on record; {min_weeks} needed before "
                "any projection is worth reading. Run the loop, record real sales, ask again."
            ),
        }

    values = [v for _, v in weeks]
    latest = values[-1]

    # Week-over-week growth, median of the observed ratios so one spike does
    # not set the trend.
    ratios = [
        values[i] / values[i - 1]
        for i in range(1, len(values))
        if values[i - 1] > 0
    ]
    ratios.sort()
    median_ratio = ratios[len(ratios) // 2] if ratios else 1.0
    growth = min(max(median_ratio - 1.0, 0.0), max_weekly_growth)

    weekly_target = monthly_target / 4.33
    weeks_needed: Optional[int] = None
    projected = float(latest)
    if projected >= weekly_target:
        weeks_needed = 0
    elif growth > 0:
        # projected * (1+g)^n >= weekly_target
        weeks_needed = math.ceil(
            math.log(weekly_target / max(projected, 1)) / math.log(1 + growth)
        )
    # growth == 0 → flat; weeks_needed stays None, which is the honest answer.

    return {
        "status": "projected",
        "weeks_observed": len(weeks),
        "weekly_series": weeks,
        "latest_week_cents": latest,
        "median_weekly_growth": round(growth, 4),
        "growth_capped_at": max_weekly_growth,
        "monthly_target_cents": monthly_target,
        "weekly_target_cents": int(weekly_target),
        "weeks_to_target": weeks_needed,
        "message": (
            f"Last week settled ${latest/100:,.2f}. Median week-over-week growth "
            f"{growth*100:.1f}% (capped at {max_weekly_growth*100:.0f}%). "
            + (
                f"At that rate the ${monthly_target/100:,.0f}/month run-rate "
                f"(${weekly_target/100:,.0f}/week) arrives in ~{weeks_needed} week(s)."
                if weeks_needed is not None
                else f"Revenue is flat or declining, so it does not reach "
                     f"${monthly_target/100:,.0f}/month on the current trajectory — "
                     "the mix has to change, not just the volume."
            )
            + f" Based on {len(weeks)} week(s) of data; treat it as a trend line, not a forecast."
        ),
    }
