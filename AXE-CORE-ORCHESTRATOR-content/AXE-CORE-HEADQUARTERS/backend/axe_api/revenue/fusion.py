"""The Demand Fusion Loop: many scattered signals → a few ranked clusters.

"Fusion" is literal — the value is not in any single post, it is in the fact
that eleven different people described the same expensive problem in eleven
different ways in the last three weeks. One post is an anecdote; a cluster is
a market.

The whole file is deterministic and pure: same signals in, same clusters out,
no clock, no network. `now` is injectable so recency scoring is testable.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Iterable, Optional, Sequence

from .lexicon import (
    ASK_MARKERS,
    AUTHOR_KIND_WEIGHT,
    HEAVY_MARKERS,
    MONEY_MARKERS,
    NOISE_MARKERS,
    PAIN_MARKERS,
    SOLVABLE_MARKERS,
    SOURCE_WEIGHT,
    STOPWORDS,
)
from .models import ClusterScores, DemandCluster, DemandSignal, stable_id

# Two signals join the same cluster when their topic-keyword sets overlap this
# much. Calibrated against the seed corpus (`pytest test_revenue.py -k margin`
# guards it): same-problem pairs there run 0.20–0.50, the highest
# different-problem pair is 0.17. That is a real but thin margin — single-link
# clustering chains, so a threshold below ~0.18 starts welding the invoice
# market to the lead-automation market through one borderline pair.
JACCARD_THRESHOLD = 0.20

RECENCY_HALFLIFE_DAYS = 21.0

_WORD_RE = re.compile(r"[a-z0-9][a-z0-9'+/#\.-]*")

# Words that carry *scoring* meaning but no *topic* meaning. "pay", "template",
# "audit" and "urgent" show up in every profitable cluster, so leaving them in
# the clustering vocabulary glues unrelated markets together through single-link
# chaining (invoice work merged into cold-email work via "audit/checklist/pay").
# They still count for scoring — they are only removed from the similarity
# comparison.
#
# Curated by hand rather than derived from lexicon.py, because plenty of marker
# words ARE the topic: "invoice", "spreadsheet", "csv", "n8n". Strip those and
# the invoice market stops looking like itself.
_TOPIC_STOP: frozenset[str] = frozenset("""
pay paid paying pays budget hire hiring hired freelancer contractor consultant
quote client clients customer customers agency vendor money cost costs costing
expensive cheaper worth roi
urgent asap deadline deadlines quick quickly slow fast
help helping advice suggestions recommend recommendations recommended looking
need needed needs anyone someone somebody question questions ask asking answer
wanted want
template templates checklist guide walkthrough example examples audit audits
review reviews setup set-up config configure workflow process solution
manual manually hand automate automated automation automatic
hour hours day days week weeks month months year years time times
wasted waste wasting broken breaking breaks break fails failing failed error
errors crash crashes bug bugs issue issues problem problems fix fixing fixed
painful pain frustrating frustrated nightmare impossible stuck blocked
work working works build building built made make making use using used
best good better great new old
""".split())


# ── text utilities ────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def tokenize(text: str) -> list[str]:
    """Lowercase words with trailing punctuation stripped — "bookkeeping." and
    "bookkeeping" have to be the same token or half the overlap evaporates."""
    out = []
    for raw in _WORD_RE.findall(normalize(text)):
        word = raw.strip(".-/'")
        if word:
            out.append(word)
    return out


def keywords(text: str, limit: int = 14, topic_only: bool = False) -> list[str]:
    """Content words, most frequent first, ties broken alphabetically so the
    output is stable across runs (set iteration order is not).

    `topic_only=True` also drops the scoring vocabulary — use it for anything
    that compares two signals to each other.
    """
    counts: dict[str, int] = {}
    for word in tokenize(text):
        if word in STOPWORDS or len(word) < 3 or word.isdigit():
            continue
        if topic_only and word in _TOPIC_STOP:
            continue
        counts[word] = counts.get(word, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [w for w, _ in ranked[:limit]]


def marker_hits(text: str, markers: dict[str, int]) -> int:
    """Sum the weights of every marker phrase present. Phrases are matched as
    substrings on the normalized text so multi-word markers work."""
    norm = normalize(text)
    return sum(weight for phrase, weight in markers.items() if phrase in norm)


def _squash(raw: float, scale: float) -> float:
    """Saturating 0..1 curve. Ten pain words should not score ten times one —
    the second mention is evidence, the tenth is a rant."""
    if raw <= 0:
        return 0.0
    return 1.0 - math.exp(-raw / scale)


def jaccard(a: Sequence[str], b: Sequence[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ── per-signal scoring ────────────────────────────────────────────────────────

def _parse_ts(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def recency_weight(signal: DemandSignal, now: datetime) -> float:
    """Exponential decay, half-life 21 days. An undated signal is treated as
    one half-life old rather than dropped — unknown is not the same as stale,
    but it should not outrank a signal from yesterday."""
    posted = _parse_ts(signal.posted_at)
    if posted is None:
        return 0.5
    age_days = max((now - posted).total_seconds() / 86400.0, 0.0)
    return 0.5 ** (age_days / RECENCY_HALFLIFE_DAYS)


def is_noise(signal: DemandSignal) -> bool:
    """Self-promo and launch announcements are the opposite of demand. They
    are dropped before clustering rather than scored low, because they are
    lexically rich and would otherwise glue unrelated clusters together."""
    text = signal.text
    return marker_hits(text, NOISE_MARKERS) >= 4 and marker_hits(text, ASK_MARKERS) == 0


def signal_pain(signal: DemandSignal) -> float:
    return _squash(marker_hits(signal.text, PAIN_MARKERS), scale=6.0)


def signal_money(signal: DemandSignal) -> float:
    """Willingness to pay. A stated budget is the strongest evidence there is,
    so it floors the score at 0.75 regardless of vocabulary."""
    raw = marker_hits(signal.text, MONEY_MARKERS)
    score = _squash(raw, scale=7.0)
    score *= SOURCE_WEIGHT.get(signal.source, SOURCE_WEIGHT["unknown"])
    score *= AUTHOR_KIND_WEIGHT.get(signal.author_kind, AUTHOR_KIND_WEIGHT["unknown"])
    if signal.budget_cents:
        score = max(score, 0.75)
    return min(score, 1.0)


def signal_solvability(signal: DemandSignal) -> float:
    light = marker_hits(signal.text, SOLVABLE_MARKERS)
    heavy = marker_hits(signal.text, HEAVY_MARKERS)
    return max(0.0, _squash(light, scale=6.0) - _squash(heavy, scale=5.0))


# ── clustering ────────────────────────────────────────────────────────────────

def _dedupe(signals: Iterable[DemandSignal]) -> list[DemandSignal]:
    """Same URL, or same normalized title, is the same signal. Harvesters
    overlap (a question gets cross-posted); counting it twice would fake
    frequency, which is the one factor that must stay honest."""
    seen: dict[str, DemandSignal] = {}
    for s in signals:
        key = s.url.strip().lower() or f"title:{normalize(s.title)}"
        prior = seen.get(key)
        if prior is None or len(s.text) > len(prior.text):
            seen[key] = s
    return sorted(seen.values(), key=lambda s: (s.id, s.url))


def cluster_signals(
    signals: Sequence[DemandSignal],
    threshold: float = JACCARD_THRESHOLD,
) -> list[list[DemandSignal]]:
    """Single-link agglomerative clustering over keyword Jaccard.

    O(n²) on purpose: n here is hundreds of signals per cycle, and a union-find
    over an explicit similarity matrix is far easier to debug at 2am than an
    approximate nearest-neighbour index that silently mis-buckets.
    """
    items = _dedupe(signals)
    kws = [set(keywords(s.text, topic_only=True)) for s in items]
    parent = list(range(len(items)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[max(ri, rj)] = min(ri, rj)

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if jaccard(list(kws[i]), list(kws[j])) >= threshold:
                union(i, j)

    groups: dict[int, list[DemandSignal]] = {}
    for idx, sig in enumerate(items):
        groups.setdefault(find(idx), []).append(sig)
    return [groups[k] for k in sorted(groups)]


def label_for(group: Sequence[DemandSignal]) -> str:
    """Human-readable cluster name: the three keywords that appear in the most
    members (not the most times overall — a single ranting post should not get
    to name the market)."""
    doc_freq: dict[str, int] = {}
    for s in group:
        for w in set(keywords(s.text, limit=10, topic_only=True)):
            doc_freq[w] = doc_freq.get(w, 0) + 1
    ranked = sorted(doc_freq.items(), key=lambda kv: (-kv[1], kv[0]))
    return " · ".join(w for w, _ in ranked[:3]) or "unlabelled"


# ── fusion score ──────────────────────────────────────────────────────────────

# Weights sum to 1.0. willingness_to_pay and solvability_now carry the most
# because this engine optimises for "money this week", not "biggest market".
WEIGHTS = {
    "pain": 0.18,
    "frequency": 0.18,
    "recency": 0.14,
    "willingness_to_pay": 0.30,
    "solvability_now": 0.20,
}


def score_group(group: Sequence[DemandSignal], now: datetime) -> ClusterScores:
    n = max(len(group), 1)
    pain = sum(signal_pain(s) for s in group) / n
    money = sum(signal_money(s) for s in group) / n
    solvable = sum(signal_solvability(s) for s in group) / n
    # Recency is the *best* evidence, not the average: one post from yesterday
    # means the problem is live now, even if the rest of the thread is old.
    recency = max((recency_weight(s, now) for s in group), default=0.0)
    # Frequency saturates fast — 8 independent complaints is already a market,
    # 80 just means the subreddit is big.
    frequency = _squash(len(group) - 1, scale=4.0)
    return ClusterScores(
        pain=round(pain, 4),
        frequency=round(frequency, 4),
        recency=round(recency, 4),
        willingness_to_pay=round(money, 4),
        solvability_now=round(solvable, 4),
    )


def fusion_score(scores: ClusterScores) -> float:
    """Weighted sum, then a hard gate.

    The gate is the important half. A cluster with no willingness-to-pay
    evidence and nothing shippable in 48h cannot rank above 40 no matter how
    much pain it shows, because "people are angry about it" and "people will
    send me $29 for it this week" are different businesses.
    """
    base = (
        WEIGHTS["pain"] * scores.pain
        + WEIGHTS["frequency"] * scores.frequency
        + WEIGHTS["recency"] * scores.recency
        + WEIGHTS["willingness_to_pay"] * scores.willingness_to_pay
        + WEIGHTS["solvability_now"] * scores.solvability_now
    ) * 100.0
    gate = min(1.0, 0.4 + 0.6 * max(scores.willingness_to_pay, scores.solvability_now))
    return round(base * gate, 2)


def fuse(
    signals: Sequence[DemandSignal],
    now: Optional[datetime] = None,
    min_cluster_size: int = 2,
    threshold: float = JACCARD_THRESHOLD,
) -> list[DemandCluster]:
    """Full loop: drop noise → dedupe → cluster → score → rank.

    Singletons are dropped by default (`min_cluster_size=2`): a single post is
    not evidence of a market, and acting on singletons is exactly how you spend
    a weekend building something nobody asked for twice. Set it to 1 when a
    stated budget makes one post worth chasing.
    """
    now = now or datetime.now(timezone.utc)
    usable = [s for s in signals if not is_noise(s)]
    clusters: list[DemandCluster] = []

    for group in cluster_signals(usable, threshold=threshold):
        if len(group) < min_cluster_size:
            continue
        scores = score_group(group, now)
        ids = sorted(s.id for s in group)
        clusters.append(
            DemandCluster(
                id=stable_id("clu", *ids),
                label=label_for(group),
                keywords=keywords(" ".join(s.text for s in group), limit=12, topic_only=True),
                signal_ids=ids,
                scores=scores,
                fusion_score=fusion_score(scores),
                evidence_urls=sorted({s.url for s in group if s.url})[:12],
                stated_budgets_cents=sorted(
                    s.budget_cents for s in group if s.budget_cents
                ),
            )
        )

    clusters.sort(key=lambda c: (-c.fusion_score, c.id))
    return clusters


def explain(cluster: DemandCluster) -> str:
    """One paragraph a human can argue with — used by the CLI and the report so
    a ranking decision is never a bare number."""
    s = cluster.scores
    parts = [
        f"{cluster.size} independent signals",
        f"pain {s.pain:.2f}",
        f"pays {s.willingness_to_pay:.2f}",
        f"shippable-now {s.solvability_now:.2f}",
        f"freshness {s.recency:.2f}",
    ]
    if cluster.stated_budgets_cents:
        budgets = ", ".join(f"${c/100:,.0f}" for c in cluster.stated_budgets_cents)
        parts.append(f"stated budgets: {budgets}")
    weakest = min(s.to_dict().items(), key=lambda kv: kv[1])
    return (
        f"[{cluster.fusion_score:.1f}] {cluster.label} — " + "; ".join(parts)
        + f". Weakest factor: {weakest[0]} ({weakest[1]:.2f})."
    )
