"""Kwaliteitshek: nieuws/koers/blog/statistiek is geen leverancier.

De overnight-run van 4-5 okt 2026 zette Yahoo Finance, TradeImeX, Investing News
Network en MOGLF-koerspagina's in crew_candidate_review. Deze tests pinnen de
exacte junk die toen binnenkwam, plus het pad dat wél mag (bedrijf + contact).
"""
from __future__ import annotations

from northsea_mcp.sourcing_quality import (
    junk_reason,
    looks_like_company_name,
    qualify_candidate,
    split_quality,
    supplier_search_query,
)


PRODUCTIE_JUNK = [
    {"title": "Chile - Mining", "url": "https://www.trade.gov/country-commercial-guides/chile-mining",
     "content": "Country commercial guide copper producers"},
    {"title": "Participating Sites - The Copper Mark", "url": "https://coppermark.org/participants-home/participants",
     "content": "Copper smelting and refining participants directory"},
    {"title": "Kennecott Copper Mine", "url": "https://magna.utah.gov/250/Kennecott-Copper-Mine",
     "content": "Municipal visitors information about a copper mine"},
    {"title": "MOGLF Stock Price", "url": "https://finance.yahoo.com/quote/MOGLF/",
     "content": "Mongolia Growth Group Ltd quote"},
    {"title": "Copper Cathode Exporters 2024 | TradeImeX",
     "url": "https://www.tradeimex.in/blogs/copper-cathode-exporters",
     "content": "import export data and trade statistics"},
    {"title": "Copper mining news", "url": "https://investingnews.com/daily/resource-investing/copper/",
     "content": "Investing News Network roundup"},
    {"title": "Copper prices today", "url": "https://www.investing.com/commodities/copper",
     "content": "live copper quote"},
    {"title": "Copper cathode trade leads", "url": "https://www.tradekey.com/copper",
     "content": "B2B marketplace broker copper cathode"},
]


def test_productie_junk_van_5_okt_valt_af():
    for hit in PRODUCTIE_JUNK:
        reden = junk_reason(hit["url"], hit["title"], hit["content"])
        assert reden, hit
        kept, rejected = qualify_candidate(hit)
        assert kept is None and rejected is not None
        assert rejected["fit_score"] == 0 and rejected["reject_reason"]


def test_echt_bedrijf_met_site_blijft_staan():
    kept, rejected = qualify_candidate({
        "name": "Mopani Copper Mines", "url": "https://www.mopani.com/products",
        "content": "Copper cathode producer in Zambia. Sales: chanda@mopani.com",
        "email": "chanda@mopani.com",
    })
    assert rejected is None and kept is not None
    assert kept["email"] == "chanda@mopani.com"
    assert looks_like_company_name("Mopani Copper Mines")
    assert looks_like_company_name("Aurubis AG")


def test_split_quality_houdt_bedrijven_en_wijst_nieuws_af():
    gehouden, afgewezen = split_quality([
        {"title": "Mopani Copper Mines", "url": "https://www.mopani.com", "content": "producer"},
        *PRODUCTIE_JUNK,
    ])
    namen = [c["name"] for c in gehouden]
    assert namen == ["Mopani Copper Mines"]
    assert len(afgewezen) == len(PRODUCTIE_JUNK)


def test_zoekvraag_stuurt_naar_bedrijfssites():
    q = supplier_search_query("Copper Cathode", "Germany")
    assert "Copper Cathode" in q and "Germany" in q
    assert "official website" in q and "producer" in q
    assert "yahoo" not in q.lower()
