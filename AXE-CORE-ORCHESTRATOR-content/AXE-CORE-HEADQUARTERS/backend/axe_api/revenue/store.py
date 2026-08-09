"""State for the revenue loop.

Default is a single JSON file — the whole engine has to work on a laptop with
no database, because that is the situation it was built for. `SupabaseStore`
is the same interface backed by `core_revenue_*` tables for when it runs on the
VPS next to the rest of axe_api.

Writes are atomic (temp file + rename). A half-written ledger is worse than no
ledger: it silently changes what the loop believes is working.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional

from .models import (
    DemandCluster,
    DemandSignal,
    DistributionAsset,
    LedgerEntry,
    OfferStack,
)

DEFAULT_STATE_PATH = Path(
    os.environ.get("REVENUE_STATE_PATH", str(Path.home() / ".axe" / "revenue_state.json"))
)

_EMPTY: dict[str, Any] = {
    "version": 1,
    "cycle": 0,
    "target_cents": 33000,
    "scale_target_cents": 900000,
    "signals": [],
    "clusters": [],
    "offers": [],
    "assets": [],
    "ledger": [],
    "reports": [],
}


class JsonStore:
    """File-backed state. Everything is loaded and rewritten on each save —
    fine at this scale (thousands of rows), and it keeps the file readable and
    hand-editable, which matters when the operator wants to correct a sale."""

    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path else DEFAULT_STATE_PATH
        self._data: dict[str, Any] = json.loads(json.dumps(_EMPTY))
        if self.path.exists():
            try:
                self._data = {**self._data, **json.loads(self.path.read_text(encoding="utf-8"))}
            except json.JSONDecodeError as e:
                raise ValueError(f"revenue state at {self.path} is not valid JSON: {e}") from e

    # ── raw access ────────────────────────────────────────────────────────────
    @property
    def data(self) -> dict[str, Any]:
        return self._data

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self.path.parent), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, indent=2, sort_keys=False)
            os.replace(tmp, self.path)
        except Exception:
            Path(tmp).unlink(missing_ok=True)
            raise

    # ── typed collections ─────────────────────────────────────────────────────
    def signals(self) -> list[DemandSignal]:
        return [DemandSignal.from_dict(d) for d in self._data["signals"]]

    def clusters(self) -> list[DemandCluster]:
        return [DemandCluster.from_dict(d) for d in self._data["clusters"]]

    def offers(self) -> list[OfferStack]:
        return [OfferStack.from_dict(d) for d in self._data["offers"]]

    def assets(self) -> list[DistributionAsset]:
        return [DistributionAsset.from_dict(d) for d in self._data["assets"]]

    def ledger(self) -> list[LedgerEntry]:
        return [LedgerEntry.from_dict(d) for d in self._data["ledger"]]

    # ── upserts (id-keyed, so re-running a cycle updates instead of duplicating)
    def _upsert(self, bucket: str, rows: list[dict[str, Any]]) -> int:
        existing = {r["id"]: r for r in self._data[bucket]}
        added = 0
        for row in rows:
            if row["id"] not in existing:
                added += 1
            existing[row["id"]] = row
        self._data[bucket] = list(existing.values())
        return added

    def put_signals(self, items: list[DemandSignal]) -> int:
        return self._upsert("signals", [i.to_dict() for i in items])

    def put_clusters(self, items: list[DemandCluster]) -> int:
        # Clusters are rebuilt from scratch each fuse — replace, do not merge,
        # or yesterday's clustering lingers next to today's and both look live.
        self._data["clusters"] = [i.to_dict() for i in items]
        return len(items)

    def put_offers(self, items: list[OfferStack]) -> int:
        return self._upsert("offers", [i.to_dict() for i in items])

    def put_assets(self, items: list[DistributionAsset]) -> int:
        return self._upsert("assets", [i.to_dict() for i in items])

    def put_ledger(self, items: list[LedgerEntry]) -> int:
        return self._upsert("ledger", [i.to_dict() for i in items])

    def append_report(self, report: dict[str, Any]) -> None:
        self._data["reports"].append(report)
        self._data["reports"] = self._data["reports"][-50:]

    # ── settings ──────────────────────────────────────────────────────────────
    @property
    def cycle(self) -> int:
        return int(self._data.get("cycle", 0))

    def bump_cycle(self) -> int:
        self._data["cycle"] = self.cycle + 1
        return self._data["cycle"]

    @property
    def target_cents(self) -> int:
        return int(self._data.get("target_cents", 33000))

    @property
    def scale_target_cents(self) -> int:
        return int(self._data.get("scale_target_cents", 900000))

    def set_targets(self, first: Optional[int] = None, scale: Optional[int] = None) -> None:
        if first is not None:
            self._data["target_cents"] = int(first)
        if scale is not None:
            self._data["scale_target_cents"] = int(scale)


class SupabaseStore(JsonStore):
    """Same interface, Supabase-backed, for the VPS deployment.

    Subclasses JsonStore so the local file stays the working copy and Postgres
    is the durable mirror: if Supabase is unreachable mid-cycle the loop still
    completes locally instead of losing the run. `sync()` pushes; construction
    pulls.
    """

    TABLES = {
        "signals": "core_revenue_signals",
        "clusters": "core_revenue_clusters",
        "offers": "core_revenue_offers",
        "assets": "core_revenue_assets",
        "ledger": "core_revenue_ledger",
    }

    def __init__(self, client: Any, path: Optional[Path] = None, pull: bool = True):
        super().__init__(path)
        self.client = client
        if pull:
            self.pull()

    def pull(self) -> None:
        for bucket, table in self.TABLES.items():
            try:
                res = self.client.table(table).select("payload").limit(5000).execute()
            except Exception:  # noqa: BLE001 — offline is a valid state, not a crash
                continue
            rows = [r["payload"] for r in (res.data or []) if r.get("payload")]
            if rows:
                self._data[bucket] = rows

    @staticmethod
    def _row(bucket: str, r: dict[str, Any]) -> dict[str, Any]:
        """Envelope + the handful of columns promoted out of the payload so the
        dashboard indexes in the migration are actually usable."""
        base = {"id": r["id"], "payload": r}
        if bucket == "signals":
            return {**base, "source": r.get("source"), "url": r.get("url"),
                    "posted_at": r.get("posted_at") or None}
        if bucket == "clusters":
            return {**base, "label": r.get("label"), "fusion_score": r.get("fusion_score"),
                    "signal_count": len(r.get("signal_ids") or [])}
        if bucket == "offers":
            return {**base, "cluster_id": r.get("cluster_id"), "product_name": r.get("product_name")}
        if bucket == "assets":
            return {**base, "offer_id": r.get("offer_id"), "channel": r.get("channel"),
                    "status": r.get("status", "draft")}
        if bucket == "ledger":
            return {**base, "offer_id": r.get("offer_id"), "tier_id": r.get("tier_id"),
                    "channel": r.get("channel"), "reach": r.get("reach", 0),
                    "clicks": r.get("clicks", 0), "sales": r.get("sales", 0),
                    "revenue_cents": r.get("revenue_cents", 0),
                    "cost_cents": r.get("cost_cents", 0),
                    "occurred_at": r.get("occurred_at") or None}
        return base

    def sync(self) -> dict[str, int]:
        """Push local state up. Returns rows written per table; a table that
        fails is reported as -1 rather than raising, because a failed mirror
        must not lose the cycle that just ran locally."""
        written: dict[str, int] = {}
        for bucket, table in self.TABLES.items():
            rows = [self._row(bucket, r) for r in self._data[bucket]]
            if not rows:
                written[table] = 0
                continue
            try:
                self.client.table(table).upsert(rows, on_conflict="id").execute()
                written[table] = len(rows)
            except Exception:  # noqa: BLE001
                written[table] = -1
        return written

    def save(self) -> None:
        super().save()
        self.sync()
