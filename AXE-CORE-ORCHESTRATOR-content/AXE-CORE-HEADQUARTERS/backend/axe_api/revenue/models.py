"""Dataclasses for the Demand Fusion Engine.

Plain dataclasses (not pydantic) so the core stays importable by the CLI and
tests without dragging FastAPI in. `router.py` converts at the edge.

Money is integer cents everywhere. Floats for currency is how ledgers start
disagreeing with Stripe.
"""

from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_id(prefix: str, *parts: str) -> str:
    """Deterministic id — the same input always produces the same id, so
    re-running a harvest dedupes instead of piling up near-duplicate rows."""
    digest = hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"


@dataclass
class DemandSignal:
    """One piece of public evidence that someone has a problem.

    `source` is the harvester that produced it; `url` must point at the real
    artifact so any claim downstream can be audited back to a human sentence
    somebody actually wrote.
    """

    id: str
    source: str
    title: str
    body: str = ""
    url: str = ""
    author_kind: str = "unknown"      # "asker" | "buyer" | "hirer" | "unknown"
    posted_at: str = ""               # ISO8601; blank = unknown, scored as old
    engagement: int = 0               # upvotes/replies/views — raw, source-relative
    budget_cents: Optional[int] = None  # only set when the post states a budget
    tags: list[str] = field(default_factory=list)
    harvested_at: str = field(default_factory=now_iso)

    @property
    def text(self) -> str:
        return f"{self.title}\n{self.body}".strip()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DemandSignal":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class ClusterScores:
    """The five factors behind a cluster's fusion score, kept separately so a
    low score is explainable ("plenty of pain, nobody pays") instead of an
    opaque number."""

    pain: float = 0.0                # how badly it hurts, lexically measured
    frequency: float = 0.0           # how many independent people said it
    recency: float = 0.0             # how fresh the evidence is
    willingness_to_pay: float = 0.0  # money language + stated budgets + source
    solvability_now: float = 0.0     # deliverable by one person in < 48h?

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


@dataclass
class DemandCluster:
    """A group of signals that are all the same underlying problem."""

    id: str
    label: str
    keywords: list[str]
    signal_ids: list[str]
    scores: ClusterScores
    fusion_score: float               # 0..100
    evidence_urls: list[str] = field(default_factory=list)
    stated_budgets_cents: list[int] = field(default_factory=list)
    created_at: str = field(default_factory=now_iso)

    @property
    def size(self) -> int:
        return len(self.signal_ids)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["scores"] = self.scores.to_dict()
        d["size"] = self.size
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DemandCluster":
        d = dict(d)
        d.pop("size", None)
        d["scores"] = ClusterScores(**d.get("scores", {}))
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class OfferTier:
    """One rung of the ladder. `fulfillment_minutes` is the honest cost side —
    a tier that takes 6 hours to deliver for $29 is a trap, and
    `offers.audit_stack()` flags it."""

    id: str
    rung: str                         # tripwire | core | stack | depth | retainer
    name: str
    price_cents: int
    promise: str
    deliverables: list[str]
    fulfillment_minutes: int
    recurring: bool = False
    refund_policy: str = "7-day no-questions refund"

    @property
    def hourly_cents(self) -> int:
        hours = max(self.fulfillment_minutes, 1) / 60
        return int(self.price_cents / hours)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["hourly_cents"] = self.hourly_cents
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OfferTier":
        d = dict(d)
        d.pop("hourly_cents", None)
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class OfferStack:
    id: str
    cluster_id: str
    product_name: str                 # the faceless brand the buyer sees
    positioning: str
    tiers: list[OfferTier]
    created_at: str = field(default_factory=now_iso)

    def tier(self, tier_id: str) -> Optional[OfferTier]:
        return next((t for t in self.tiers if t.id == tier_id), None)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "cluster_id": self.cluster_id,
            "product_name": self.product_name,
            "positioning": self.positioning,
            "tiers": [t.to_dict() for t in self.tiers],
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "OfferStack":
        return cls(
            id=d["id"],
            cluster_id=d["cluster_id"],
            product_name=d["product_name"],
            positioning=d.get("positioning", ""),
            tiers=[OfferTier.from_dict(t) for t in d.get("tiers", [])],
            created_at=d.get("created_at", now_iso()),
        )


@dataclass
class DistributionAsset:
    """A single piece of content queued for one channel, with the compliance
    facts attached to it rather than left to the operator's memory."""

    id: str
    channel: str
    offer_id: str
    tier_id: str
    headline: str
    body: str
    call_to_action: str
    tracked_url: str
    disclosure: str = ""
    identity: str = ""                # the one handle used on this channel
    status: str = "draft"             # draft | approved | published
    created_at: str = field(default_factory=now_iso)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DistributionAsset":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class LedgerEntry:
    """One measured experiment: what was shipped, where, and what came back.

    `revenue_cents` is settled money only. Pending/refunded does not count —
    the whole point of the ledger is that the reallocation maths is driven by
    money that actually cleared.
    """

    id: str
    offer_id: str
    tier_id: str
    channel: str
    reach: int = 0                    # impressions/views/sends — channel-native
    clicks: int = 0
    sales: int = 0
    revenue_cents: int = 0
    cost_cents: int = 0               # ad spend, fees, tools; usually 0 here
    effort_minutes: int = 0
    note: str = ""
    occurred_at: str = field(default_factory=now_iso)

    @property
    def net_cents(self) -> int:
        return self.revenue_cents - self.cost_cents

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["net_cents"] = self.net_cents
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "LedgerEntry":
        d = dict(d)
        d.pop("net_cents", None)
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


@dataclass
class LoopReport:
    """What one cycle actually did. `next_actions` is the only part a human
    needs to read — it is an ordered checklist, not a summary."""

    cycle: int
    ran_at: str
    signals_harvested: int
    clusters_formed: int
    top_cluster_id: Optional[str]
    offers_built: int
    assets_queued: int
    revenue_cents_to_date: int
    target_cents: int
    target_progress: float            # 0..1
    decisions: list[dict[str, Any]] = field(default_factory=list)
    next_actions: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
