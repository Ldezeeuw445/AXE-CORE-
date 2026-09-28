"""run_counterparty_sourcing: real search hits feed the existing evidence/dedupe/fit pipeline
instead of the never-implemented exa_search live path. See discovery.py's crew_assisted_review,
which is the only real caller of the web_hits path -- these tests pin the contract between them."""
from __future__ import annotations

from northsea_mcp.crews.specialists import run_counterparty_sourcing
from northsea_mcp.crews.tools import MockExaTool


def test_web_hits_are_used_directly_without_ever_calling_exa_search():
    exa = MockExaTool()  # live=False -- would return {"hits": [], "warning": "EXA_API_KEY not configured..."}
    handoff = {"payload": {"direction": "find_supplier", "commodity": "Copper", "geography": "Zambia",
                           "web_hits": [{"title": "Mopani Copper Mines", "url": "https://www.mopani.com/products"}],
                           "web_hits_provider": "tavily"}}
    out = run_counterparty_sourcing(handoff, exa=exa)
    assert exa.calls == []  # exa_search nooit aangeroepen: web_hits ging voor
    assert len(out["candidates"]) == 1 and out["candidates"][0]["name"] == "Mopani Copper Mines"
    assert out["candidates"][0]["url"] == "https://www.mopani.com/products"
    assert "tavily" in out["analysis"]


def test_web_hits_produce_real_evidence_with_source_urls():
    handoff = {"payload": {"direction": "find_supplier", "commodity": "Copper Cathode",
                           "web_hits": [{"title": "Kansanshi refinery", "url": "https://kansanshi.example/cathode"}],
                           "web_hits_provider": "zenserp"}}
    out = run_counterparty_sourcing(handoff)
    kandidaat = out["candidates"][0]
    identiteit = next(f for f in kandidaat["facts"] if f["field"] == "identity")
    assert identiteit["source"] == "https://kansanshi.example/cathode"
    assert identiteit["level"] in ("VERIFIED", "SELF-CLAIMED", "INFERRED")  # nooit blind VERIFIED zonder bron-check
    assert any(e["source"] == "https://kansanshi.example/cathode" for e in out["evidence"])


def test_web_hits_still_dedupes_and_rejects_brokers():
    handoff = {"payload": {"direction": "find_supplier", "commodity": "Copper",
                           "web_hits": [{"title": "Same Producer Ltd", "url": "https://a.example"},
                                       {"title": "same producer ltd", "url": "https://a-dup.example"},
                                       {"title": "Copper Broker Marketplace", "url": "https://broker.example"}],
                           "web_hits_provider": "tavily"}}
    out = run_counterparty_sourcing(handoff)
    namen = [c["name"] for c in out["candidates"]]
    assert namen.count("Same Producer Ltd") == 1  # gededupliceerd op naam, ongeacht hoofdletters
    assert not any("broker" in c["name"].lower() for c in out["candidates"])  # marketplace/broker = fit_score 0 -> rejected
    assert any("Broker" in r["name"] for r in out["rejected"])


def test_no_web_hits_falls_back_to_the_original_exa_tool_unchanged():
    """Backward compatibility: a caller that never sets web_hits (there are none besides
    discovery.py today) still gets the original exa_search behaviour, untouched."""
    exa = MockExaTool(hits=[{"name": "Injected Test Co", "url": "https://test.example", "role": "supplier"}])
    handoff = {"payload": {"direction": "find_supplier", "commodity": "Copper"}}
    out = run_counterparty_sourcing(handoff, exa=exa)
    assert exa.calls == ["Copper find_supplier UNKNOWN"]
    assert out["candidates"][0]["name"] == "Injected Test Co"


def test_a_failed_search_chain_reports_the_warning_never_fake_candidates():
    handoff = {"payload": {"direction": "find_supplier", "commodity": "Copper",
                           "web_hits": [], "web_hits_warning": "Search chain exhausted (not_configured): no provider available."}}
    out = run_counterparty_sourcing(handoff)
    assert out["candidates"] == [] and out["rejected"] == []
    assert "Search chain exhausted" in out["analysis"]
