"""Extern onderzoek via wat AXE CORE al heeft. Geen eigen provider-sleutels.

- Vragen met bronnen: de bestaande route `/research/perplexity` van axe-core-api
  (op dezelfde box, via localhost). Het dagbudget (vragen en dollars) staat daar
  server-side; door daar langs te gaan telt een MCP-vraag mee in hetzelfde
  budget als AXE CORE zelf. Een tweede sleutel hier zou dat budget omzeilen.
- Zoekresultaten (kandidaten vinden): Tavily, met de sleutel die al op de box
  staat (`TAVILY_API_KEY`). Goedkoper dan een Perplexity-vraag per zoekterm; de
  NorthSea COST_ROUTER zet zoeken vóór premium synthese.

Het antwoord-formaat van Perplexity is gemeten, niet uit de docs: zie
src/domain/perplexityAgent.ts in AXE CORE (citaten als `[web:N]`, geopende
pagina's onder `contents`). `parse_agent_answer` is daar een port van.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from .models import ResearchRun, SourceRef

WEB_REF = re.compile(r"\[web:(\d+)\]")

PRESET_BY_PRIORITY = {"P0": "medium", "P1": "low", "P2": "low", "P3": "fast"}
CALLS_BY_PRIORITY = {"P0": 4, "P1": 3, "P2": 2, "P3": 1}
SEARCH_RESULTS_BY_PRIORITY = {"P0": 10, "P1": 8, "P2": 6, "P3": 4}


@dataclass
class Answer:
    text: str
    sources: list[SourceRef]
    cost_usd: float
    model: str


@dataclass
class SearchHit:
    title: str
    url: str
    content: str
    score: float


@dataclass
class Budget:
    """Per run (crewai/BUDGETS.md): nooit een open lus."""
    priority: str = "P2"
    calls_left: int = 2
    runs: list[ResearchRun] = field(default_factory=list)
    cost_usd: float = 0.0

    @classmethod
    def for_priority(cls, priority: str) -> "Budget":
        return cls(priority=priority, calls_left=CALLS_BY_PRIORITY.get(priority, 2))

    def take(self) -> bool:
        if self.calls_left <= 0:
            return False
        self.calls_left -= 1
        return True


class ResearchError(Exception):
    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def parse_agent_answer(raw: Any) -> Answer:
    root = raw if isinstance(raw, dict) else {}
    texts: list[str] = []
    by_url: dict[str, SourceRef] = {}
    ids: dict[str, int] = {}

    def add(url: str, title: str, cited: bool, rid: int | None = None) -> None:
        if not url:
            return
        if url in by_url:
            s = by_url[url]
            s.cited = s.cited or cited
            if not s.title and title:
                s.title = title
        else:
            by_url[url] = SourceRef(url=url, title=title or None, provider="perplexity", cited=cited)
        if rid is not None and url not in ids:
            ids[url] = rid

    for item in root.get("output") or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "message":
            for blok in item.get("content") or []:
                if isinstance(blok, dict) and blok.get("type") == "output_text":
                    if isinstance(blok.get("text"), str) and blok["text"]:
                        texts.append(blok["text"])
                    for a in blok.get("annotations") or []:
                        if isinstance(a, dict) and a.get("type") == "url_citation":
                            add(str(a.get("url") or ""), str(a.get("title") or ""), True)
        elif item.get("type") == "search_results":
            for r in item.get("results") or []:
                if isinstance(r, dict):
                    rid = r.get("id") if isinstance(r.get("id"), int) else None
                    add(str(r.get("url") or ""), str(r.get("title") or ""), False, rid)
        elif item.get("type") == "fetch_url_results":
            for r in [*(item.get("contents") or []), *(item.get("results") or [])]:
                if isinstance(r, dict):
                    add(str(r.get("url") or ""), str(r.get("title") or ""), False)

    text = "\n\n".join(texts).strip()
    cited_ids = {int(m) for m in WEB_REF.findall(text)}
    for url, rid in ids.items():
        if rid in cited_ids:
            by_url[url].cited = True
    usage = root.get("usage") if isinstance(root.get("usage"), dict) else {}
    cost = usage.get("cost") if isinstance(usage.get("cost"), dict) else {}
    try:
        cost_usd = max(0.0, float(cost.get("total_cost") or 0))
    except (TypeError, ValueError):
        cost_usd = 0.0
    sources = sorted(by_url.values(), key=lambda s: not s.cited)
    return Answer(text=text, sources=sources, cost_usd=cost_usd, model=str(root.get("model") or ""))


def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    m = re.match(r"^(?:[a-z]+://)?(?:www\.)?([^/:?#]+)", url.strip().lower())
    return m.group(1) if m and "." in m.group(1) else None


class ResearchGateway:
    def __init__(self, *, axe_api_url: str, axe_api_key: str, tavily_key: str, timeout: float = 130.0,
                 client: httpx.AsyncClient | None = None):
        self._api = axe_api_url.rstrip("/")
        self._api_key = axe_api_key
        self._tavily = tavily_key
        self._client = client or httpx.AsyncClient(timeout=timeout)

    @property
    def perplexity_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def search_configured(self) -> bool:
        return bool(self._tavily)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def ask(self, question: str, *, instructions: str, priority: str) -> Answer:
        if not self._api_key:
            raise ResearchError("not_configured", "Perplexity research is not configured on this server.")
        try:
            r = await self._client.post(
                f"{self._api}/research/perplexity",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"question": question[:2000], "instructions": instructions[:2000],
                      "preset": PRESET_BY_PRIORITY.get(priority, "low")},
            )
        except httpx.HTTPError as e:
            raise ResearchError("provider_error", f"Research service unreachable ({type(e).__name__}).") from e
        if r.status_code == 402:
            raise ResearchError("budget_exhausted", "The shared daily research budget is spent. Resets at 00:00 UTC.")
        if r.status_code in (404, 503):
            raise ResearchError("not_configured", "Research route is not available on the AXE API.")
        if r.status_code == 429:
            raise ResearchError("provider_error", "Research provider is rate limited; retry later.")
        if r.status_code >= 400:
            raise ResearchError("provider_error", f"Research request failed ({r.status_code}).")
        return parse_agent_answer(r.json())

    async def search(self, query: str, *, max_results: int) -> list[SearchHit]:
        if not self._tavily:
            raise ResearchError("not_configured", "Web search (Tavily) is not configured on this server.")
        try:
            r = await self._client.post("https://api.tavily.com/search", json={
                "api_key": self._tavily, "query": query[:400], "max_results": max(1, min(max_results, 10)),
                "search_depth": "basic", "include_answer": False,
            }, timeout=40)
        except httpx.HTTPError as e:
            raise ResearchError("provider_error", f"Web search unreachable ({type(e).__name__}).") from e
        if r.status_code in (401, 403):
            raise ResearchError("not_configured", "Web search key was rejected.")
        if r.status_code == 429 or r.status_code == 432:
            raise ResearchError("budget_exhausted", "Web search quota reached.")
        if r.status_code >= 400:
            raise ResearchError("provider_error", f"Web search failed ({r.status_code}).")
        hits = []
        for x in (r.json().get("results") or []):
            if isinstance(x, dict) and x.get("url"):
                hits.append(SearchHit(title=str(x.get("title") or ""), url=str(x["url"]),
                                      content=str(x.get("content") or "")[:1500], score=float(x.get("score") or 0)))
        return hits
