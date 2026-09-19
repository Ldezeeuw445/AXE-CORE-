"""NorthSea Discovery -- LOOP A (find revenue) and part of LOOP B (alternative routing).

## What this is, and what it deliberately is not

A deterministic, free, bounded cross-match of every active `buyer_requirement` against
every active `supplier_offer`, using the EXACT SAME scoring as the public website intake
(`commodity-intake` edge function) and `NorthSeaService.assess_match()`: `matching.match_score`
and `matching.MATCH_THRESHOLD` (60). A pair that would create an opportunity through the
website intake creates the same opportunity here -- this is not a new rule, it is the
existing rule finally reaching pairs nobody manually re-checked.

This also covers LOOP B's "find an alternative route": the same requirement or offer that
already has a BLOCKED opportunity is checked against every OTHER counterparty too, so a
better pairing surfaces automatically, without waiting for a human to think to look.

## What this NEVER does

Never invents a company, requirement or offer -- it only pairs rows that already exist and
already passed whatever scrutiny got them into the database. A brand-new counterparty found
by a web search is a different, costlier, and far less certain thing: CrewAI/search output is
analysis, never fact (see `crew.py`), so a web-sourced candidate is surfaced as a Chase item
for a human to review, never auto-persisted as a company/requirement/offer. Never sends,
approves, discloses an identity, or accepts a commercial term -- creating an internal
`opportunities` row is exactly as binding as a lead a human typed into the Deal Desk, which is
to say: not binding at all.

## Bounded, always

`max_new_per_run` and `max_new_per_day` are hard ceilings, checked before every write. A
sweep that considers thousands of pairs still creates at most a handful of opportunities.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from . import matching
from .repository import RepositoryError

log = logging.getLogger("northsea_mcp.discovery")

ACTOR = "northsea-discovery"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DiscoveryService:
    def __init__(self, repo: Any, *, now=_now, max_new_per_run: int = 5, max_new_per_day: int = 25,
                sleep=None, max_write_attempts: int = 3):
        self.repo = repo
        self.now = now
        self.max_new_per_run = max_new_per_run
        self.max_new_per_day = max_new_per_day
        self._sleep = sleep or asyncio.sleep
        self.max_write_attempts = max_write_attempts

    async def _resilient(self, fn):
        """Same bounded retry-on-transient-error policy as EngineService -- a P0 guard or a 4xx is a
        database decision, not an outage, and goes straight to the caller."""
        from . import engine_rules as rules
        laatste: RepositoryError | None = None
        for poging in range(1, self.max_write_attempts + 1):
            try:
                return await fn()
            except RepositoryError as e:
                laatste = e
                if poging >= self.max_write_attempts or not rules.is_transient_repository_error(str(e)):
                    raise
                await self._sleep(0.25 * (2 ** (poging - 1)))
        raise laatste  # type: ignore[misc]

    async def sweep(self, *, dry_run: bool = False) -> dict[str, Any]:
        nu = self.now()
        vandaag = nu.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        reqs, offers, al_vandaag = await asyncio.gather(
            self.repo.list_active_requirements(), self.repo.list_active_offers(),
            self.repo.count_events_since(event_type="opportunity_discovered", actor=ACTOR, since=vandaag))
        overwogen = 0
        gemaakt: list[dict] = []
        fouten: list[str] = []

        def budget_over() -> bool:
            return len(gemaakt) >= self.max_new_per_run or al_vandaag + len(gemaakt) >= self.max_new_per_day

        for req in reqs:
            if budget_over():
                break
            for off in offers:
                if budget_over():
                    break
                if req.get("company_id") and off.get("company_id") and req["company_id"] == off["company_id"]:
                    continue  # dezelfde partij aan beide kanten: geen tegenpartij
                overwogen += 1
                score = matching.match_score(req, off)
                if score < matching.MATCH_THRESHOLD:
                    continue
                try:
                    bestaand = await self.repo.find_opportunity_for_pair(req["id"], off["id"])
                    if bestaand:
                        continue  # al gepaard, welke stage dan ook -- nooit dupliceren
                    if dry_run:
                        gemaakt.append({"buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "match_score": score})
                        continue
                    uitleg = matching.explain_match(req, off)
                    opp = await self._resilient(lambda req=req, off=off, score=score: self.repo.insert_opportunity({
                        "buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "match_score": score,
                        "stage": "identified", "execution_state": "discovered", "qualification_status": "unqualified",
                        **{f"{g}_gate_passed": False for g in matching.GATES},
                        "approval_required": False, "action_owner": "axe", "commission_agreement_status": "not_started"}))
                    await self._resilient(lambda req=req, off=off, score=score, uitleg=uitleg: self.repo.insert_match_assessment({
                        "buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "overall_score": score,
                        "matching_fields": uitleg["matching_fields"], "conflicts": uitleg["conflicts"],
                        "missing_information": uitleg["unknowns"],
                        "method": "northsea-discovery: deterministic cross-match (commodity-intake matchScore, same rule as the "
                                  "website intake and assess_match)"}))
                    await self._resilient(lambda opp=opp, req=req, off=off, score=score: self.repo.engine_insert("deal_events", {
                        "opportunity_id": opp["id"], "event_type": "opportunity_discovered", "actor": ACTOR,
                        "summary": f"Deterministic cross-match (score {score}) paired an existing requirement and offer that had "
                                  "no opportunity yet."[:900],
                        "metadata": {"buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "match_score": score}}))
                    gemaakt.append(opp)
                except RepositoryError as e:
                    fouten.append(f"pair {req['id']}/{off['id']}: {e}")

        if not dry_run:
            try:
                await self.repo.engine_insert("northsea_audit_events", {
                    "actor_type": "automation", "actor": ACTOR, "action": "discovery_sweep",
                    "details": {"considered_pairs": overwogen, "created": len(gemaakt), "errors": fouten[:20],
                               "created_today_before_this_run": al_vandaag}})
            except RepositoryError as e:
                log.warning("discovery audit failed: %s", e)
        return {"at": nu.isoformat(), "dry_run": dry_run, "considered_pairs": overwogen, "created": len(gemaakt),
                "created_ids": [o.get("id") for o in gemaakt], "created_today_total": al_vandaag + len(gemaakt),
                "max_new_per_day": self.max_new_per_day, "errors": fouten}
