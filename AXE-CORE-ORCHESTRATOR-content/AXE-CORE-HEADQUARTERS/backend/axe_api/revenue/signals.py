"""Harvesters — where the raw demand evidence comes from.

Only public, read-only, no-key endpoints are used: HN Algolia, StackExchange,
Reddit's public JSON, and Lemmy. No logins, no scraping behind auth, no
paid API required to start. Every harvester is best-effort by contract (same
rule as `osint/`): a dead source returns an empty list with a warning, it never
takes the cycle down with it.

`harvest_offline()` reads the bundled seed corpus so the entire engine — and
its tests — run with the network unplugged.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional, Sequence

from .models import DemandSignal, stable_id

log = logging.getLogger("axe_core_api.revenue.signals")

SEED_PATH = Path(__file__).with_name("seed_signals.json")

USER_AGENT = os.environ.get(
    "REVENUE_USER_AGENT",
    "axe-core-demand-fusion/1.0 (+https://www.axeheadquarters.com; contact via site)",
)
HTTP_TIMEOUT = float(os.environ.get("REVENUE_HTTP_TIMEOUT", "12"))

# Per-source cap so one loud source cannot dominate a cluster by volume alone.
PER_SOURCE_LIMIT = 40


def _iso(epoch: Optional[float]) -> str:
    if not epoch:
        return ""
    return datetime.fromtimestamp(float(epoch), tz=timezone.utc).isoformat()


def _clip(text: str, limit: int = 1200) -> str:
    text = (text or "").replace("\r", " ").strip()
    return text[:limit]


# ── offline / seed ────────────────────────────────────────────────────────────

def harvest_offline(path: Optional[Path] = None) -> list[DemandSignal]:
    """Load the bundled corpus. These are hand-written *examples* of the shape
    real signals take — they are labelled source="seed" so nothing downstream
    can mistake them for live market evidence."""
    p = path or SEED_PATH
    if not p.exists():
        return []
    raw = json.loads(p.read_text(encoding="utf-8"))
    return [DemandSignal.from_dict(item) for item in raw]


def from_records(records: Iterable[dict[str, Any]], source: str = "manual") -> list[DemandSignal]:
    """Turn arbitrary dicts (a CSV export, a hand-pasted list of leads) into
    signals. The operator's own inbox is usually the highest-quality source
    there is, and it has no API."""
    out: list[DemandSignal] = []
    for r in records:
        title = str(r.get("title") or r.get("subject") or "").strip()
        body = str(r.get("body") or r.get("text") or "")
        if not title and not body:
            continue
        url = str(r.get("url") or "")
        out.append(
            DemandSignal(
                id=stable_id("sig", source, url or title),
                source=str(r.get("source") or source),
                title=title or _clip(body, 90),
                body=_clip(body),
                url=url,
                author_kind=str(r.get("author_kind") or "unknown"),
                posted_at=str(r.get("posted_at") or ""),
                engagement=int(r.get("engagement") or 0),
                budget_cents=r.get("budget_cents"),
                tags=list(r.get("tags") or []),
            )
        )
    return out


# ── live harvesters ───────────────────────────────────────────────────────────

async def _get_json(client: Any, url: str, params: dict[str, Any]) -> Optional[Any]:
    try:
        resp = await client.get(url, params=params, headers={"User-Agent": USER_AGENT})
        if resp.status_code != 200:
            log.warning("revenue harvest %s → HTTP %s", url, resp.status_code)
            return None
        return resp.json()
    except Exception as e:  # noqa: BLE001 — harvesters are best-effort by contract
        log.warning("revenue harvest %s failed: %s", url, e)
        return None


async def harvest_hackernews(client: Any, query: str, limit: int = PER_SOURCE_LIMIT) -> list[DemandSignal]:
    data = await _get_json(
        client,
        "https://hn.algolia.com/api/v1/search_by_date",
        {"query": query, "tags": "(story,comment)", "hitsPerPage": min(limit, 50)},
    )
    if not data:
        return []
    out = []
    for hit in data.get("hits", []):
        title = hit.get("title") or hit.get("story_title") or ""
        body = hit.get("comment_text") or hit.get("story_text") or ""
        if not (title or body):
            continue
        oid = hit.get("objectID", "")
        out.append(
            DemandSignal(
                id=stable_id("sig", "hackernews", oid),
                source="hackernews",
                title=_clip(title or body, 140),
                body=_clip(body),
                url=f"https://news.ycombinator.com/item?id={oid}",
                author_kind="asker",
                posted_at=_iso(hit.get("created_at_i")),
                engagement=int(hit.get("points") or 0),
                tags=[query],
            )
        )
    return out


async def harvest_stackexchange(
    client: Any, query: str, site: str = "stackoverflow", limit: int = PER_SOURCE_LIMIT
) -> list[DemandSignal]:
    data = await _get_json(
        client,
        "https://api.stackexchange.com/2.3/search/advanced",
        {
            "order": "desc", "sort": "creation", "q": query, "site": site,
            "pagesize": min(limit, 50), "filter": "withbody",
        },
    )
    if not data:
        return []
    out = []
    for item in data.get("items", []):
        out.append(
            DemandSignal(
                id=stable_id("sig", "stackexchange", str(item.get("question_id"))),
                source="stackexchange",
                title=_clip(item.get("title", ""), 140),
                body=_clip(item.get("body", "")),
                url=item.get("link", ""),
                author_kind="asker",
                posted_at=_iso(item.get("creation_date")),
                engagement=int(item.get("score") or 0) + int(item.get("view_count") or 0) // 100,
                tags=list(item.get("tags") or [])[:5],
            )
        )
    return out


async def harvest_reddit(client: Any, query: str, limit: int = PER_SOURCE_LIMIT) -> list[DemandSignal]:
    """Reddit's public search JSON. It rate-limits hard and 403s an empty
    User-Agent, hence USER_AGENT above; on a block we return [] and the cycle
    carries on with the other sources."""
    data = await _get_json(
        client,
        "https://www.reddit.com/search.json",
        {"q": query, "sort": "new", "limit": min(limit, 50), "t": "month", "raw_json": 1},
    )
    if not data:
        return []
    out = []
    for child in data.get("data", {}).get("children", []):
        d = child.get("data", {})
        out.append(
            DemandSignal(
                id=stable_id("sig", "reddit", d.get("id", "")),
                source="reddit",
                title=_clip(d.get("title", ""), 140),
                body=_clip(d.get("selftext", "")),
                url="https://www.reddit.com" + d.get("permalink", ""),
                author_kind="asker",
                posted_at=_iso(d.get("created_utc")),
                engagement=int(d.get("score") or 0) + int(d.get("num_comments") or 0),
                tags=[d.get("subreddit", "")] if d.get("subreddit") else [],
            )
        )
    return out


async def harvest_lemmy(client: Any, query: str, limit: int = PER_SOURCE_LIMIT) -> list[DemandSignal]:
    data = await _get_json(
        client,
        "https://lemmy.world/api/v3/search",
        {"q": query, "type_": "Posts", "sort": "New", "limit": min(limit, 50)},
    )
    if not data:
        return []
    out = []
    for p in data.get("posts", []):
        post = p.get("post", {})
        counts = p.get("counts", {})
        out.append(
            DemandSignal(
                id=stable_id("sig", "lemmy", str(post.get("id", ""))),
                source="forum",
                title=_clip(post.get("name", ""), 140),
                body=_clip(post.get("body", "") or ""),
                url=post.get("ap_id", ""),
                author_kind="asker",
                posted_at=str(post.get("published", "")),
                engagement=int(counts.get("score") or 0) + int(counts.get("comments") or 0),
                tags=[query],
            )
        )
    return out


HARVESTERS = {
    "hackernews": harvest_hackernews,
    "stackexchange": harvest_stackexchange,
    "reddit": harvest_reddit,
    "lemmy": harvest_lemmy,
}


async def harvest_live(
    queries: Sequence[str],
    sources: Optional[Sequence[str]] = None,
    limit_per_source: int = PER_SOURCE_LIMIT,
) -> tuple[list[DemandSignal], list[str]]:
    """Fan out every query across every source concurrently.

    Returns (signals, warnings). A source that yields nothing shows up in
    warnings rather than being silently absent — an empty harvest that looks
    like "no demand" but is really "Reddit blocked us" would poison every
    decision downstream.
    """
    import httpx  # imported here so the module imports fine without httpx

    picked = list(sources or HARVESTERS.keys())
    unknown = [s for s in picked if s not in HARVESTERS]
    picked = [s for s in picked if s in HARVESTERS]
    warnings = [f"unknown source ignored: {s}" for s in unknown]

    if not queries:
        return [], warnings + ["no queries given — nothing harvested"]

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True) as client:
        jobs = [
            HARVESTERS[src](client, q, limit_per_source)
            for src in picked
            for q in queries
        ]
        results = await asyncio.gather(*jobs, return_exceptions=True)

    signals: list[DemandSignal] = []
    per_source: dict[str, int] = {s: 0 for s in picked}
    for (src, _q), res in zip(
        [(s, q) for s in picked for q in queries], results
    ):
        if isinstance(res, Exception):
            warnings.append(f"{src}: {type(res).__name__}: {res}")
            continue
        per_source[src] += len(res)
        signals.extend(res)

    for src, count in per_source.items():
        if count == 0:
            warnings.append(f"{src}: 0 signals (blocked, rate-limited, or genuinely empty)")

    return signals, warnings
