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

    async def sweep(self, *, dry_run: bool = False, max_new_override: int | None = None) -> dict[str, Any]:
        """Two phases, deliberately never interleaved:

        1. SELECT (read-only): score every pair, dedupe against every existing opportunity in ONE
           bulk read (not one lookup per candidate), rank by score, and cut the list down to at most
           the remaining run/day budget -- BEFORE a single write happens. A cancellation, a bug or a
           string of failures during selection can never create anything, because nothing has been
           written yet: the cap is enforced on the candidate LIST, not on a counter that only moves
           after a write succeeds.
        2. PERSIST: for each selected candidate, write opportunity + match_assessment + deal_event.
           PostgREST has no cross-table transaction, so a failed child write triggers an explicit
           compensating DELETE of the opportunity just created -- no opportunity ever survives
           without its assessment and event."""
        nu = self.now()
        vandaag = nu.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        reqs, offers, bestaande_paren, al_vandaag = await asyncio.gather(
            self.repo.list_active_requirements(), self.repo.list_active_offers(),
            self.repo.list_opportunity_pairs(), self.repo.count_events_since(event_type="opportunity_discovered", actor=ACTOR, since=vandaag))
        bekende_paren = {(p.get("buyer_requirement_id"), p.get("supplier_offer_id")) for p in bestaande_paren}

        overwogen = 0
        kandidaten: list[dict] = []
        for req in reqs:
            for off in offers:
                if req.get("company_id") and off.get("company_id") and req["company_id"] == off["company_id"]:
                    continue  # dezelfde partij aan beide kanten: geen tegenpartij
                if (req["id"], off["id"]) in bekende_paren:
                    continue  # al gepaard, welke stage dan ook -- nooit dupliceren
                overwogen += 1
                score = matching.match_score(req, off)
                if score < matching.MATCH_THRESHOLD:
                    continue
                kandidaten.append({"req": req, "off": off, "score": score})
        kandidaten.sort(key=lambda k: -k["score"])

        # max_new_override kan de cap voor DEZE run alleen VERLAGEN (gecontroleerde productieproef,
        # bv. max_new_override=1), nooit verhogen boven wat er geconfigureerd staat.
        per_run = self.max_new_per_run if max_new_override is None else max(0, min(max_new_override, self.max_new_per_run))
        ruimte = max(0, min(per_run, self.max_new_per_day - al_vandaag))
        geselecteerd = kandidaten[:ruimte]

        if dry_run:
            return {"at": nu.isoformat(), "dry_run": True, "considered_pairs": overwogen,
                    "candidates_found": len(kandidaten), "would_create": len(geselecteerd),
                    "would_create_pairs": [{"buyer_requirement_id": k["req"]["id"], "supplier_offer_id": k["off"]["id"],
                                           "match_score": k["score"]} for k in geselecteerd],
                    "created_today_total": al_vandaag, "max_new_per_day": self.max_new_per_day, "errors": []}

        gemaakt: list[dict] = []
        fouten: list[str] = []
        for k in geselecteerd:
            req, off, score = k["req"], k["off"], k["score"]
            opp: dict | None = None
            try:
                uitleg = matching.explain_match(req, off)
                opp = await self._resilient(lambda req=req, off=off, score=score: self.repo.insert_opportunity({
                    "buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "match_score": score,
                    "stage": "identified", "execution_state": "discovered", "qualification_status": "unqualified",
                    **{f"{g}_gate_passed": False for g in matching.GATES},
                    "approval_required": False, "action_owner": "axe", "commission_agreement_status": "not_started"}))
                await self._resilient(lambda opp=opp, req=req, off=off, score=score, uitleg=uitleg: self.repo.insert_match_assessment({
                    "buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "opportunity_id": opp["id"],
                    "overall_score": score, "missing_information": uitleg["unknowns"],
                    "blockers": [f"{c['field']}: buyer states {c['buyer']!r}, supplier states {c['supplier']!r}"
                                for c in uitleg["conflicts"]],
                    "executable": False}))
                await self._resilient(lambda opp=opp, req=req, off=off, score=score: self.repo.engine_insert("deal_events", {
                    "opportunity_id": opp["id"], "event_type": "opportunity_discovered", "actor": ACTOR,
                    "summary": f"Deterministic cross-match (score {score}) paired an existing requirement and offer that had "
                              "no opportunity yet."[:900],
                    "metadata": {"buyer_requirement_id": req["id"], "supplier_offer_id": off["id"], "match_score": score}}))
                gemaakt.append(opp)
            except RepositoryError as e:
                fouten.append(f"pair {req['id']}/{off['id']}: {e}")
                if opp is not None:
                    try:
                        await self.repo.delete_opportunity(opp["id"])
                    except RepositoryError as e2:
                        fouten.append(f"rollback failed for {opp['id']}: {e2}")

        if gemaakt or fouten:
            try:
                await self.repo.engine_insert("northsea_audit_events", {
                    "actor_type": "automation", "actor": ACTOR, "action": "discovery_sweep",
                    "details": {"considered_pairs": overwogen, "candidates_found": len(kandidaten), "selected": len(geselecteerd),
                               "created": len(gemaakt), "errors": fouten[:20], "created_today_before_this_run": al_vandaag}})
            except RepositoryError as e:
                log.warning("discovery audit failed: %s", e)
        return {"at": nu.isoformat(), "dry_run": False, "considered_pairs": overwogen, "candidates_found": len(kandidaten),
                "selected": len(geselecteerd), "created": len(gemaakt), "created_ids": [o.get("id") for o in gemaakt],
                "created_today_total": al_vandaag + len(gemaakt), "max_new_per_day": self.max_new_per_day, "errors": fouten}
