"""Crew-tools. Canonical state komt van NorthSeaService, niet van file_read.

Live Exa wordt nooit vanuit tests aangeroepen. Zonder EXA_API_KEY blijft
`exa_search` leeg + warning — production mag niet crashen.
"""
from __future__ import annotations

import os
from typing import Any


class CanonicalStateTool:
    """Leest de handoff die NorthSeaService aan de MCP-grens heeft gezet."""

    name = "canonical_state"

    def __init__(self, handoff: dict[str, Any]):
        self.handoff = handoff

    def read(self) -> dict[str, Any]:
        state = self.handoff.get("canonical_state")
        if isinstance(state, dict) and state.get("source") == "northsea_service":
            return state
        # Handoff zonder service-snapshot: payload mag, files niet.
        if self.handoff.get("deal_state_file") or self.handoff.get("canonical_state_file"):
            raise RuntimeError("canonical deal/ops state must come from NorthSeaService, not a file")
        return {
            "source": "handoff_payload_only",
            "channel": "mcp_boundary",
            "file_read": False,
            "inputs": self.handoff.get("payload") or {},
            "deal": None,
            "operations": None,
        }


class MockExaTool:
    """Web-research tool. Tests injecteren hits. Live Exa alleen met EXA_API_KEY én live=True."""

    name = "exa_search"

    def __init__(self, hits: list[dict[str, Any]] | None = None, *, live: bool = False):
        self.hits = hits
        self.live = live
        self.calls: list[str] = []

    def search(self, query: str) -> dict[str, Any]:
        self.calls.append(query)
        if self.hits is not None:
            return {"hits": list(self.hits), "provider": "mock_exa", "warning": None}
        if not self.live or not (os.environ.get("EXA_API_KEY") or "").strip():
            return {
                "hits": [],
                "provider": None,
                "warning": "EXA_API_KEY not configured; live Exa search skipped",
            }
        raise RuntimeError("live Exa is not enabled in this runtime")


class MockScrapeTool:
    name = "scrape_website"

    def __init__(self, pages: dict[str, str] | None = None):
        self.pages = pages or {}

    def read(self, url: str) -> dict[str, Any]:
        if url in self.pages:
            return {"url": url, "text": self.pages[url], "status": "ok"}
        return {"url": url, "text": "", "status": "unavailable"}


class MockMarketTool:
    name = "mock_market"

    def __init__(self, context: list[dict[str, Any]] | None = None):
        self.context = context or []

    def gather(self, topics: list[str] | str | None) -> list[dict[str, Any]]:
        if self.context:
            return list(self.context)
        topics = topics if isinstance(topics, list) else ([topics] if topics else [])
        return [
            {
                "topic": t,
                "summary": f"Market context for {t} is unavailable in this local run (no live scrape).",
                "classification": "context_only",
                "proof_of_delivery": False,
                "sources": [],
            }
            for t in topics
        ]
