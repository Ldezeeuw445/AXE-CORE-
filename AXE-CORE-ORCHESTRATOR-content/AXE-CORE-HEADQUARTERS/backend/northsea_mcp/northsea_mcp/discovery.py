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

`crew_assisted_review()` covers the net-new tier: it feeds the EXISTING Tavily -> Zenserp ->
Perplexity search chain (research.py's `ResearchGateway.search`, the same one
find_suppliers/find_buyers already use) into the discovery crew's existing evidence/dedupe/fit
pipeline, instead of that crew's own `exa_search` tool, which has never had a working live
implementation (EXA_API_KEY was never enough on its own -- the "live" path raises). One search
chain, reused everywhere; never a second, EXA-only discovery mechanism. The Perplexity tier of
that chain goes through the same shared, capped `/research/perplexity` endpoint as the governed
research gate, so the existing daily $-cap and call-cap apply automatically here too.

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

from . import canon, matching
from .repository import RepositoryError
from .research import ResearchError

log = logging.getLogger("northsea_mcp.discovery")

ACTOR = "northsea-discovery"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class DiscoveryService:
    def __init__(self, repo: Any, *, now=_now, max_new_per_run: int = 5, max_new_per_day: int = 25,
                crew: Any = None, research: Any = None, max_crew_calls_per_day: int = 3,
                sleep=None, max_write_attempts: int = 3):
        self.repo = repo
        self.now = now
        self.max_new_per_run = max_new_per_run
        self.max_new_per_day = max_new_per_day
        self.crew = crew  # optioneel: CrewGateway, alleen voor crew_assisted_review() (net-new, governed)
        self.research = research  # optioneel: ResearchGateway -- ZELFDE Tavily/Zenserp/Perplexity-keten als
                                  # find_suppliers/find_buyers, nooit een tweede zoeksysteem voor de crew alleen
        self.max_crew_calls_per_day = max_crew_calls_per_day
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
        ruwe_reqs, ruwe_offers, bestaande_paren, al_vandaag = await asyncio.gather(
            self.repo.list_active_requirements(), self.repo.list_active_offers(),
            self.repo.list_opportunity_pairs(), self.repo.count_events_since(event_type="opportunity_discovered", actor=ACTOR, since=vandaag))
        bekende_paren = {(p.get("buyer_requirement_id"), p.get("supplier_offer_id")) for p in bestaande_paren}
        # Interne testcases (STRATO/Jasmine, is_synthetic, "Test "-bedrijven) zijn geen echte vraag/aanbod --
        # dezelfde herkenning als overal elders in deze server (canon.testcase_reason), nooit een eigen regel.
        reqs = [r for r in ruwe_reqs if not canon.testcase_reason(r, r.get("companies"))]
        offers = [o for o in ruwe_offers if not canon.testcase_reason(o, o.get("companies"))]

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

    async def crew_assisted_review(self, *, dry_run: bool = False) -> dict[str, Any]:
        """Governed crew invocation for genuinely NEW candidates -- the higher-risk tier the
        deterministic cross-match above deliberately does not attempt (it only pairs rows that
        already exist). Bounded to `max_crew_calls_per_day` real crew calls, system-wide, because
        crew analysis is not free and not deterministic like the cross-match is.

        The crew's output is NEVER auto-persisted as a company/requirement/offer/opportunity --
        CrewAI output is analysis, never fact (see crew.py's own hard rule). It is surfaced as a
        `crew_candidate_review` Chase item (requires_approval=true) with full provenance (route,
        backend, execution_mode, actual specialists, fallback, audit_references), for a human to
        act on. Deduped per requirement via dedupe_key, so the same requirement is never
        crew-reviewed twice."""
        if self.crew is None:
            return {"skipped": True, "reason": "no crew gateway configured for this process"}
        nu = self.now()
        vandaag = nu.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        al_vandaag = await self.repo.count_action_queue_since(action_type="crew_candidate_review", since=vandaag)
        if al_vandaag >= self.max_crew_calls_per_day:
            return {"skipped": True, "reason": "daily crew-review budget already used", "used_today": al_vandaag,
                    "max_crew_calls_per_day": self.max_crew_calls_per_day}

        ruwe_reqs = await self.repo.list_active_requirements()
        reqs = [r for r in ruwe_reqs if not canon.testcase_reason(r, r.get("companies"))]
        reqs.sort(key=lambda r: str(r.get("created_at") or ""))  # de langst genegeerde vraag eerst
        kandidaat = None
        for r in reqs:
            bestaand = await self.repo.get_action_queue_by_dedupe_key(f"crew_candidate_review:{r['id']}")
            if not bestaand:
                kandidaat = r
                break
        if kandidaat is None:
            return {"skipped": True, "reason": "no eligible requirement (all already crew-reviewed or none active)"}

        if dry_run:
            return {"dry_run": True, "would_review": {"buyer_requirement_id": kandidaat["id"],
                                                       "product": kandidaat.get("product") or kandidaat.get("commodity")}}

        commodity = kandidaat.get("commodity") or kandidaat.get("product") or ""
        geografie = kandidaat.get("origin_preference") or ""
        payload: dict[str, Any] = {"direction": "find_supplier", "commodity": commodity, "product": kandidaat.get("product"),
                                   "geography": geografie, "requirement_id": kandidaat["id"]}
        zoek_status = "no_research_service"
        if self.research is not None:
            try:
                resultaat = await self.research.search(f"{commodity} exporter producer supplier {geografie}".strip(),
                                                        max_results=6, priority="P2")
                payload["web_hits"] = [{"title": h.title, "url": h.url} for h in resultaat.hits]
                payload["web_hits_provider"] = resultaat.provider
                zoek_status = f"ok:{resultaat.provider}"
            except ResearchError as e:
                # Zelfde eerlijke aanpak als de onderzoeksgate: een lege lijst is een eerlijk antwoord,
                # nooit verzonnen kandidaten. web_hits blijft weg zodat de crew dit onderscheidt van "0
                # kandidaten gevonden" (wat wel echt geprobeerd is).
                payload["web_hits_warning"] = f"Search chain exhausted ({e.status}): {e.message}"
                zoek_status = f"failed:{e.status}"
        handoff = {"entity_ids": {"buyer_requirement_id": kandidaat["id"]}, "payload": payload}
        info = await self.crew.run("find_suppliers", handoff)
        dedupe_key = f"crew_candidate_review:{kandidaat['id']}"
        if not info.used or info.status != "ok":
            await self._resilient(lambda info=info: self.repo.engine_insert("northsea_audit_events", {
                "actor_type": "automation", "actor": ACTOR, "action": "crew_candidate_review_skipped",
                "details": {"buyer_requirement_id": kandidaat["id"], "crew_status": info.status, "reason": info.reason,
                           "search_status": zoek_status}}))
            return {"created_review": False, "buyer_requirement_id": kandidaat["id"], "crew_status": info.status,
                    "reason": info.reason, "search_status": zoek_status}

        rij = await self._resilient(lambda info=info: self.repo.engine_insert("action_queue", {
            "dedupe_key": dedupe_key, "action_type": "crew_candidate_review", "opportunity_id": None, "company_id": None,
            "priority": 55, "title": f"Crew-assisted candidate review: {kandidaat.get('product') or kandidaat.get('commodity')}"[:200],
            "description": (info.analysis or "No analysis text returned.")[:2000],
            "status": "open", "requires_approval": True,
            "metadata": {"source": ACTOR, "kind": "crew_candidate_review", "buyer_requirement_id": kandidaat["id"],
                        "crew_route": info.route, "crew_backend": info.backend, "execution_mode": info.execution_mode,
                        "requested_specialists": info.requested_specialists, "actual_specialists": info.actual_specialists,
                        "fallback_used": info.fallback_used, "fallback_reason": info.fallback_reason,
                        "validation": info.validation, "audit_references": info.audit_references,
                        "timings": info.timings, "budget_usage": info.budget_usage,
                        "search_status": zoek_status, "search_provider": payload.get("web_hits_provider"),
                        "search_hits": len(payload.get("web_hits") or [])}}, ignore_duplicates=True))
        await self._resilient(lambda info=info: self.repo.engine_insert("northsea_audit_events", {
            "actor_type": "automation", "actor": ACTOR, "action": "crew_candidate_review_requested",
            "details": {"buyer_requirement_id": kandidaat["id"], "crew_route": info.route, "crew_backend": info.backend,
                       "execution_mode": info.execution_mode, "search_status": zoek_status}}))
        return {"created_review": bool(rij), "buyer_requirement_id": kandidaat["id"], "crew_route": info.route,
                "crew_backend": info.backend, "execution_mode": info.execution_mode, "search_status": zoek_status,
                "used_today": al_vandaag + 1, "max_crew_calls_per_day": self.max_crew_calls_per_day}
