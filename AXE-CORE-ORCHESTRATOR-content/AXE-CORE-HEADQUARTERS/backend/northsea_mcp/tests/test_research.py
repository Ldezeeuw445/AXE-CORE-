"""De zoekketen Tavily → Zenserp → Perplexity, met de echte antwoordvormen (gemeten 15 sep 2026)."""
from __future__ import annotations

import httpx
import pytest

from northsea_mcp.research import ResearchError, ResearchGateway, zenserp_url

TAVILY_432 = httpx.Response(432, json={"detail": {"error": "This request exceeds your plan's set usage limit."}})
ZENSERP_OK = {"organic": [
    {"title": "Copper Cathodes", "url": "https://www.google.com/goto?url=CAESYgHrOzAV",
     "destination": "https://jcmminingcorp.com › copper-cathodes", "description": "Grade A copper cathodes producer"},
    {"title": "Refinery", "url": "https://refinery.example/cathode", "destination": "refinery.example › cathode", "description": "refinery"},
]}
PERPLEXITY_OK = {"output": [
    {"type": "search_results", "results": [{"id": 1, "url": "https://kcm.example", "title": "KCM"}, {"id": 2, "url": "https://dir.example", "title": "Directory"}]},
    {"type": "message", "content": [{"type": "output_text", "text": "KCM - https://kcm.example [web:1]"}]}]}


def gateway(routes: dict, *, tavily="t", zenserp="z", api_key="k") -> ResearchGateway:
    def handler(req: httpx.Request) -> httpx.Response:
        for host, resp in routes.items():
            if req.url.host == host:
                return resp(req) if callable(resp) else resp
        return httpx.Response(404)
    return ResearchGateway(axe_api_url="http://api.test", axe_api_key=api_key, tavily_key=tavily, zenserp_key=zenserp,
                           client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_tavily_first_when_it_works():
    g = gateway({"api.tavily.com": httpx.Response(200, json={"results": [{"title": "A", "url": "https://a.example", "content": "x"}]})})
    r = await g.search("copper cathode producer", max_results=5)
    assert r.provider == "tavily" and r.fallbacks == [] and r.hits[0].url == "https://a.example"


async def test_tavily_quota_falls_back_to_zenserp_with_real_domain():
    g = gateway({"api.tavily.com": TAVILY_432, "app.zenserp.com": httpx.Response(200, json=ZENSERP_OK)})
    r = await g.search("copper cathode producer", max_results=5)
    assert r.provider == "zenserp" and r.fallbacks == ["tavily: budget_exhausted"]
    assert [h.url for h in r.hits] == ["https://jcmminingcorp.com", "https://refinery.example/cathode"]


async def test_zenserp_rejected_falls_back_to_perplexity_cited_sources():
    g = gateway({"api.tavily.com": TAVILY_432, "app.zenserp.com": httpx.Response(401, json={}),
                 "api.test": httpx.Response(200, json=PERPLEXITY_OK)})
    r = await g.search("copper cathode producer", max_results=5)
    assert r.provider == "perplexity"
    assert r.fallbacks == ["tavily: budget_exhausted", "zenserp: not_configured"]
    assert [h.url for h in r.hits] == ["https://kcm.example"]   # alleen geciteerd


async def test_all_providers_failing_reports_budget_and_every_attempt():
    g = gateway({"api.tavily.com": TAVILY_432, "app.zenserp.com": httpx.Response(429, json={}),
                 "api.test": httpx.Response(402, json={"detail": "budget"})})
    with pytest.raises(ResearchError) as e:
        await g.search("copper cathode producer", max_results=5)
    assert e.value.status == "budget_exhausted"
    assert "tavily: budget_exhausted" in e.value.message and "perplexity: budget_exhausted" in e.value.message


async def test_unconfigured_chain_is_not_configured():
    g = gateway({}, tavily="", zenserp="", api_key="")
    with pytest.raises(ResearchError) as e:
        await g.search("x", max_results=3)
    assert e.value.status == "not_configured"


def test_zenserp_url_unwraps_google_redirects():
    assert zenserp_url({"url": "https://www.google.com/goto?url=abc", "destination": "https://site.example › a › b"}) == "https://site.example"
    assert zenserp_url({"url": "https://direct.example/page", "destination": "x"}) == "https://direct.example/page"
    assert zenserp_url({"url": "https://www.google.com/goto?url=abc", "destination": ""}) is None
