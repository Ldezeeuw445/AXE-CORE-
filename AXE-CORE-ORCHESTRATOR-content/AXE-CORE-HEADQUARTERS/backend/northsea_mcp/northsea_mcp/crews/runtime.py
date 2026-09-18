"""Lokale crew-runtime: sequential specialists, mockbare tools, optionele CrewAI.

Studio is optioneel. Deze backend blijft werken zonder AMP-URL, zonder EXA-key
en zonder crewai-package. `CrewGateway` gebruikt `LocalCrewBackend` als primaire
productie-uitvoerder.
"""
from __future__ import annotations

import json
import time
from typing import Any

from .catalog import CREW_SPECS, SPECIALIST_FOR_ROUTE, CrewSpec
from .specialists import SPECIALIST_RUNNERS, run_counterparty_sourcing, run_deal_execution, run_intelligence_operations
from .tools import MockExaTool, MockMarketTool, MockScrapeTool


class GoldenRuntime:
    """Draait de volledige 8/8/7-agent pipeline deterministisch (geen live LLM/Exa)."""

    def __init__(self, *, exa: MockExaTool | None = None, scrape: MockScrapeTool | None = None,
                 market: MockMarketTool | None = None):
        self.exa = exa
        self.scrape = scrape
        self.market = market

    def spec_for(self, route: str) -> CrewSpec:
        cid = SPECIALIST_FOR_ROUTE[route]
        return CREW_SPECS[cid]

    def execute(self, route: str, action: str, handoff: dict[str, Any]) -> dict[str, Any]:
        if route not in SPECIALIST_FOR_ROUTE:
            raise ValueError(f"unroutable route: {route}")
        payload = dict(handoff)
        payload.setdefault("action", action)
        cid = SPECIALIST_FOR_ROUTE[route]
        spec = CREW_SPECS[cid]
        if cid == "deal_execution":
            out = run_deal_execution(payload)
        elif cid == "intelligence_operations":
            out = run_intelligence_operations(payload, market=self.market)
        else:
            out = run_counterparty_sourcing(payload, exa=self.exa, scrape=self.scrape)
        out["requested_route"] = route
        out["specialist_crew"] = spec.name
        out["agents"] = spec.agent_roles
        out["agent_count"] = len(spec.agents)
        out["task_count"] = len(spec.tasks)
        out["process"] = spec.process
        # veiligheid: nooit VERIFIED zonder bron in het typed result
        for claim in out.get("claims") or []:
            if str(claim.get("state") or "").lower() == "verified" and not (claim.get("sources") or claim.get("basis")):
                claim["state"] = "unverified"
        out.setdefault("models", ["northsea-golden-runtime"])
        out.setdefault("budget_usage", {"research_calls": 0, "premium_calls": 0})
        out.setdefault("confidence", 0.7)
        return out


class LocalCrewBackend:
    """Primaire NorthSea-workforce: lokale specialist-crews. Studio-AMP is optioneel."""

    def __init__(self, runtime: GoldenRuntime | None = None, *, enabled: bool = True):
        self.runtime = runtime or GoldenRuntime()
        self.enabled = enabled

    def configured(self, route: str) -> bool:
        return self.enabled and route in SPECIALIST_FOR_ROUTE

    async def run(self, route: str, action: str, handoff: dict[str, Any], deadline: float):
        from ..crew import _Run, parse_dedicated_output

        if not self.configured(route):
            return _Run("unavailable", detail="local specialist crew disabled")
        rest = deadline - time.monotonic()
        if rest <= 0:
            return _Run("timeout", detail="local crew deadline already passed")
        t0 = time.monotonic()
        raw = self.runtime.execute(route, action, handoff)
        analysis = str(raw.get("analysis") or "").strip()
        if not analysis:
            return _Run("invalid", detail="local crew returned empty analysis")
        contract = {
            "analysis": analysis,
            "claims": raw.get("claims") or [],
            "blockers": raw.get("blockers") or [],
            "recommendations": raw.get("recommendations") or [],
            "models": raw.get("models") or ["northsea-golden-runtime"],
            "skills": raw.get("skills") or [],
            "tools": raw.get("tools") or ["canonical_state"],
            "budget_usage": raw.get("budget_usage") or {},
            "confidence": raw.get("confidence"),
            "typed_result": {k: v for k, v in raw.items() if k not in {
                "analysis", "claims", "blockers", "recommendations", "models", "skills",
                "tools", "budget_usage", "confidence",
            }},
        }
        uitvoer, fout = parse_dedicated_output(json.dumps(contract))
        if not uitvoer:
            return _Run("invalid", detail=fout)
        return _Run(
            "ok",
            run_id=f"local-{route}-{int(time.time() * 1000)}",
            analysis=uitvoer.analysis[:6000],
            output=uitvoer,
            specialists=list(raw.get("agents") or []),
            execution_s=round(time.monotonic() - t0, 4),
        )


def try_crewai_kickoff(route: str, action: str, handoff: dict[str, Any]) -> dict[str, Any]:
    """Optionele CrewAI-kickoff. Golden tests raken dit niet."""
    from .crewai_adapter import kickoff_if_available
    return kickoff_if_available(route, action, handoff)
