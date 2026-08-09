"""Tests for the Demand Fusion Engine.

Run from backend/axe_api:  python -m pytest revenue/test_revenue.py -q

Every test is offline and deterministic. The ones that matter most are the
honesty tests at the bottom: they assert that the engine refuses to project
revenue it has not seen and refuses to emit assets that would get an account
banned. Those are the properties that make the rest of it safe to act on.
"""

from __future__ import annotations

import itertools
import json
from datetime import datetime, timedelta, timezone

import pytest

from revenue import distribution, fusion, ledger, loop, offers
from revenue import signals as harvesters
from revenue.models import DemandSignal, LedgerEntry
from revenue.store import JsonStore

NOW = datetime(2026, 8, 9, tzinfo=timezone.utc)


@pytest.fixture
def seed() -> list[DemandSignal]:
    return harvesters.harvest_offline()


@pytest.fixture
def store(tmp_path) -> JsonStore:
    return JsonStore(tmp_path / "state.json")


# ── fusion ────────────────────────────────────────────────────────────────────

def test_seed_corpus_loads(seed):
    assert len(seed) >= 20
    assert all(s.source == "seed" for s in seed), "seed rows must be labelled as seed"


def test_fuse_is_deterministic(seed):
    a = fusion.fuse(seed, now=NOW)
    b = fusion.fuse(list(reversed(seed)), now=NOW)
    assert [c.id for c in a] == [c.id for c in b]
    assert [c.fusion_score for c in a] == [c.fusion_score for c in b]


def test_clusters_group_the_same_problem(seed):
    clusters = fusion.fuse(seed, now=NOW)
    by_signal = {sid: c for c in clusters for sid in c.signal_ids}
    invoice = [s.id for s in seed if s.id.startswith("sig_seed_inv_0") and s.id in by_signal]
    assert len(invoice) >= 3
    assert len({by_signal[i].id for i in invoice}) == 1, "invoice signals must share one cluster"


def test_self_promo_is_dropped_as_noise(seed):
    clustered = {sid for c in fusion.fuse(seed, now=NOW) for sid in c.signal_ids}
    assert "sig_seed_noise_01" not in clustered
    assert "sig_seed_noise_02" not in clustered


def test_enterprise_rfp_ranks_below_solo_shippable_work(seed):
    clusters = fusion.fuse(seed, now=NOW)
    heavy = next(c for c in clusters if "hipaa" in c.keywords or "compliance" in c.keywords)
    assert heavy.fusion_score < min(
        c.fusion_score for c in clusters if c.id != heavy.id
    ), "multi-year regulated work must not outrank work shippable this week"


def test_threshold_margin_holds(seed):
    """The clustering threshold sits between same-problem and different-problem
    pairs. If a lexicon change closes that gap, this fails before the loop
    starts silently welding unrelated markets together."""
    def topic(s):
        return fusion.keywords(s.text, topic_only=True)

    def group(sid):  # sig_seed_<group>_<n>
        return sid.split("_")[2]

    same, diff = [], []
    for a, b in itertools.combinations(seed, 2):
        j = fusion.jaccard(topic(a), topic(b))
        (same if group(a.id) == group(b.id) else diff).append(j)

    assert max(diff) < fusion.JACCARD_THRESHOLD, "a different-problem pair would merge"
    assert sum(1 for j in same if j >= fusion.JACCARD_THRESHOLD) >= 8


def test_recency_decays(seed):
    old = DemandSignal(id="a", source="seed", title="x", posted_at="2025-01-01T00:00:00Z")
    fresh = DemandSignal(id="b", source="seed", title="x", posted_at=NOW.isoformat())
    assert fusion.recency_weight(old, NOW) < 0.05
    assert fusion.recency_weight(fresh, NOW) == pytest.approx(1.0, abs=1e-6)


def test_stated_budget_lifts_willingness_to_pay():
    plain = DemandSignal(id="a", source="seed", title="need a thing")
    budgeted = DemandSignal(id="b", source="seed", title="need a thing", budget_cents=40000)
    assert fusion.signal_money(budgeted) >= 0.75
    assert fusion.signal_money(budgeted) > fusion.signal_money(plain)


def test_empty_harvest_produces_no_clusters():
    assert fusion.fuse([], now=NOW) == []


# ── offers ────────────────────────────────────────────────────────────────────

def test_stack_ladder_is_ascending(seed):
    cluster = fusion.fuse(seed, now=NOW)[0]
    stack = offers.build_stack(cluster)
    ordered = [t for t in stack.tiers if t.rung in ("tripwire", "core", "stack", "depth")]
    prices = [t.price_cents for t in ordered]
    assert prices == sorted(prices), "the ladder must go up"
    assert all(t.deliverables for t in stack.tiers), "every rung needs real deliverables"


def test_stated_budgets_anchor_the_price(seed):
    cluster = next(c for c in fusion.fuse(seed, now=NOW) if c.stated_budgets_cents)
    stack = offers.build_stack(cluster)
    depth = next(t for t in stack.tiers if t.rung == "depth")
    median = offers.anchor_price_cents(cluster)
    assert abs(depth.price_cents - median) <= 100, "depth rung should sit at the stated budget"


def test_audit_flags_bad_wage(seed):
    cluster = fusion.fuse(seed, now=NOW)[0]
    stack = offers.build_stack(cluster)
    stack.tiers[0].fulfillment_minutes = 600  # $19 for ten hours
    problems = offers.audit_stack(stack)
    assert any("effective" in p for p in problems)


def test_path_to_target_actually_reaches_target(seed):
    cluster = fusion.fuse(seed, now=NOW)[0]
    stack = offers.build_stack(cluster)
    routes = offers.path_to_target(stack, 33000)
    assert routes, "there must be at least one route to $330"
    for r in routes:
        assert r["revenue_cents"] >= 33000


def test_routes_are_minimal(seed):
    """No route may contain a unit it did not need — a padded route makes the
    target look more expensive to reach than it is."""
    cluster = fusion.fuse(seed, now=NOW)[0]
    stack = offers.build_stack(cluster)
    prices = {t.id: t.price_cents for t in stack.tiers}
    for r in offers.path_to_target(stack, 33000):
        for tier_id in r["by_tier"]:
            assert r["revenue_cents"] - prices[tier_id] < 33000


def test_required_reach_needs_a_conversion_rate():
    assert offers.required_reach(10, 0) is None
    assert offers.required_reach(10, 0.01) == 1000


# ── distribution ──────────────────────────────────────────────────────────────

@pytest.fixture
def stack(seed):
    return offers.build_stack(fusion.fuse(seed, now=NOW)[0])


def test_asset_carries_disclosure_and_tracking(stack):
    asset = distribution.build_asset(
        "forum_answer", stack, stack.tiers[0], "why does this keep breaking?",
        "https://example.com/kit", identity="axe_kits",
    )
    assert asset.disclosure, "a promotional forum post must disclose"
    assert "utm_source=forum_answer" in asset.tracked_url
    assert "utm_campaign=" in asset.tracked_url


def test_missing_disclosure_is_rejected(stack):
    asset = distribution.build_asset(
        "forum_answer", stack, stack.tiers[0], "q", "https://example.com", "axe_kits"
    )
    asset.disclosure = ""
    with pytest.raises(distribution.DistributionError, match="disclosure"):
        distribution.validate_asset(asset)


def test_unprovable_claims_are_rejected(stack):
    asset = distribution.build_asset(
        "forum_answer", stack, stack.tiers[0], "q", "https://example.com", "axe_kits"
    )
    asset.body += "\nGuaranteed results, risk-free, make $10000 overnight."
    with pytest.raises(distribution.DistributionError) as exc:
        distribution.validate_asset(asset)
    for phrase in ("Guaranteed", "risk-free", "make $10000", "overnight"):
        assert phrase.lower() in str(exc.value).lower()


def test_two_identities_on_one_channel_is_rejected(stack):
    a = distribution.build_asset(
        "forum_answer", stack, stack.tiers[0], "q1", "https://example.com", "handle_one"
    )
    b = distribution.build_asset(
        "forum_answer", stack, stack.tiers[0], "q2", "https://example.com", "handle_two"
    )
    with pytest.raises(distribution.DistributionError, match="sockpuppet"):
        distribution.validate_plan([a, b])


def test_cold_email_requires_postal_address_and_optout(stack):
    with pytest.raises(distribution.DistributionError, match="postal_address"):
        distribution.build_asset(
            "cold_email", stack, stack.tiers[0], "q", "https://example.com", "axe_kits"
        )
    ok = distribution.build_asset(
        "cold_email", stack, stack.tiers[0], "q", "https://example.com", "axe_kits",
        postal_address="AXE Kits, 1 Example Street, Rotterdam, NL",
    )
    assert "unsubscribe" in ok.body.lower() or "reply stop" in ok.body.lower()


def test_plan_respects_daily_caps(stack):
    assets, warnings = distribution.build_plan(
        stack, ["q1", "q2", "q3", "q4", "q5", "q6"], identity="axe_kits",
        base_url="https://example.com", channels=["forum_answer", "free_tool"],
    )
    per_channel: dict[str, int] = {}
    for a in assets:
        per_channel[a.channel] = per_channel.get(a.channel, 0) + 1
    for channel, n in per_channel.items():
        assert n <= distribution.CHANNELS[channel].daily_cap
    assert not [w for w in warnings if "cap" in w]


# ── ledger ────────────────────────────────────────────────────────────────────

def _entry(channel: str, reach: int, clicks: int, sales: int, revenue: int, when: datetime) -> LedgerEntry:
    return LedgerEntry(
        id=f"led_{channel}_{when.date()}", offer_id="off_x", tier_id="tier_y", channel=channel,
        reach=reach, clicks=clicks, sales=sales, revenue_cents=revenue,
        effort_minutes=60, occurred_at=when.isoformat(),
    )


def test_winner_is_scaled_and_loser_is_killed():
    entries = [
        _entry("forum_answer", 1000, 60, 5, 9500, NOW),
        _entry("community_dm", 800, 5, 0, 0, NOW),
    ]
    rows = {r["channel"]: r for r in ledger.decisions(entries)}
    assert rows["forum_answer"]["decision"] == "scale"
    assert rows["community_dm"]["decision"] == "kill"


def test_thin_sample_is_never_judged():
    rows = ledger.decisions([_entry("forum_answer", 40, 2, 0, 0, NOW)])
    assert rows[0]["decision"] == "insufficient_data"


def test_compounding_channels_get_a_longer_rope():
    """An SEO page with 1,200 views and no sales is normal, not dead."""
    rows = {r["channel"]: r for r in ledger.decisions([
        _entry("seo_page", 1200, 8, 0, 0, NOW),
        _entry("forum_answer", 1200, 8, 0, 0, NOW),
    ])}
    assert rows["seo_page"]["decision"] == "insufficient_data"
    assert rows["forum_answer"]["decision"] == "kill"


def test_allocation_reserves_effort_for_exploration():
    rows = ledger.decisions([
        _entry("forum_answer", 2000, 90, 8, 15000, NOW),
        _entry("seo_page", 400, 3, 0, 0, NOW),
    ])
    alloc = ledger.allocate(10, rows)
    assert sum(a["units"] for a in alloc) == 10
    assert any(a["role"] == "explore" for a in alloc), "never starve exploration"
    assert any(a["role"] == "exploit" for a in alloc)


def test_allocation_without_any_revenue_is_all_exploration():
    rows = ledger.decisions([_entry("forum_answer", 100, 2, 0, 0, NOW)])
    alloc = ledger.allocate(6, rows)
    assert alloc and all(a["role"] == "explore" for a in alloc)


def test_smoothed_cvr_resists_a_lucky_first_sale():
    assert ledger.smoothed_cvr(clicks=12, sales=1) < 0.05      # raw would be 8.3%
    assert ledger.smoothed_cvr(clicks=2000, sales=100) > 0.045  # real data wins


# ── the honesty properties ────────────────────────────────────────────────────

def test_projection_refuses_without_enough_weeks():
    result = ledger.project_to_target([_entry("forum_answer", 900, 40, 2, 4000, NOW)], 900_000)
    assert result["status"] == "insufficient_data"
    assert "weeks_to_target" not in result


def test_projection_states_its_assumptions_and_caps_growth():
    entries = [
        _entry("forum_answer", 900, 40, 2, 4000, NOW - timedelta(weeks=4)),
        _entry("forum_answer", 900, 40, 4, 8000, NOW - timedelta(weeks=3)),
        _entry("forum_answer", 900, 40, 9, 40000, NOW - timedelta(weeks=2)),
        _entry("forum_answer", 900, 40, 10, 44000, NOW - timedelta(weeks=1)),
    ]
    result = ledger.project_to_target(entries, 900_000, now=NOW)
    assert result["status"] == "projected"
    assert result["median_weekly_growth"] <= result["growth_capped_at"]
    assert "week(s) of data" in result["message"]
    assert "trend line, not a forecast" in result["message"]


def test_flat_revenue_does_not_pretend_to_reach_the_target():
    entries = [
        _entry("forum_answer", 900, 40, 1, 2000, NOW - timedelta(weeks=w))
        for w in (4, 3, 2, 1)
    ]
    result = ledger.project_to_target(entries, 900_000, now=NOW)
    assert result["weeks_to_target"] is None
    assert "flat or declining" in result["message"]


def test_revenue_only_counts_what_was_recorded(store, seed):
    report = loop.run_cycle(store, new_signals=seed, now=NOW)
    assert report.revenue_cents_to_date == 0
    assert report.target_progress == 0.0
    assert any("Record every result" in a for a in report.next_actions)


# ── loop + store ──────────────────────────────────────────────────────────────

def test_cycle_is_idempotent_on_signals(store, seed):
    first = loop.run_cycle(store, new_signals=seed, now=NOW)
    second = loop.run_cycle(store, new_signals=seed, now=NOW)
    assert first.signals_harvested == len(seed)
    assert second.signals_harvested == 0, "re-harvesting the same posts must not inflate frequency"
    assert first.clusters_formed == second.clusters_formed


def test_cycle_warns_when_nothing_was_harvested(store):
    report = loop.run_cycle(store, new_signals=[], now=NOW)
    assert report.clusters_formed == 0
    assert any("no clusters" in w for w in report.warnings)


def test_cycle_without_identity_builds_no_assets(store, seed):
    report = loop.run_cycle(store, new_signals=seed, now=NOW)
    assert report.assets_queued == 0
    assert any("identity=" in w for w in report.warnings)


def test_cycle_with_identity_queues_compliant_assets(store, seed):
    report = loop.run_cycle(
        store, new_signals=seed, identity="axe_kits",
        base_url="https://example.com/kit", now=NOW,
    )
    assert report.assets_queued > 0
    for asset in store.assets():
        distribution.validate_asset(asset)  # raises if any queued asset is unsafe


def test_state_survives_a_reload(store, seed, tmp_path):
    loop.run_cycle(store, new_signals=seed, now=NOW)
    reloaded = JsonStore(store.path)
    assert len(reloaded.signals()) == len(seed)
    assert reloaded.cycle == 1
    assert json.loads(store.path.read_text())["version"] == 1


def test_status_shape(store, seed):
    loop.run_cycle(store, new_signals=seed, now=NOW)
    st = loop.status(store, now=NOW)
    for key in ("cycle", "targets", "totals", "top_clusters", "decisions", "projection"):
        assert key in st
    assert st["projection"]["status"] == "insufficient_data"


# ── query packs ───────────────────────────────────────────────────────────────

def test_every_pack_has_usable_queries():
    from revenue import packs

    for name, pack in packs.PACKS.items():
        assert pack["description"], f"{name} needs a description"
        assert len(pack["queries"]) >= 3, f"{name} needs enough phrases to be worth a pack"
        for q in pack["queries"]:
            assert len(q.split()) >= 3, f"{name}: '{q}' is a category name, not buyer language"


def test_trading_pack_avoids_advisory_territory():
    """The trading pack must point at tooling pain, never at signals or calls —
    selling those is licensed activity, and the copy it would need is exactly
    what BANNED_CLAIMS refuses to generate."""
    from revenue import packs

    joined = " ".join(packs.pack_queries("trading_tools")).lower()
    for forbidden in ("signal", "buy call", "pump", "guaranteed", "profit guarantee", "tips"):
        assert forbidden not in joined


def test_unknown_pack_raises():
    from revenue import packs

    with pytest.raises(KeyError, match="unknown pack"):
        packs.pack_queries("nope")
