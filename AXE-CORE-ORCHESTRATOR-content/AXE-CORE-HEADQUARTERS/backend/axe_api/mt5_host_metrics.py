"""CPU/RAM/disk for the Strato MT5-bridge VPS, for /lockscreen/snapshot.

Tries the bridge's authenticated /host/metrics first, then a read-only SSH
probe (the same LINUX_PROBE as the modelbox). Remembers the last good
reading, with its time and source, so a short outage shows a stale value
instead of a fabricated one or a blank.

Nothing here opens a trade or talks to the broker.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

STALE_AFTER_S = 120.0
DEFAULT_METRICS_URL = "https://mt5-bridge.axecompanion.com/host/metrics"
SOURCE_RANK = {"endpoint": 0, "ssh": 1}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        ts = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def _num(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n:
        return None
    return round(max(0.0, min(100.0, n)), 1)


def has_numbers(row: Optional[dict]) -> bool:
    if not row:
        return False
    return any(_num(row.get(k)) is not None for k in ("cpu", "mem", "disk"))


def normalize(row: Optional[dict], source: str, measured_at: Optional[Any] = None) -> Optional[dict]:
    """Keep only cpu/mem/disk + source + time. Drops login, account, tokens."""
    if not has_numbers(row):
        return None
    ts = parse_ts(measured_at if measured_at is not None else (row or {}).get("measured_at"))
    return {
        "cpu": _num(row.get("cpu")),
        "mem": _num(row.get("mem")),
        "disk": _num(row.get("disk")),
        "source": source,
        "measured_at": to_iso(ts) if ts else None,
    }


def age_seconds(row: Optional[dict], now: Optional[datetime] = None) -> Optional[int]:
    ts = parse_ts((row or {}).get("measured_at"))
    if ts is None:
        return None
    return int(max(0, (now or now_utc()).timestamp() - ts.timestamp()))


def is_fresh(row: Optional[dict], now: Optional[datetime] = None, stale_after: float = STALE_AFTER_S) -> bool:
    if not has_numbers(row):
        return False
    age = age_seconds(row, now)
    if age is None:
        # A live SSH probe with no clock is treated as fresh: we just took it.
        return (row or {}).get("source") == "ssh"
    return age <= stale_after


def choose(
    endpoint: Optional[dict],
    ssh: Optional[dict],
    last_good: Optional[dict],
    now: Optional[datetime] = None,
    stale_after: float = STALE_AFTER_S,
) -> dict:
    """The best real reading. Never invents a number that was not measured."""
    now = now or now_utc()
    candidates: list[dict] = []
    for row, source in ((endpoint, "endpoint"), (ssh, "ssh"), (last_good, None)):
        src = source or (row or {}).get("source") or "endpoint"
        norm = normalize(row, src, None if row is None else row.get("measured_at"))
        if norm:
            candidates.append(norm)
    if not candidates:
        return {
            "cpu": None, "mem": None, "disk": None,
            "source": None, "measured_at": None, "age_seconds": None, "stale": False,
        }

    def key(row: dict) -> tuple:
        ts = parse_ts(row.get("measured_at"))
        # Newer first. If the clock is missing, SSH (just measured) beats a cache.
        when = ts.timestamp() if ts else (now.timestamp() if row.get("source") == "ssh" else 0.0)
        return (when, -SOURCE_RANK.get(row.get("source") or "", 9))

    best = max(candidates, key=key)
    age = age_seconds(best, now)
    # A brand-new SSH reading without a timestamp is not stale.
    stale = False if age is None and best.get("source") == "ssh" else (age is None or age > stale_after)
    if age is None and best.get("source") == "ssh":
        best["measured_at"] = to_iso(now)
        age = 0
        stale = False
    return {**best, "age_seconds": age, "stale": stale}


class LastGood:
    """Last good MT5 host reading, in memory and optionally on disk (survives a restart)."""

    def __init__(self, pad: str | None = None) -> None:
        self._pad = pad if pad is not None else os.environ.get("AXE_MT5_METRICS_CACHE") or ""
        self._row: Optional[dict] = self._lees()

    def get(self) -> Optional[dict]:
        return dict(self._row) if self._row else None

    def put(self, row: Optional[dict]) -> None:
        if not has_numbers(row):
            return
        # Do not overwrite a good cache with a stale echo of itself.
        if (row or {}).get("stale") and self._row:
            return
        self._row = {
            k: row[k] for k in ("cpu", "mem", "disk", "source", "measured_at") if k in row
        }
        self._schrijf()

    def _lees(self) -> Optional[dict]:
        if not self._pad:
            return None
        try:
            with open(self._pad, encoding="utf-8") as f:
                raw = json.load(f)
        except (OSError, ValueError):
            return None
        return normalize(raw, (raw or {}).get("source") or "endpoint", (raw or {}).get("measured_at"))

    def _schrijf(self) -> None:
        if not self._pad or not self._row:
            return
        try:
            os.makedirs(os.path.dirname(self._pad) or ".", exist_ok=True)
            tmp = self._pad + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._row, f)
            os.replace(tmp, self._pad)
        except OSError:
            return


def snapshot_row(online: bool, picked: dict) -> dict:
    """One systems[] row for the lockscreen snapshot."""
    return {
        "id": "mt5bridge",
        "name": "VPS MT5 bridge",
        "online": bool(online),
        "cpu": picked.get("cpu"),
        "mem": picked.get("mem"),
        "disk": picked.get("disk"),
        "source": picked.get("source"),
        "measured_at": picked.get("measured_at"),
        "age_seconds": picked.get("age_seconds"),
        "stale": bool(picked.get("stale")),
    }


def metrics_url(env: Optional[dict] = None) -> str:
    env = os.environ if env is None else env
    return (env.get("MT5_BRIDGE_METRICS_URL") or DEFAULT_METRICS_URL).strip()


def metrics_token(env: Optional[dict] = None) -> str:
    env = os.environ if env is None else env
    return (env.get("MT5_BRIDGE_METRICS_TOKEN") or env.get("MT5_BRIDGE_TOKEN") or "").strip()
