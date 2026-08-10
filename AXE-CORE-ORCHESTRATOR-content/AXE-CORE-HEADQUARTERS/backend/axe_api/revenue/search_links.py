"""Ready-to-click search URLs for finding people who asked the question today.

The automated harvesters in `signals.py` are the scaled version of this, but
they get rate-limited and blocked, and they cannot read a thread's tone. A
human opening five links and reading five real posts learns more in ten minutes
than a keyword scraper does in a week — especially at the start, when the whole
job is to find out whether these people exist at all.

So this builds the links rather than the answers: one URL per source per query,
scoped to recent posts, pointed at the communities where the question actually
gets asked. Nothing is fetched here; it just prints where to look.
"""

from __future__ import annotations

from typing import Iterable, Optional
from urllib.parse import quote_plus

# Reddit's search is weak on its own but strong when restricted to the right
# subreddits, which is why packs carry a community list.
PROVIDERS = ("reddit", "google", "hackernews", "stackexchange")


def reddit_url(query: str, communities: Iterable[str] = (), months: int = 1) -> str:
    subs = "+".join(c.lstrip("r/") for c in communities if c.startswith("r/"))
    window = "month" if months <= 1 else "year"
    base = f"https://www.reddit.com/r/{subs}/search/" if subs else "https://www.reddit.com/search/"
    restrict = "&restrict_sr=1" if subs else ""
    return f"{base}?q={quote_plus(query)}{restrict}&sort=new&t={window}"


def google_url(query: str, site: str = "reddit.com", months: int = 1) -> str:
    """Google indexes forum threads better than the forums search themselves.
    `tbs=qdr:m` limits to the last month — an unanswered question from 2019 is
    not a lead."""
    scope = f"site:{site} " if site else ""
    window = "qdr:m" if months <= 1 else "qdr:y"
    return f"https://www.google.com/search?q={quote_plus(scope + query)}&tbs={window}"


def hackernews_url(query: str) -> str:
    return f"https://hn.algolia.com/?q={quote_plus(query)}&sort=byDate&type=all"


def stackexchange_url(query: str) -> str:
    return f"https://stackoverflow.com/search?q={quote_plus(query)}&tab=Newest"


def build_links(
    query: str,
    communities: Iterable[str] = (),
    providers: Optional[Iterable[str]] = None,
    months: int = 1,
) -> dict[str, str]:
    picked = list(providers or PROVIDERS)
    communities = list(communities)
    out: dict[str, str] = {}
    if "reddit" in picked:
        out["reddit"] = reddit_url(query, communities, months)
    if "google" in picked:
        out["google"] = google_url(query, months=months)
    if "hackernews" in picked:
        out["hackernews"] = hackernews_url(query)
    if "stackexchange" in picked:
        out["stackexchange"] = stackexchange_url(query)
    return out


def find_report(
    queries: Iterable[str],
    communities: Iterable[str] = (),
    providers: Optional[Iterable[str]] = None,
    months: int = 1,
    limit: int = 5,
) -> list[dict]:
    """One block per query. `limit` keeps a session finishable: five queries is
    roughly an hour of reading and answering, which is the actual daily budget."""
    return [
        {"query": q, "links": build_links(q, communities, providers, months)}
        for q in list(queries)[:limit]
    ]
