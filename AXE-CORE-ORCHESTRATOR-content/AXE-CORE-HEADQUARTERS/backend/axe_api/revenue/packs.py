"""Query packs — curated harvest terms per domain.

A pack is a starting set of *search phrases*, nothing more. It does not add
demand, invent signals, or presuppose a market; it only decides where the
harvesters look first. The evidence that comes back still has to survive
fusion.py's noise filter and scoring like anything else.

The phrases are written the way a frustrated buyer types, not the way a
category is named. "trading journal spreadsheet by hand" finds people with the
problem; "trading analytics software" finds vendors selling to them.

Add a pack when you have a domain you can actually deliver in. That is the only
criterion that matters — a pack pointed at a market you cannot serve just
produces well-ranked clusters you have to ignore.
"""

from __future__ import annotations

PACKS: dict[str, dict[str, object]] = {
    "trading_tools": {
        "description": (
            "Tooling and process pain for people who already trade. Deliberately "
            "excludes signals, calls, and anything advisory: those are licensed "
            "activity in the EU (MiFID II) and US (RIA), and the copy they need "
            "is what BANNED_CLAIMS refuses to write."
        ),
        "queries": [
            "prop firm challenge daily drawdown rule breach",
            "trading journal spreadsheet by hand every night",
            "backtest results don't match live results",
            "tradingview alert webhook not firing broker",
            "position sizing calculator spreadsheet risk percent",
            "reconcile broker csv export trades spreadsheet",
            "hire someone to code my trading strategy",
            "looking for someone to backtest my strategy",
            "pine script help needed not working",
            "mt5 expert advisor keeps breaking",
        ],
        # Where these questions are actually asked. Reddit entries are used to
        # scope Reddit's search; the rest are for the operator to open directly.
        "communities": [
            "r/Forex", "r/Daytrading", "r/algotrading", "r/prop_firm_trading",
            "r/FuturesTrading", "r/quant",
            "forexfactory.com/forums", "elitetrader.com",
        ],
    },
    "trading_data": {
        "description": (
            "Market-data plumbing: the unglamorous work of getting clean prices "
            "into something usable. Pure engineering, no market opinion involved."
        ),
        "queries": [
            "historical ohlcv data cleaning gaps splits",
            "api rate limit market data script keeps failing",
            "survivorship bias free dataset where to get",
            "timezone mismatch candles data feed",
            "corporate actions adjust prices manually",
        ],
        "communities": ["r/algotrading", "r/quant", "r/datasets", "stackoverflow.com"],
    },
    "back_office": {
        "description": "Bookkeeping and document drudgery — the seed corpus's home ground.",
        "queries": [
            "invoice pdf to spreadsheet by hand every month",
            "receipts bookkeeping manual data entry hours",
            "reconcile bank statement spreadsheet errors",
            "looking for someone to set up automation",
        ],
        "communities": ["r/Bookkeeping", "r/smallbusiness", "r/Accounting", "r/excel"],
    },
    "ecommerce": {
        "description": "Store operators with volume problems and a launch deadline.",
        "queries": [
            "bulk product descriptions from spreadsheet",
            "product listings by hand hundreds deadline",
            "inventory sync between store and spreadsheet breaking",
        ],
        "communities": ["r/shopify", "r/ecommerce", "r/EtsySellers"],
    },
    "ai_engineering": {
        "description": "Teams shipping LLM features that do not work yet.",
        "queries": [
            "rag chatbot returns wrong chunks how to audit",
            "llm evaluation how do you measure retrieval quality",
            "looking for someone to audit our rag setup",
        ],
        "communities": ["r/LocalLLaMA", "r/MachineLearning", "r/LangChain"],
    },
    "deliverability": {
        "description": "Cold email and domain reputation — technical, auditable, unglamorous.",
        "queries": [
            "cold email spf dkim dmarc going to spam",
            "domain warmup finished still landing in spam",
            "need deliverability audit before campaign",
        ],
        "communities": ["r/Emailmarketing", "r/sales", "r/msp"],
    },
}


def pack_queries(name: str) -> list[str]:
    if name not in PACKS:
        raise KeyError(f"unknown pack '{name}'. Known: {', '.join(sorted(PACKS))}")
    return list(PACKS[name]["queries"])  # type: ignore[arg-type]


def pack_communities(name: str) -> list[str]:
    if name not in PACKS:
        raise KeyError(f"unknown pack '{name}'. Known: {', '.join(sorted(PACKS))}")
    return list(PACKS[name].get("communities", []))  # type: ignore[arg-type]


def describe_packs() -> list[dict[str, object]]:
    return [
        {"pack": name, "description": p["description"], "queries": p["queries"]}
        for name, p in sorted(PACKS.items())
    ]
