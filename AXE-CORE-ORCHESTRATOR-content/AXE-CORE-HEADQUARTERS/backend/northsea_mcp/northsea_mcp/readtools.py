"""De leestools zelf, bovenop readlayer.View.

Elke functie geeft een gewoon dict terug met `generated_at`, `source` (tabellen)
en waar het ertoe doet een `definition`. De server verpakt dat in Page/Detail/
Report. Geen schrijfacties.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import timedelta
from typing import Any

from . import __version__, canon
from .readlayer import (
    GATES, MARKET_INSTRUMENTS, OPEN_TASK, READINESS_FRAMEWORK, UUID, InspectService, View, _lower, _since, iso, page, resolve_one,
    thread_key, ts,
)
from .service import Caller, NotFound, ServiceError


def _ids(rows: list[dict], key: str = "id", cap: int = 200) -> list[Any]:
    return [r.get(key) for r in rows][:cap]


def _metric(metric: str, value: Any, definition: str, source: list[str], ids: list[Any] | None = None,
            filters: dict | None = None) -> dict:
    uit = {"metric": metric, "value": value, "definition": definition, "source": source}
    if filters:
        uit["filters"] = filters
    if ids is not None:
        uit["record_ids"] = ids[:200]
        if len(ids) > 200:
            uit["record_ids_truncated"] = True
    return uit


class ReadTools:
    def __init__(self, inspect: InspectService, *, store: Any = None):
        self.i = inspect
        self.store = store  # optioneel: alleen voor lokale watchdog-zichtbaarheid (stuck idempotency runs)

    async def v(self, caller: Caller) -> View:
        return await self.i.view(caller)

    # ── Lookups ──────────────────────────────────────────────────────────────
    def deal(self, v: View, ref: str) -> dict:
        return resolve_one("deal", ref, v.s.rows("opportunities"),
                           exact=lambda o: [o.get("deal_priority") or ""],
                           fuzzy=lambda o: [o.get("deal_priority") or ""],
                           label=canon.deal_label)

    def company(self, v: View, ref: str) -> dict:
        # Zonder identity-scope geen opzoeken op naam: anders bevestigt een treffer wie de gemaskeerde partij is.
        if not v.caller.identity and not UUID.match((ref or "").strip()):
            raise ServiceError("identity_scope_required",
                               "Looking up a counterparty by name requires northsea.identity; use its UUID from a list tool.")
        naam = lambda c: [c.get("company_name") or ""]  # noqa: E731
        return resolve_one("counterparty", ref, v.s.rows("companies"), exact=naam, fuzzy=naam,
                           label=lambda c: (v.company_ref(c) or {}).get("name", ""))

    def communication(self, v: View, ref: str) -> dict:
        return resolve_one("communication", ref, v.s.rows("communications"),
                           exact=lambda c: [c.get("external_message_id") or ""], label=lambda c: str(c.get("occurred_at")))

    # ── SYSTEM ───────────────────────────────────────────────────────────────
    async def overview(self, caller: Caller) -> dict:
        v = await self.v(caller)
        deals = v.s.rows("opportunities")
        balie = canon.desk_counters([v.map_row(o) for o in deals], v.now)
        chase = v.chase()
        inbound = sorted([c for c in v.s.rows("communications") if c.get("direction") == "inbound"],
                         key=lambda c: -ts(c.get("occurred_at")))[:5]
        approvals = await self.pending_approvals(caller, limit=5)
        return {
            "generated_at": v.generated_at,
            "headline": {**balie, "counterparties": len(v.s.rows("companies")), "contacts": len(v.s.rows("contacts")),
                         "chase_items": len(chase), "chase_critical": sum(1 for c in chase if c["critical"]),
                         "pending_approvals": approvals["total"],
                         "verified_counterparties": sum(1 for c in v.s.rows("companies") if c.get("verification_status") == "verified")},
            "top_chase": chase[:7],
            "recent_inbound": [v.communication_summary(c) for c in inbound],
            "pending_approvals": approvals["items"],
            "definitions": {**canon.DEAL_STATE_DEFINITIONS,
                            "important": "A database opportunity is NOT an executable deal. matched, qualifying, blocked and verified are distinct states."},
            "how_to_go_deeper": ["northsea_list_deals", "northsea_get_deal (accepts DEAL-001)", "northsea_list_pending_actions",
                                 "northsea_list_pending_approvals", "northsea_list_recent_inbound", "northsea_get_dashboard_snapshot"],
            "source": ["opportunities", "companies", "contacts", "communications", "action_queue", "deal_tasks", "reply_drafts"],
        }

    async def system_health(self, caller: Caller) -> dict:
        s = await self.i.snapshot(fresh=True)
        crew = getattr(self.i.crew, "available", None)
        crew_status = self.i.crew.status() if self.i.crew else None
        schema = await self.i.auditor.get_schedule("northsea") if self.i.auditor else None
        beleid = (s.rows("deal_automation_policy") or [{}])[0]
        onderzoek = [q for q in s.rows("action_queue") if q.get("action_type") == "research_approval"]
        return {
            "generated_at": iso(s.loaded_at), "mcp_version": __version__,
            "database": {"reachable": True, "tables_loaded": len(s.t) - len(s.errors), "load_ms": s.load_ms,
                         "table_errors": s.errors, "truncated_tables": sorted(s.truncated)},
            "scheduler": ({"next_run_at": schema.get("next_run_at"), "last_run_at": schema.get("last_run_at"),
                          "last_status": schema.get("last_status"), "enabled": schema.get("enabled"),
                          "consecutive_failures": schema.get("consecutive_failures"),
                          "source": "core_schedules (AXE Companion project, app='northsea'); read-only, this MCP never writes it."}
                         if schema else {"note": "No core_schedules row found for app='northsea', or the AXE project was unreachable."}) \
                         if self.i.auditor else {"note": "No auditor wired into this process; next/last scheduled run is unknown here."},
            "crewai": {"available": bool(crew()) if callable(crew) else None,
                       "note": "Availability of the CrewGateway configuration only; a run is not performed by this check.",
                       "routes": (crew_status or {}).get("routes"), "fallback": (crew_status or {}).get("fallback"),
                       "studio_optional": (crew_status or {}).get("studio_optional")},
            "research": {"configured": self.i.research is not None,
                        "governed_research_gate": {
                            "policy_auto_investigate_blockers": bool(beleid.get("auto_investigate_blockers")),
                            "policy_max_calls_per_day": beleid.get("auto_investigate_blockers_max_calls_per_day"),
                            "pending_approval": sum(1 for q in onderzoek if q.get("status") == "open"),
                            "approved_not_yet_executed": sum(1 for q in onderzoek if q.get("status") == "completed"
                                                             and (q.get("metadata") or {}).get("execution_result") == "not_wired")},
                        "cost_usd_tracked_here": False,
                        "note": "The engine's research gate does not yet execute real research (see approved_not_yet_executed); "
                                "no engine-triggered spend has occurred, so no cost_usd is aggregated here. "
                                "northsea_investigate_blockers can still spend real money when called directly with depth='deep' "
                                "-- that path is unaffected by the gate and its cost is only visible in that tool's own response."},
            "not_covered": ["AXE CORE desktop app runtime", "Resend delivery service health",
                            "edge function health (send-approved-reply, resend-inbound)"],
            "source": ["all snapshot tables", "action_queue", "deal_automation_policy"] + (["core_schedules (AXE project)"] if self.i.auditor else []),
        }

    async def data_freshness(self, caller: Caller) -> dict:
        v = await self.v(caller)
        uit = {}
        for naam, rows in v.s.t.items():
            tijden = [max(ts(r.get("updated_at")), ts(r.get("created_at")), ts(r.get("occurred_at")), ts(r.get("analyzed_at")),
                          ts(r.get("checked_at")), ts(r.get("assessed_at"))) for r in rows]
            laatste = max(tijden) if tijden else 0
            uit[naam] = {"rows": len(rows), "latest_change_at": iso(_dt(laatste)) if laatste else None,
                         "truncated": naam in v.s.truncated, "error": v.s.errors.get(naam)}
        return {"generated_at": v.generated_at, "snapshot_cache_seconds": self.i.cache_s, "tables": uit,
                "definition": "latest_change_at = newest of updated_at/created_at/occurred_at/analyzed_at/checked_at/assessed_at per table.",
                "source": sorted(v.s.t)}

    async def automation_status(self, caller: Caller) -> dict:
        v = await self.v(caller)
        beleid = (v.s.rows("deal_automation_policy") or [{}])[0]
        deals = [o for o in v.s.rows("opportunities") if o.get("stage") != "lost"]
        events = sorted(v.s.rows("deal_events"), key=lambda e: -ts(e.get("created_at")))
        return {
            "generated_at": v.generated_at,
            "policy": {k: beleid.get(k) for k in ("auto_send_qualification", "auto_send_followups", "auto_reply_nonbinding",
                                                   "auto_disclose_counterparty_identity", "auto_accept_pricing", "auto_sign_documents",
                                                   "auto_change_banking", "followup_interval_hours", "max_auto_followups",
                                                   "operational_mailbox", "updated_at")},
            "deal_automation_status": dict(Counter(o.get("automation_status") or "(none)" for o in deals)),
            "last_automation_at": max((o.get("last_automation_at") for o in deals if o.get("last_automation_at")), default=None),
            "recent_events": [{"event_type": e.get("event_type"), "actor": e.get("actor"), "summary": v.red(e.get("summary")),
                               "deal_id": e.get("opportunity_id"), "created_at": e.get("created_at")} for e in events[:20]],
            "event_types_last_7d": dict(Counter(e.get("event_type") for e in events
                                                if ts(e.get("created_at")) > (v.now - timedelta(days=7)).timestamp())),
            "sourcing_campaigns": dict(Counter(c.get("status") or "(none)" for c in v.s.rows("sourcing_campaigns"))),
            "not_visible_here": "Schedulers (Supabase pg_cron, edge function triggers, AXE Cron Manager) are not in this database; "
                                "this tool shows their effects (events, automation_status, policy), not their schedules.",
            "source": ["deal_automation_policy", "opportunities", "deal_events", "sourcing_campaigns"],
        }

    # ── DEALS ────────────────────────────────────────────────────────────────
    async def list_deals(self, caller: Caller, *, stage=None, execution_state=None, qualification_status=None, dashboard_state=None,
                         priority=None, commodity=None, counterparty=None, blocked=None, approval_required=None, active=None,
                         min_readiness=None, max_readiness=None, updated_since=None, include_lost=False, include_testcases=False,
                         sort="updated_desc", limit=25, offset=0) -> dict:
        v = await self.v(caller)
        sinds = _since(updated_since)
        rows = []
        uitgesloten = 0
        for o in v.s.rows("opportunities"):
            if not include_lost and o.get("stage") == "lost":
                continue
            if not include_testcases and v.is_testcase_deal(o):
                uitgesloten += 1
                continue
            sm = v.deal_summary(o)
            if stage and _lower(o.get("stage")) != _lower(stage):
                continue
            if execution_state and _lower(o.get("execution_state")) != _lower(execution_state):
                continue
            if qualification_status and _lower(o.get("qualification_status")) != _lower(qualification_status):
                continue
            if dashboard_state and sm["dashboard_state"] != dashboard_state:
                continue
            if priority and _lower(o.get("deal_priority")) != _lower(priority):
                continue
            if commodity and _lower(commodity) not in _lower(f"{sm['commodity']} {sm['product']}"):
                continue
            if counterparty:
                cid = counterparty.strip()
                namen = [(x or {}).get("company_name") or "" for x in (v.buyer(o), v.seller(o))] if caller.identity else []
                ids = [str((x or {}).get("id")) for x in (v.buyer(o), v.seller(o))]
                if cid not in ids and not any(cid.lower() in n.lower() for n in namen if n):
                    continue
            if blocked is not None and sm["blocked"] != blocked:
                continue
            if approval_required is not None and sm["approval_required"] != approval_required:
                continue
            if active is not None and sm["active"] != active:
                continue
            r = o.get("readiness_score")
            if min_readiness is not None and (r is None or r < min_readiness):
                continue
            if max_readiness is not None and (r is None or r > max_readiness):
                continue
            if sinds and ts(o.get("updated_at")) < sinds:
                continue
            rows.append(sm)
        sleutels = {"updated_desc": (lambda d: -ts(d["updated_at"])), "readiness_desc": (lambda d: -(d["readiness_score"] or -1)),
                    "created_desc": (lambda d: -ts(d["created_at"])), "next_action_asc": (lambda d: ts(d["next_action_at"]) or 9e12)}
        rows.sort(key=sleutels.get(sort, sleutels["updated_desc"]))
        items, meta = page(rows, limit=limit, offset=offset)
        return {"items": items, **meta, "sort": sort, "generated_at": v.generated_at,
                "filters": {k: val for k, val in dict(stage=stage, execution_state=execution_state, qualification_status=qualification_status,
                                                       dashboard_state=dashboard_state, priority=priority, commodity=commodity,
                                                       counterparty=counterparty, blocked=blocked, approval_required=approval_required,
                                                       active=active, min_readiness=min_readiness, max_readiness=max_readiness,
                                                       updated_since=updated_since, include_lost=include_lost,
                                                       include_testcases=include_testcases).items() if val not in (None, False)},
                "excluded_testcases": uitgesloten,
                "definition": "Deals are rows in opportunities (excluding stage 'lost' unless include_lost). "
                              + canon.DEAL_STATE_DEFINITIONS["active"] + " is_executable_deal is always false until the "
                              "transaction gate is passed; an opportunity is not a deal.",
                "source": ["opportunities", "buyer_requirements", "supplier_offers", "companies"]}

    async def get_deal(self, caller: Caller, *, deal: str) -> dict:
        v = await self.v(caller)
        o = self.deal(v, deal)
        oid = o.get("id")
        match = sorted([m for m in v.s.rows("match_assessments") if m.get("opportunity_id") == oid
                        or (m.get("buyer_requirement_id") == o.get("buyer_requirement_id") and m.get("supplier_offer_id") == o.get("supplier_offer_id"))],
                       key=lambda m: -ts(m.get("assessed_at")))
        comms = sorted([c for c in v.s.rows("communications") if c.get("opportunity_id") == oid], key=lambda c: -ts(c.get("occurred_at")))
        taken = [t for t in v.s.rows("deal_tasks") if t.get("opportunity_id") == oid and t.get("status") in OPEN_TASK]
        acties = [a for a in v.s.rows("action_queue") if a.get("opportunity_id") == oid and a.get("status") in OPEN_TASK]
        req, off = v.req(o), v.off(o)
        contacten = lambda co: [v.contact_ref(c) for c in v.s.rows("contacts") if co and c.get("company_id") == co.get("id")][:10]
        return {
            "generated_at": v.generated_at,
            "deal": v.deal_summary(o),
            "buyer_requirement": _spec(req, v, "buyer"), "supplier_offer": _spec(off, v, "supplier"),
            "buyer_contacts": contacten(v.buyer(o)), "supplier_contacts": contacten(v.seller(o)),
            "gates": v.gates(o), "readiness": _readiness(o),
            "latest_match_assessment": _match(match[0]) if match else None,
            "open_tasks": [_task(t, "deal_tasks", v) for t in taken] + [_task(a, "action_queue", v) for a in acties],
            "communications": [v.communication_summary(c) for c in comms[:10]], "communications_total": len(comms),
            "evidence": [_evidence(e, v) for e in v.s.rows("deal_evidence") if e.get("opportunity_id") == oid][:25],
            "documents": [_document(d) for d in v.s.rows("deal_documents") if d.get("opportunity_id") == oid],
            "recent_events": [_event(e, v) for e in sorted([e for e in v.s.rows("deal_events") if e.get("opportunity_id") == oid],
                                                            key=lambda e: -ts(e.get("created_at")))[:10]],
            "commission": {"agreement_status": o.get("commission_agreement_status"), "type": o.get("commission_type"),
                           "rate": o.get("commission_rate"), "amount": o.get("commission_amount"),
                           "records": [c for c in v.s.rows("commissions") if c.get("opportunity_id") == oid],
                           "note": "Only a commissions row with status paid/secured or a signed agreement counts as secured commission."},
            "source": ["opportunities", "buyer_requirements", "supplier_offers", "companies", "contacts", "match_assessments",
                       "deal_tasks", "action_queue", "communications", "email_intelligence", "deal_evidence", "deal_documents",
                       "deal_events", "commissions"],
        }

    async def deal_readiness(self, caller: Caller, *, deal: str) -> dict:
        v = await self.v(caller)
        o = self.deal(v, deal)
        return {"generated_at": v.generated_at, "deal": canon.deal_label(o), "deal_id": o.get("id"), "readiness": _readiness(o),
                "gates_passed": sum(1 for g in GATES if o.get(f"{g}_gate_passed")), "source": ["opportunities"]}

    async def deal_gates(self, caller: Caller, *, deal: str) -> dict:
        v = await self.v(caller)
        o = self.deal(v, deal)
        return {"generated_at": v.generated_at, "deal": canon.deal_label(o), "deal_id": o.get("id"), "gates": v.gates(o),
                "definition": "passed = the *_gate_passed boolean on the opportunity. Evidence counts use deal_evidence per party side "
                              "(buyer/seller gates) or all evidence (evidence gate). Owner, next action and pass timestamp per gate are "
                              "not stored in the schema and are therefore null.",
                "source": ["opportunities", "deal_evidence"]}

    async def deal_blockers(self, caller: Caller, *, deal: str) -> dict:
        v = await self.v(caller)
        o = self.deal(v, deal)
        taken = [t for t in v.s.rows("deal_tasks") if t.get("opportunity_id") == o.get("id") and t.get("status") in OPEN_TASK
                 and (t.get("task_type") == "resolve_blocker" or t.get("execution_error"))]
        match = [m for m in v.s.rows("match_assessments") if m.get("opportunity_id") == o.get("id")]
        return {"generated_at": v.generated_at, "deal": canon.deal_label(o), "deal_id": o.get("id"),
                "primary_blocker": v.red(o.get("primary_blocker")) or None, "blocked": canon.is_blocked(o),
                "blocker_search_query": v.red(o.get("blocker_search_query")) or None,
                "gates_not_passed": [f"{g}" for g in GATES if not o.get(f"{g}_gate_passed")],
                "match_blockers": [m.get("blockers") for m in match], "match_missing_information": [m.get("missing_information") for m in match],
                "blocker_tasks": [_task(t, "deal_tasks", v) for t in taken],
                "integrity_flags": v.deal_flags(o),
                "source": ["opportunities", "deal_tasks", "match_assessments"]}

    async def deal_events(self, caller: Caller, *, deal: str, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        o = self.deal(v, deal)
        rows = sorted([e for e in v.s.rows("deal_events") if e.get("opportunity_id") == o.get("id")], key=lambda e: -ts(e.get("created_at")))
        items, meta = page([_event(e, v) for e in rows], limit=limit, offset=offset)
        return {"items": items, **meta, "sort": "created_desc", "generated_at": v.generated_at, "filters": {"deal": canon.deal_label(o)},
                "source": ["deal_events"]}

    async def pipeline_summary(self, caller: Caller) -> dict:
        v = await self.v(caller)
        alle = v.s.rows("opportunities")
        rijen = [v.map_row(o) for o in alle]
        kaart = canon.build_map([r for r in rijen if r.get("stage") != "lost"])
        open_ = [o for o in alle if canon.is_open(o)]
        niet_lost = [o for o in alle if o.get("stage") != "lost"]
        uitv = Counter((o.get("execution_state") or "(none)") for o in niet_lost)
        return {
            "generated_at": v.generated_at,
            "metrics": [
                _metric("pipeline_open", len(open_), canon.DEAL_STATE_DEFINITIONS["pipeline"], ["opportunities"], _ids(open_)),
                _metric("active", sum(1 for o in alle if canon.is_active(o)), canon.DEAL_STATE_DEFINITIONS["active"], ["opportunities"],
                        [o["id"] for o in alle if canon.is_active(o)]),
                _metric("blocked_open", sum(1 for o in open_ if canon.is_blocked(o)), canon.DEAL_STATE_DEFINITIONS["blocked"],
                        ["opportunities"], [o["id"] for o in open_ if canon.is_blocked(o)]),
                _metric("blocked_and_active", kaart["blocked_and_active"], "Deals that are both blocked and active (why the map legend shows "
                        "fewer 'active' than the counter).", ["opportunities"]),
                _metric("awaiting_approval", sum(1 for o in open_ if o.get("approval_required")), "Open deals with approval_required = true.",
                        ["opportunities"], [o["id"] for o in open_ if o.get("approval_required")]),
                _metric("won", sum(1 for o in alle if o.get("stage") == "won"), "stage = 'won'.", ["opportunities"]),
                _metric("reports_deals_total", len(niet_lost), "Reports tab 'deals' = stage <> 'lost' (includes won).", ["opportunities"]),
            ],
            "by_stage": dict(Counter(o.get("stage") for o in alle)),
            "by_execution_state_excluding_lost": dict(uitv),
            "by_qualification_status": dict(Counter((o.get("qualification_status") or "(none)") for o in niet_lost)),
            "readiness_buckets": dict(Counter(_bucket(o.get("readiness_score")) for o in niet_lost)),
            "map_state_counts": kaart["state_counts"],
            "notes": ["'matched' and 'qualifying' are execution_state values; neither means executable.",
                      "No opportunity has passed the transaction gate unless stated in by_gate."],
            "by_gate_passed": {g: sum(1 for o in niet_lost if o.get(f"{g}_gate_passed")) for g in GATES},
            "source": ["opportunities", "buyer_requirements", "supplier_offers", "companies"],
        }

    # ── COUNTERPARTIES ───────────────────────────────────────────────────────
    async def list_counterparties(self, caller: Caller, *, company_type=None, verification_status=None, country=None, commodity=None,
                                  search=None, has_open_deals=None, do_not_contact=None, updated_since=None, sort="updated_desc",
                                  limit=25, offset=0) -> dict:
        v = await self.v(caller)
        sinds = _since(updated_since)
        rows = []
        for c in v.s.rows("companies"):
            deals = [o for o in v.company_deals(c.get("id")) if canon.is_open(o)]
            kopers = [r for r in v.s.rows("buyer_requirements") if r.get("company_id") == c.get("id")]
            aanbod = [r for r in v.s.rows("supplier_offers") if r.get("company_id") == c.get("id")]
            if company_type and _lower(c.get("company_type")) != _lower(company_type):
                continue
            if verification_status and _lower(c.get("verification_status")) != _lower(verification_status):
                continue
            if country and _lower(country) not in _lower(c.get("country")):
                continue
            if commodity and not any(_lower(commodity) in _lower(x) for x in (c.get("commodity_focus") or [])):
                continue
            if search:
                velden = [c.get("country"), " ".join(c.get("commodity_focus") or [])] + ([c.get("company_name"), c.get("city")] if caller.identity else [])
                if not any(_lower(search) in _lower(x) for x in velden if x):
                    continue
            if has_open_deals is not None and bool(deals) != has_open_deals:
                continue
            ref = v.company_ref(c)
            dnc = any(f["flag"] == "do_not_contact" for f in ref.get("integrity_flags", []))
            if do_not_contact is not None and dnc != do_not_contact:
                continue
            if sinds and ts(c.get("updated_at")) < sinds:
                continue
            laatste = max((ts(m.get("occurred_at")) for m in v.s.rows("communications") if m.get("company_id") == c.get("id")), default=0)
            rows.append({**ref, "open_deals": len(deals), "buyer_requirements": len(kopers), "supplier_offers": len(aanbod),
                         "last_communication_at": iso(_dt(laatste)) if laatste else None,
                         "created_at": c.get("created_at"), "updated_at": c.get("updated_at")})
        rows.sort(key={"updated_desc": lambda r: -ts(r["updated_at"]), "open_deals_desc": lambda r: -r["open_deals"],
                       "last_contact_desc": lambda r: -ts(r["last_communication_at"])}.get(sort, lambda r: -ts(r["updated_at"])))
        items, meta = page(rows, limit=limit, offset=offset)
        return {"items": items, **meta, "sort": sort, "generated_at": v.generated_at,
                "filters": {k: val for k, val in dict(company_type=company_type, verification_status=verification_status, country=country,
                                                       commodity=commodity, search=search, has_open_deals=has_open_deals,
                                                       do_not_contact=do_not_contact, updated_since=updated_since).items() if val is not None},
                "definition": "All rows in companies (the same population the Counterparties tab shows). 'reviewing' is NOT verified.",
                "identity_redacted": not caller.identity,
                "source": ["companies", "opportunities", "buyer_requirements", "supplier_offers", "communications"]}

    async def get_counterparty(self, caller: Caller, *, counterparty: str) -> dict:
        v = await self.v(caller)
        c = self.company(v, counterparty)
        cid = c.get("id")
        return {
            "generated_at": v.generated_at, "counterparty": v.company_ref(c),
            "trade_activity": v.red(c.get("trade_activity")) or None, "notes": v.red(c.get("notes"))[:1500] or None,
            "source_type": c.get("source_type"), "source_url": c.get("source_url") if caller.identity else ("[redacted]" if c.get("source_url") else None),
            "contacts": [v.contact_ref(x) for x in v.s.rows("contacts") if x.get("company_id") == cid],
            "buyer_requirements": [_spec(r, v, "buyer") for r in v.s.rows("buyer_requirements") if r.get("company_id") == cid],
            "supplier_offers": [_spec(r, v, "supplier") for r in v.s.rows("supplier_offers") if r.get("company_id") == cid],
            "opportunities": [v.deal_summary(o) for o in v.company_deals(cid)],
            "verification_checks": [_check(x, v) for x in v.s.rows("verification_checks") if x.get("company_id") == cid],
            "communications_total": sum(1 for m in v.s.rows("communications") if m.get("company_id") == cid),
            "created_at": c.get("created_at"), "updated_at": c.get("updated_at"),
            "source": ["companies", "contacts", "buyer_requirements", "supplier_offers", "opportunities", "verification_checks"],
        }

    async def counterparty_evidence(self, caller: Caller, *, counterparty: str) -> dict:
        v = await self.v(caller)
        c = self.company(v, counterparty)
        deal_ids = {o.get("id") for o in v.company_deals(c.get("id"))}
        return {"generated_at": v.generated_at, "counterparty": v.company_ref(c),
                "verification_checks": [_check(x, v) for x in v.s.rows("verification_checks") if x.get("company_id") == c.get("id")],
                "deal_evidence": [_evidence(e, v) for e in v.s.rows("deal_evidence") if e.get("opportunity_id") in deal_ids],
                "source": ["verification_checks", "deal_evidence"]}

    async def counterparty_communications(self, caller: Caller, *, counterparty: str, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        c = self.company(v, counterparty)
        rows = sorted([m for m in v.s.rows("communications") if m.get("company_id") == c.get("id")], key=lambda m: -ts(m.get("occurred_at")))
        items, meta = page([v.communication_summary(m) for m in rows], limit=limit, offset=offset)
        return {"items": items, **meta, "sort": "occurred_desc", "generated_at": v.generated_at,
                "filters": {"counterparty_id": c.get("id")}, "source": ["communications", "email_intelligence"]}

    async def counterparty_opportunities(self, caller: Caller, *, counterparty: str) -> dict:
        v = await self.v(caller)
        c = self.company(v, counterparty)
        return {"generated_at": v.generated_at, "counterparty": v.company_ref(c),
                "opportunities": [v.deal_summary(o) for o in v.company_deals(c.get("id"))],
                "source": ["opportunities", "buyer_requirements", "supplier_offers"]}

    # ── COMMUNICATIONS ───────────────────────────────────────────────────────
    async def list_communications(self, caller: Caller, *, direction=None, channel=None, delivery_status=None, counterparty=None, deal=None,
                                  classification=None, urgency=None, since=None, has_analysis=None, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        sinds = _since(since)
        cid = self.company(v, counterparty).get("id") if counterparty else None
        did = self.deal(v, deal).get("id") if deal else None
        rows = []
        for m in v.s.rows("communications"):
            if direction and _lower(m.get("direction")) != _lower(direction):
                continue
            if channel and _lower(m.get("channel")) != _lower(channel):
                continue
            if delivery_status and _lower(m.get("delivery_status") or "not_tracked") != _lower(delivery_status):
                continue
            if cid and m.get("company_id") != cid:
                continue
            if did and m.get("opportunity_id") != did:
                continue
            if sinds and ts(m.get("occurred_at")) < sinds:
                continue
            ei = v.intel(m.get("id"))
            if has_analysis is not None and bool(ei) != has_analysis:
                continue
            if classification and _lower((ei or {}).get("classification")) != _lower(classification):
                continue
            if urgency and _lower((ei or {}).get("urgency")) != _lower(urgency):
                continue
            rows.append(m)
        rows.sort(key=lambda m: -ts(m.get("occurred_at")))
        stuk, meta = page(rows, limit=limit, offset=offset)
        return {"items": [v.communication_summary(m) for m in stuk], **meta, "sort": "occurred_desc", "generated_at": v.generated_at,
                "filters": {k: val for k, val in dict(direction=direction, channel=channel, delivery_status=delivery_status, counterparty=counterparty,
                                                       deal=deal, classification=classification, urgency=urgency, since=since,
                                                       has_analysis=has_analysis).items() if val is not None},
                "definition": "Rows in communications (the Communications tab shows the newest 300). delivery_status is only tracked for "
                              "outbound email sent through Resend; null is reported as 'not_tracked'.",
                "canonical_channel": {"mailbox": "trade@northseacommodity.com", "outbound_transport": "Resend",
                                      "from": "NorthSea Commodity Partners <trade@northseacommodity.com>", "reply_to": "trade@northseacommodity.com"},
                "source": ["communications", "email_intelligence", "reply_drafts", "call_intelligence"]}

    async def get_communication(self, caller: Caller, *, communication: str) -> dict:
        v = await self.v(caller)
        m = self.communication(v, communication)
        bijlagen = [{"attachment_id": a.get("id"), "filename": a.get("filename") if caller.identity else "[redacted]",
                     "content_type": a.get("content_type"), "size": a.get("size")}
                    for a in v.s.rows("inbound_email_attachments")
                    if a.get("resend_email_id") and a.get("resend_email_id") == m.get("external_message_id")]
        return {"generated_at": v.generated_at, "communication": v.communication_summary(m, full=True), "attachments": bijlagen,
                "source": ["communications", "email_intelligence", "reply_drafts", "call_intelligence", "inbound_email_attachments"]}

    async def recent_inbound(self, caller: Caller, *, days=7, limit=25, offset=0) -> dict:
        since = iso(_now_minus(days))
        uit = await self.list_communications(caller, direction="inbound", since=since, limit=limit, offset=offset)
        uit["filters"] = {"direction": "inbound", "days": days}
        return uit

    async def communication_thread(self, caller: Caller, *, communication: str) -> dict:
        v = await self.v(caller)
        m = self.communication(v, communication)
        sleutel = thread_key(m)
        rows = sorted([x for x in v.s.rows("communications") if thread_key(x) == sleutel], key=lambda x: ts(x.get("occurred_at")))
        return {"generated_at": v.generated_at, "thread_key": sleutel, "messages": [v.communication_summary(x, full=True) for x in rows],
                "definition": "NorthSea stores no In-Reply-To chain. A thread is derived: same deal (else same counterparty) and the "
                              "same subject after removing Re:/Fwd: prefixes. Treat as a best-effort grouping.",
                "source": ["communications", "email_intelligence", "reply_drafts"]}

    async def failed_or_bounced(self, caller: Caller, *, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        rows = sorted([m for m in v.s.rows("communications") if _lower(m.get("delivery_status")) in ("bounced", "failed", "complained", "delivery_delayed")],
                      key=lambda m: -ts(m.get("occurred_at")))
        stuk, meta = page(rows, limit=limit, offset=offset)
        return {"items": [v.communication_summary(m) for m in stuk], **meta, "sort": "occurred_desc", "generated_at": v.generated_at,
                "filters": {"delivery_status": ["bounced", "failed", "complained", "delivery_delayed"]},
                "source": ["communications"]}

    async def summarize_inbound(self, caller: Caller, *, days=14) -> dict:
        v = await self.v(caller)
        grens = _now_minus(days).timestamp()
        rows = [m for m in v.s.rows("communications") if m.get("direction") == "inbound" and ts(m.get("occurred_at")) >= grens]
        intel = [v.intel(m.get("id")) for m in rows]
        met = [e for e in intel if e]
        aandacht = sorted([v.communication_summary(m) for m, e in zip(rows, intel)
                           if e and (_lower(e.get("urgency")) in ("high", "urgent", "critical") or e.get("requires_human_approval")
                                     or _lower(e.get("risk_level")) in ("high", "critical"))],
                          key=lambda x: -ts(x["occurred_at"]))
        return {"generated_at": v.generated_at, "window_days": days, "inbound_messages": len(rows), "analyzed": len(met),
                "not_analyzed": len(rows) - len(met),
                "by_classification": dict(Counter(e.get("classification") or "(none)" for e in met)),
                "by_urgency": dict(Counter(e.get("urgency") or "(none)" for e in met)),
                "by_risk_level": dict(Counter(e.get("risk_level") or "(none)" for e in met)),
                "requires_human_approval": sum(1 for e in met if e.get("requires_human_approval")),
                "needs_attention": aandacht[:15],
                "not_linked_to_deal": sum(1 for m in rows if not m.get("opportunity_id")),
                "source": ["communications", "email_intelligence"]}

    # ── TASKS ────────────────────────────────────────────────────────────────
    def _all_tasks(self, v: View) -> list[dict]:
        return [_task(t, "deal_tasks", v) for t in v.s.rows("deal_tasks")] + [_task(a, "action_queue", v) for a in v.s.rows("action_queue")]

    async def list_tasks(self, caller: Caller, *, status="open", source=None, deal=None, requires_approval=None, overdue=None, owner=None,
                         limit=25, offset=0) -> dict:
        v = await self.v(caller)
        did = self.deal(v, deal).get("id") if deal else None
        rows = []
        for t in self._all_tasks(v):
            if status == "open" and t["status"] not in OPEN_TASK:
                continue
            if status not in (None, "open", "any") and t["status"] != status:
                continue
            if source and t["source"] != source:
                continue
            if did and t["deal_id"] != did:
                continue
            if requires_approval is not None and bool(t["requires_approval"]) != requires_approval:
                continue
            if overdue is not None and t["overdue"] != overdue:
                continue
            if owner and _lower(t.get("owner")) != _lower(owner):
                continue
            rows.append(t)
        rows.sort(key=lambda t: (not t["overdue"], -(t["priority"] or 0), ts(t["due_at"]) or 9e12))
        items, meta = page(rows, limit=limit, offset=offset)
        return {"items": items, **meta, "sort": "overdue_first,priority_desc,due_asc", "generated_at": v.generated_at,
                "filters": {k: val for k, val in dict(status=status, source=source, deal=deal, requires_approval=requires_approval,
                                                       overdue=overdue, owner=owner).items() if val is not None},
                "definition": "Tasks come from two tables: deal_tasks (per-deal work, owner axe/luka) and action_queue (sourcing/"
                              "qualification actions). 'open' = open, waiting or in_progress.",
                "source": ["deal_tasks", "action_queue"]}

    async def get_task(self, caller: Caller, *, task_id: str) -> dict:
        v = await self.v(caller)
        for bron in ("deal_tasks", "action_queue"):
            rij = v.s.get(bron, task_id.strip().lower())
            if rij:
                return {"generated_at": v.generated_at, "task": {**_task(rij, bron, v), "description": v.red(rij.get("description")) or None,
                                                                  "result": rij.get("result"), "metadata": rij.get("metadata")},
                        "source": [bron]}
        raise NotFound("task")

    async def pending_actions(self, caller: Caller, *, only=None, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        items = v.chase()
        if only == "critical":
            items = [i for i in items if i["critical"]]
        elif only == "new":
            items = [i for i in items if i["new"]]
        elif only == "overdue":
            items = [i for i in items if i["overdue"]]
        stuk, meta = page(items, limit=limit, offset=offset)
        return {"items": stuk, **meta, "sort": "critical_first,priority_desc,newest", "generated_at": v.generated_at,
                "filters": {"only": only} if only else {},
                "counts": {"all": len(v.chase()), "critical": sum(1 for i in v.chase() if i["critical"]),
                           "new": sum(1 for i in v.chase() if i["new"])},
                "definition": "The AXE Chase list of the Global Trade Center. Rules: " + " | ".join(canon.CHASE_RULES),
                "source": ["action_queue", "deal_tasks", "reply_drafts", "communications"]}

    # ── EVIDENCE / DOCUMENTS ─────────────────────────────────────────────────
    async def list_evidence(self, caller: Caller, *, deal=None, party_side=None, verification_class=None, evidence_type=None,
                            limit=25, offset=0) -> dict:
        v = await self.v(caller)
        did = self.deal(v, deal).get("id") if deal else None
        rows = [e for e in v.s.rows("deal_evidence")
                if (not did or e.get("opportunity_id") == did) and (not party_side or _lower(e.get("party_side")) == _lower(party_side))
                and (not evidence_type or _lower(e.get("evidence_type")) == _lower(evidence_type))
                and (not verification_class or canon.evidence_class(e.get("verification_status")) == verification_class)]
        rows.sort(key=lambda e: -ts(e.get("created_at")))
        stuk, meta = page(rows, limit=limit, offset=offset)
        return {"items": [_evidence(e, v) for e in stuk], **meta, "sort": "created_desc", "generated_at": v.generated_at,
                "filters": {k: val for k, val in dict(deal=deal, party_side=party_side, verification_class=verification_class,
                                                       evidence_type=evidence_type).items() if val is not None},
                "counts_by_class": dict(Counter(canon.evidence_class(e.get("verification_status")) for e in v.s.rows("deal_evidence"))),
                "definition": "verification_class: only 'verified' (verified/source_verified/confirmed) is verified. partial = counterparty-"
                              "stated or partly corroborated; unverified includes public_source_only; contradicted = rejected/expired.",
                "source": ["deal_evidence"]}

    async def get_evidence(self, caller: Caller, *, evidence_id: str) -> dict:
        v = await self.v(caller)
        e = v.s.get("deal_evidence", evidence_id.strip().lower())
        if not e:
            raise NotFound("evidence")
        return {"generated_at": v.generated_at, "evidence": {**_evidence(e, v), "metadata": e.get("metadata")}, "source": ["deal_evidence"]}

    async def list_documents(self, caller: Caller, *, deal=None, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        did = self.deal(v, deal).get("id") if deal else None
        docs = [{**_document(d), "kind": "deal_document"} for d in v.s.rows("deal_documents") if not did or d.get("opportunity_id") == did]
        bijl = [{"document_id": a.get("id"), "kind": "inbound_email_attachment", "deal_id": a.get("opportunity_id"),
                 "counterparty_id": a.get("company_id"), "filename": a.get("filename") if caller.identity else "[redacted]",
                 "content_type": a.get("content_type"), "size": a.get("size"), "created_at": a.get("created_at")}
                for a in v.s.rows("inbound_email_attachments") if not did or a.get("opportunity_id") == did]
        rows = sorted(docs + bijl, key=lambda d: -ts(d.get("created_at")))
        items, meta = page(rows, limit=limit, offset=offset)
        return {"items": items, **meta, "sort": "created_desc", "generated_at": v.generated_at, "filters": {"deal": deal} if deal else {},
                "definition": "deal_documents rows plus inbound email attachment metadata. File contents are never returned.",
                "source": ["deal_documents", "inbound_email_attachments"]}

    async def document_metadata(self, caller: Caller, *, document_id: str) -> dict:
        v = await self.v(caller)
        d = v.s.get("deal_documents", document_id.strip().lower())
        if d:
            return {"generated_at": v.generated_at, "document": {**_document(d), "metadata": d.get("metadata")}, "source": ["deal_documents"]}
        a = v.s.get("inbound_email_attachments", document_id.strip().lower())
        if a:
            return {"generated_at": v.generated_at, "document": {"document_id": a.get("id"), "kind": "inbound_email_attachment",
                                                                "filename": a.get("filename") if caller.identity else "[redacted]",
                                                                "content_type": a.get("content_type"), "size": a.get("size"),
                                                                "deal_id": a.get("opportunity_id"), "created_at": a.get("created_at")},
                    "source": ["inbound_email_attachments"]}
        raise NotFound("document")

    async def verification_status(self, caller: Caller, *, reference: str | None = None) -> dict:
        v = await self.v(caller)
        if not reference:
            comp = v.s.rows("companies")
            return {"generated_at": v.generated_at,
                    "counterparties_by_status": dict(Counter(c.get("verification_status") or "(none)" for c in comp)),
                    "verified_counterparty_ids": [c.get("id") for c in comp if c.get("verification_status") == "verified"],
                    "evidence_by_class": dict(Counter(canon.evidence_class(e.get("verification_status")) for e in v.s.rows("deal_evidence"))),
                    "verification_checks_by_status": dict(Counter(x.get("status") or "(none)" for x in v.s.rows("verification_checks"))),
                    "meanings": canon.COMPANY_VERIFICATION,
                    "why_zero_verified": "A company is verified only when companies.verification_status = 'verified'. 'reviewing' means a check "
                                         "is in progress and is deliberately not counted as verified.",
                    "source": ["companies", "deal_evidence", "verification_checks"]}
        try:
            c = self.company(v, reference)
            return await self.counterparty_evidence(caller, counterparty=c["id"])
        except (NotFound, ServiceError):
            o = self.deal(v, reference)
            return {"generated_at": v.generated_at, "deal": canon.deal_label(o), "gates": v.gates(o),
                    "buyer": v.company_ref(v.buyer(o), "buyer"), "supplier": v.company_ref(v.seller(o), "supplier"),
                    "source": ["opportunities", "deal_evidence", "companies"]}

    # ── APPROVALS ────────────────────────────────────────────────────────────
    def _approval_rows(self, v: View) -> list[dict]:
        rows = []
        for d in v.s.rows("reply_drafts"):
            if d.get("approval_status") == "pending" and not d.get("sent_at"):
                rows.append({"approval_id": d.get("id"), "kind": "reply_draft", "deal_id": d.get("opportunity_id"),
                             "subject": v.red(d.get("subject")), "sensitive_action": bool(d.get("sensitive_action")),
                             "gate": "Luka approves the exact draft (northsea_approve_draft); sensitive drafts also need signed commission protection.",
                             "created_at": d.get("created_at"), "updated_at": d.get("updated_at")})
        for o in v.s.rows("opportunities"):
            if o.get("approval_required") and canon.is_open(o):
                rows.append({"approval_id": o.get("id"), "kind": "deal_decision", "deal_id": o.get("id"), "deal": canon.deal_label(o),
                             "approval_type": o.get("approval_type"), "subject": v.red(o.get("next_best_action") or o.get("next_action")),
                             "gate": "Human decision recorded on the opportunity.", "created_at": o.get("created_at"), "updated_at": o.get("updated_at")})
        for bron in ("deal_tasks", "action_queue"):
            for t in v.s.rows(bron):
                if t.get("requires_approval") and t.get("status") in OPEN_TASK:
                    rows.append({"approval_id": t.get("id"), "kind": f"{bron}_approval", "deal_id": t.get("opportunity_id"),
                                 "subject": v.red(t.get("title")), "gate": "Completing needs northsea.admin.",
                                 "created_at": t.get("created_at"), "updated_at": t.get("updated_at")})
        for e in v.s.rows("email_intelligence"):
            if e.get("requires_human_approval") and _lower(e.get("status")) not in ("resolved", "done", "closed", "approved", "rejected"):
                rows.append({"approval_id": e.get("id"), "kind": "inbound_needs_human_review", "communication_id": e.get("communication_id"),
                             "deal_id": e.get("opportunity_id"), "subject": v.red(e.get("summary"))[:200],
                             "status": e.get("status"), "gate": "Human review of an inbound message flagged by email intelligence.",
                             "created_at": e.get("created_at"), "updated_at": e.get("updated_at")})
        rows.sort(key=lambda r: -ts(r.get("updated_at") or r.get("created_at")))
        return rows

    async def pending_approvals(self, caller: Caller, *, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        rows = self._approval_rows(v)
        items, meta = page(rows, limit=limit, offset=offset)
        return {"items": items, **meta, "sort": "updated_desc", "generated_at": v.generated_at,
                "counts_by_kind": dict(Counter(r["kind"] for r in rows)),
                "definition": "Everything waiting on a human: pending unsent reply drafts, opportunities with approval_required, open tasks "
                              "with requires_approval, and inbound email analyses with requires_human_approval that are not closed. "
                              "This tool only lists; approving is northsea_approve_draft (northsea.admin).",
                "source": ["reply_drafts", "opportunities", "deal_tasks", "action_queue", "email_intelligence"]}

    async def get_approval(self, caller: Caller, *, approval_id: str) -> dict:
        v = await self.v(caller)
        hit = next((a for a in self._approval_rows(v) if str(a["approval_id"]) == approval_id.strip().lower()), None)
        d = v.s.get("reply_drafts", approval_id.strip().lower())
        if d:
            return {"generated_at": v.generated_at, "approval": hit or {"approval_id": d.get("id"), "kind": "reply_draft", "status": d.get("approval_status")},
                    "draft": {"draft_id": d.get("id"), "approval_status": d.get("approval_status"), "sensitive_action": d.get("sensitive_action"),
                              "subject": v.red(d.get("subject")), "body": v.red(d.get("body")),
                              "to": d.get("to_email") if caller.identity else ("[email]" if d.get("to_email") else None),
                              "sent_at": d.get("sent_at"), "updated_at": d.get("updated_at"), "communication_id": d.get("communication_id")},
                    "source": ["reply_drafts"]}
        if hit:
            return {"generated_at": v.generated_at, "approval": hit,
                    "source": ["reply_drafts", "opportunities", "deal_tasks", "action_queue", "email_intelligence"]}
        raise NotFound("approval")

    # ── COMMUNICATION ENGINE (P1) ────────────────────────────────────────────
    async def engine_status(self, caller: Caller) -> dict:
        v = await self.v(caller)
        ticks = sorted([a for a in v.s.rows("northsea_audit_events") if a.get("action") == "engine_tick"],
                       key=lambda a: str(a.get("occurred_at") or ""), reverse=True)
        deals = [o for o in v.s.rows("opportunities") if o.get("stage") != "lost" and not o.get("is_synthetic")]
        per_blokkade = Counter(o.get("engine_blocker_code") or "(not evaluated)" for o in deals)
        per_eigenaar = Counter(o.get("engine_owner") or "(not evaluated)" for o in deals)
        fu = v.s.rows("northsea_followups")
        chase = [q for q in v.s.rows("action_queue") if (q.get("metadata") or {}).get("source") == "northsea-engine" and q.get("status") in OPEN_TASK]
        bounced = [c for c in v.s.rows("contacts") if c.get("email_status") in ("bounced", "complained")]
        laatste_fout = next((t for t in ticks if (t.get("details") or {}).get("errors")), None)
        stuck = self.store.list_stuck(older_than_s=600.0) if self.store else None
        return {
            "generated_at": v.generated_at,
            "engine": {"last_tick_at": ticks[0].get("occurred_at") if ticks else None,
                       "last_summary": (ticks[0].get("details") or {}).get("summary") if ticks else None,
                       "last_errors": (ticks[0].get("details") or {}).get("errors") if ticks else None,
                       "last_failed_tick_at": laatste_fout.get("occurred_at") if laatste_fout else None,
                       "ticks_recorded": len(ticks), "sends": 0,
                       "stuck_runs": stuck if stuck is not None else "not_available_from_this_process",
                       "guarantees": ["never sends", "never approves", "never passes a gate or changes stage",
                                      "follow-ups are pending drafts that need human approval",
                                      "ambiguous mappings are never resolved automatically"]},
            "deals_by_current_blocker": dict(per_blokkade),
            "deals_by_owner": dict(per_eigenaar),
            "followups_by_status": dict(Counter(f.get("status") for f in fu)),
            "open_engine_chase_items": [{"action_queue_id": q.get("id"), "type": q.get("action_type"), "title": q.get("title"),
                                         "deal_id": q.get("opportunity_id"), "priority": q.get("priority"), "created_at": q.get("created_at")}
                                        for q in sorted(chase, key=lambda q: -(q.get("priority") or 0))[:25]],
            "bounced_channels": len(bounced),
            "definition": "Deterministic engine (engine_rules.py). Blocker and next action are stored in opportunities.engine_*; "
                          "they complement, and never overwrite, next_best_action set by people or agents.",
            "source": ["northsea_audit_events", "opportunities", "northsea_followups", "action_queue", "contacts"],
        }

    async def live_operations(self, caller: Caller) -> dict:
        """Consolidated operational view across everything already tracked separately: the deterministic
        engine (northsea_get_engine_status), discovery + governed crew invocation, and Chase approvals
        (northsea_list_pending_approvals). No new data source -- this only re-groups existing rows by
        operational state, so the picture matches those tools exactly. Read-only."""
        v = await self.v(caller)
        audits = sorted(v.s.rows("northsea_audit_events"), key=lambda a: str(a.get("occurred_at") or ""), reverse=True)
        laatste_tick = next((a for a in audits if a.get("action") == "engine_tick"), None)
        laatste_sweep = next((a for a in audits if a.get("action") == "discovery_sweep"), None)
        laatste_crew = next((a for a in audits if a.get("action") in ("crew_candidate_review_requested", "crew_candidate_review_skipped")), None)
        recent_gebeurtenissen = [x for x in [
            {"actor": "engine", "action": "engine_tick", "at": laatste_tick.get("occurred_at"),
             "summary": (laatste_tick.get("details") or {}).get("summary")} if laatste_tick else None,
            {"actor": "discovery", "action": "discovery_sweep", "at": laatste_sweep.get("occurred_at"),
             "summary": laatste_sweep.get("details")} if laatste_sweep else None,
            {"actor": "discovery+crew", "action": laatste_crew.get("action"), "at": laatste_crew.get("occurred_at"),
             "summary": laatste_crew.get("details")} if laatste_crew else None,
        ] if x]

        fu = v.s.rows("northsea_followups")
        wachtend_fu = [f for f in fu if f.get("status") == "scheduled"]
        wachtend_chase = [q for q in v.s.rows("action_queue") if q.get("status") == "waiting"]
        approvals = self._approval_rows(v)
        laatste_fout_tick = next((a for a in audits if a.get("action") == "engine_tick" and (a.get("details") or {}).get("errors")), None)
        research_mislukt = [q for q in v.s.rows("action_queue") if q.get("action_type") == "research_approval"
                            and (q.get("metadata") or {}).get("execution_result") == "failed_permanently"]
        crew_overgeslagen = [a for a in audits if a.get("action") == "crew_candidate_review_skipped"][:10]
        schema = await self.i.auditor.get_schedule("northsea") if self.i.auditor else None

        return {
            "generated_at": v.generated_at,
            "now_running": {"note": "Not directly observable from a read-only database snapshot (no process lock state here). "
                                    "Compare last_run_at (below) to next_scheduled: if next_scheduled is already in the past, a "
                                    "run may be in progress or the schedule may be stuck -- see northsea_get_system_health."},
            "recently_completed": recent_gebeurtenissen,
            "waiting": {"followups_scheduled": len(wachtend_fu), "chase_waiting_reply": len(wachtend_chase),
                       "items": [{"deal_id": f.get("opportunity_id"), "due_at": f.get("due_at"), "reason": f.get("reason")}
                                 for f in wachtend_fu[:10]]},
            "approval_required": {"count": len(approvals), "items": approvals[:10]},
            "failed": {"last_failed_tick_at": laatste_fout_tick.get("occurred_at") if laatste_fout_tick else None,
                      "research_failed_permanently": [{"action_queue_id": q.get("id"), "deal_id": q.get("opportunity_id"),
                                                       "blocker": (q.get("metadata") or {}).get("blocker_code")} for q in research_mislukt],
                      "crew_reviews_skipped_recent": [{"at": a.get("occurred_at"), "reason": (a.get("details") or {}).get("reason")}
                                                      for a in crew_overgeslagen]},
            "next_scheduled": schema if schema else {"note": "No core_schedules row found for app='northsea', or unreachable."},
            "definition": "Consolidates engine/discovery/crew/chase state that already exists individually via "
                          "northsea_get_engine_status, northsea_list_pending_approvals and northsea_get_system_health -- "
                          "grouped by operational state (running/completed/waiting/approval/failed/next) instead of by table.",
            "source": ["northsea_audit_events", "northsea_followups", "action_queue", "reply_drafts", "opportunities",
                      "email_intelligence", "core_schedules (AXE project)"],
        }

    async def list_followups(self, caller: Caller, *, status: str | None = None, deal: str | None = None, limit=25, offset=0) -> dict:
        v = await self.v(caller)
        rijen = v.s.rows("northsea_followups")
        if status:
            rijen = [f for f in rijen if f.get("status") == status]
        if deal:
            o = self.deal(v, deal)
            rijen = [f for f in rijen if f.get("opportunity_id") == o.get("id")]
        rijen = sorted(rijen, key=lambda f: str(f.get("due_at") or ""))
        drafts = {d.get("id"): d for d in v.s.rows("reply_drafts")}
        items = [{"followup_id": f.get("id"), "status": f.get("status"), "attempt": f.get("attempt"), "due_at": f.get("due_at"),
                  "deal_id": f.get("opportunity_id"), "deal": canon.deal_label(v.s.get("opportunities", f.get("opportunity_id")) or {}) if f.get("opportunity_id") else None,
                  "counterparty": v.company_ref(v.s.get("companies", f.get("company_id"))), "anchor_communication_id": f.get("anchor_communication_id"),
                  "draft_id": f.get("draft_id"), "draft_approval_status": (drafts.get(f.get("draft_id")) or {}).get("approval_status"),
                  "reason": f.get("reason"), "created_at": f.get("created_at")} for f in rijen]
        stuk, meta = page(items, limit=limit, offset=offset)
        return {"items": stuk, **meta, "generated_at": v.generated_at, "filters": {"status": status, "deal": deal},
                "definition": "Durable follow-up plans (one per anchor email and attempt). A plan becomes a PENDING draft; sending needs human approval.",
                "source": ["northsea_followups", "reply_drafts", "opportunities", "companies"]}

    # ── MARKET ───────────────────────────────────────────────────────────────
    async def market_context(self, caller: Caller) -> dict:
        v = await self.v(caller)
        return {"generated_at": v.generated_at, "instruments_shown_in_market_intel": MARKET_INSTRUMENTS,
                "prices_via_mcp": False,
                "why": "The Market Intel tab fetches prices client-side (MetaApi snapshot, then LSE vault via the AXE API proxy; LSE free "
                       "tier = 10 downloads/hour shared with the app). The MCP does not spend that quota and does not return prices. "
                       "Prices outside plausible_band are rejected by the tab rather than shown.",
                "no_source_in_axe": ["news", "economic calendar", "flows"],
                "rule": "Market data is context only; it never becomes a deal fact.",
                "source": ["src/presentation/pages/northsea/tabs/MarktTab.tsx (configuration)"]}

    async def market_intelligence(self, caller: Caller, *, commodity=None, days=90) -> dict:
        v = await self.v(caller)
        grens = _now_minus(days).timestamp()
        act = ("draft", "active", "paused", "matched")
        vragen = [r for r in v.s.rows("buyer_requirements") if (r.get("status") in act)]
        aanbod = [r for r in v.s.rows("supplier_offers") if (r.get("status") in act)]
        test = [r for r in vragen + aanbod if canon.testcase_reason(r, v.s.get("companies", r.get("company_id")))]
        test_ids = {r.get("id") for r in test}
        vragen = [r for r in vragen if r.get("id") not in test_ids and (not commodity or _lower(commodity) in _lower(f"{r.get('commodity')} {r.get('product')}"))]
        aanbod = [r for r in aanbod if r.get("id") not in test_ids and (not commodity or _lower(commodity) in _lower(f"{r.get('commodity')} {r.get('product')}"))]
        per = {}
        for kant, rows in (("demand", vragen), ("supply", aanbod)):
            for r in rows:
                sleutel = _lower(r.get("commodity")) or "(unknown)"
                per.setdefault(sleutel, {"demand": 0, "supply": 0, "demand_mt": 0.0, "supply_mt": 0.0})
                per[sleutel][kant] += 1
                per[sleutel][f"{kant}_mt"] += float(r.get("quantity_mt") or 0)
        recent = sorted([{"kind": "buyer_requirement", **_spec(r, v, "buyer")} for r in vragen if ts(r.get("created_at")) >= grens]
                        + [{"kind": "supplier_offer", **_spec(r, v, "supplier")} for r in aanbod if ts(r.get("created_at")) >= grens],
                        key=lambda x: -ts(x.get("created_at")))
        return {"generated_at": v.generated_at, "by_commodity": per, "recent_captures": recent[:40], "recent_window_days": days,
                "excluded_internal_testcases": [{"id": r.get("id"), "reason": canon.testcase_reason(r, v.s.get("companies", r.get("company_id")))} for r in test],
                "definition": "Active (draft/active/paused/matched) buyer requirements and supplier offers recorded in NorthSea. These are "
                              "captured leads, not verified demand: check each record's evidence and verification before relying on it.",
                "source": ["buyer_requirements", "supplier_offers", "companies"]}

    # ── REPORTING ────────────────────────────────────────────────────────────
    async def deal_metrics(self, caller: Caller) -> dict:
        uit = await self.pipeline_summary(caller)
        v = await self.v(caller)
        open_ = [o for o in v.s.rows("opportunities") if canon.is_open(o)]
        commissies = v.s.rows("commissions")
        uit["commission"] = {
            "secured_commission_records": [c for c in commissies if _lower(c.get("status")) in ("secured", "invoiced", "paid")],
            "signed_commission_agreements": sum(1 for o in open_ if _lower(o.get("commission_agreement_status")) == "signed"),
            "deals_with_commission_amount": sum(1 for o in open_ if o.get("commission_amount") is not None),
            "deals_with_commission_rate": sum(1 for o in open_ if o.get("commission_rate") is not None),
            "deals_with_estimated_value": sum(1 for o in open_ if o.get("estimated_value") is not None),
            "definition": "Commission Secured may only contain secured/invoiced/paid commission records or signed agreements. "
                          "Unknown values stay null; nothing is estimated.",
        }
        uit["source"] = sorted(set(uit["source"]) | {"commissions"})
        return uit

    async def counterparty_metrics(self, caller: Caller) -> dict:
        v = await self.v(caller)
        comp = v.s.rows("companies")
        return {"generated_at": v.generated_at, "total": len(comp),
                "by_type": dict(Counter(c.get("company_type") or "(none)" for c in comp)),
                "by_verification_status": dict(Counter(c.get("verification_status") or "(none)" for c in comp)),
                "by_country": dict(Counter(c.get("country") or "(unknown)" for c in comp).most_common(30)),
                "with_open_deals": sum(1 for c in comp if any(canon.is_open(o) for o in v.company_deals(c.get("id")))),
                "do_not_contact": [{"counterparty_id": c.get("id"), "reason": canon.do_not_contact_reason(c)} for c in comp if canon.do_not_contact_reason(c)],
                "contact_review_required": [{"counterparty_id": c.get("id"), "reason": canon.contact_review_reason(c)} for c in comp if canon.contact_review_reason(c)],
                "contacts_total": len(v.s.rows("contacts")),
                "definition": "Reports tab 'bedrijf_soorten' and 'bedrijf_verificatie' use the same companies population.",
                "source": ["companies", "contacts", "opportunities"]}

    async def communications_metrics(self, caller: Caller, *, weeks=12) -> dict:
        v = await self.v(caller)
        grens = _now_minus(weeks * 7).timestamp()
        rows = [m for m in v.s.rows("communications") if ts(m.get("occurred_at")) >= grens]
        weken: dict[str, Counter] = {}
        for m in rows:
            d = _dt(ts(m.get("occurred_at")))
            wk = (d - timedelta(days=d.weekday())).date().isoformat()
            weken.setdefault(wk, Counter())[m.get("direction") or "(none)"] += 1
        uit_email = [m for m in v.s.rows("communications") if m.get("direction") == "outbound" and m.get("channel") == "email"]
        return {"generated_at": v.generated_at, "window_weeks": weeks,
                "by_week": {k: dict(c) for k, c in sorted(weken.items())},
                "by_channel": dict(Counter(m.get("channel") for m in rows)),
                "outbound_email_delivery": dict(Counter(m.get("delivery_status") or "not_tracked" for m in uit_email)),
                "bounced_total": sum(1 for m in v.s.rows("communications") if m.get("delivery_status") == "bounced"),
                "inbound_with_analysis": sum(1 for m in v.s.rows("communications") if m.get("direction") == "inbound" and v.intel(m.get("id"))),
                "inbound_total": sum(1 for m in v.s.rows("communications") if m.get("direction") == "inbound"),
                "drafts_by_status": dict(Counter(d.get("approval_status") or "(none)" for d in v.s.rows("reply_drafts"))),
                "definition": "Same weekly buckets as the Reports tab (date_trunc week, Monday).",
                "source": ["communications", "email_intelligence", "reply_drafts"]}

    # ── DASHBOARD SNAPSHOT ───────────────────────────────────────────────────
    async def dashboard_snapshot(self, caller: Caller, *, view: str | None = None) -> dict:
        v = await self.v(caller)
        alle = v.s.rows("opportunities")
        rijen = [v.map_row(o) for o in alle if o.get("stage") != "lost"]
        kaart = canon.build_map(rijen)
        balie = canon.desk_counters([v.map_row(o) for o in alle], v.now)
        chase = v.chase()
        comp = v.s.rows("companies")
        comms = v.s.rows("communications")
        opp_src = ["opportunities", "buyer_requirements", "supplier_offers", "companies"]
        actief_ids = [o["id"] for o in alle if canon.is_active(o)]
        views: dict[str, dict] = {
            "live_map": {"backend": "backend/axe_api/northsea.py 'kaart' + src/domain/northsea/kaart.ts bouwKaart", "metrics": [
                _metric("active_deals", balie["active"], canon.DEAL_STATE_DEFINITIONS["active"], opp_src, actief_ids),
                _metric("pipeline", balie["pipeline"], canon.DEAL_STATE_DEFINITIONS["pipeline"], opp_src),
                _metric("routes", len(kaart["routes"]), "Deals (stage <> lost) whose supplier side (loading_port -> origin -> supplier "
                        "establishment) AND buyer side (destination -> buyer establishment) both resolve to one known place or country. "
                        "Ambiguous ('A / B', 'X or Y'), regions and unknown text do not make a route.", opp_src, [r["deal_id"] for r in kaart["routes"]]),
                _metric("routes_approximate", sum(1 for r in kaart["routes"] if r["approximate"]),
                        "Routes where an endpoint is a company establishment instead of a place stated in the deal.", opp_src,
                        [r["deal_id"] for r in kaart["routes"] if r["approximate"]]),
                _metric("not_placed", len(kaart["not_placed"]), "Deals without a drawable route, with the reason.", opp_src,
                        [n["deal_id"] for n in kaart["not_placed"]]),
                _metric("map_state_counts", kaart["state_counts"], "kaart.ts dealStand: blocked wins over active.", opp_src),
                _metric("blocked_and_active", kaart["blocked_and_active"], "Why the legend's 'active' is lower than the counter.", opp_src),
                _metric("new_active_this_week", balie["new_active_this_week"], "Active deals created in the last 7 days.", opp_src),
                _metric("awaiting_approval", balie["awaiting_approval"], "Open deals with approval_required.", opp_src),
                _metric("commission_amount_sum", balie["commission_amount_sum"], "Sum of recorded commission_amount on open deals; null when "
                        "none is recorded (never $0).", opp_src)],
                "routes": kaart["routes"], "not_placed": kaart["not_placed"]},
            "active_deals": {"backend": "northsea.py TAB_SQL['deals'] + desk.ts dealRijen('actief')", "metrics": [
                _metric("active_deals", len(actief_ids), canon.DEAL_STATE_DEFINITIONS["active"], opp_src, actief_ids),
                _metric("active_blocked", sum(1 for o in alle if canon.is_active(o) and canon.is_blocked(o)), "Active AND primary_blocker set.",
                        opp_src, [o["id"] for o in alle if canon.is_active(o) and canon.is_blocked(o)])]},
            "pipeline": {"backend": "northsea.py TAB_SQL['pipeline']", "metrics": (await self.pipeline_summary(caller))["metrics"]},
            "counterparties": {"backend": "northsea.py TAB_SQL['tegenpartijen']", "metrics": [
                _metric("counterparties", len(comp), "All rows in companies (tab limit 1000).", ["companies"]),
                _metric("by_verification_status", dict(Counter(c.get("verification_status") or "(none)" for c in comp)),
                        "companies.verification_status. Only 'verified' is verified; 'reviewing' is shown as in review (blue), not green.",
                        ["companies"]),
                _metric("verified", sum(1 for c in comp if c.get("verification_status") == "verified"), "verification_status = 'verified'.",
                        ["companies"], [c["id"] for c in comp if c.get("verification_status") == "verified"]),
                _metric("do_not_contact", sum(1 for c in comp if canon.do_not_contact_reason(c)),
                        "companies.contact_policy = do_not_contact. Machine-enforced: the database refuses drafts, sends, work items and campaigns.",
                        ["companies"], [c["id"] for c in comp if canon.do_not_contact_reason(c)]),
                _metric("contact_review_required", sum(1 for c in comp if canon.contact_review_reason(c)),
                        "contact_policy = review_required (automation blocked, human decides) or notes indicating no intermediaries without a policy set.",
                        ["companies"], [c["id"] for c in comp if canon.contact_review_reason(c)])]},
            "communications": {"backend": "northsea.py TAB_SQL['communicatie'] (newest 300)", "metrics": [
                _metric("messages", sum(1 for m in comms if not m.get("is_synthetic")),
                        "Rows in communications excluding synthetic/test messages (is_synthetic).", ["communications"]),
                _metric("synthetic_messages_excluded", sum(1 for m in comms if m.get("is_synthetic")), "communications.is_synthetic = true.",
                        ["communications"], [m["id"] for m in comms if m.get("is_synthetic")]),
                _metric("messages_in_tab", min(len(comms), 300), "The tab shows the newest 300.", ["communications"]),
                _metric("by_direction", dict(Counter(m.get("direction") for m in comms)), "communications.direction.", ["communications"]),
                _metric("bounced", sum(1 for m in comms if m.get("delivery_status") == "bounced"), "delivery_status = bounced.",
                        ["communications"], [m["id"] for m in comms if m.get("delivery_status") == "bounced"]),
                _metric("messages_last_7d", sum(1 for m in comms if not m.get("is_synthetic") and ts(m.get("occurred_at")) >= _now_minus(7).timestamp()),
                        "occurred_at in the last 7 days, excluding synthetic/test messages (desk counter 'communicatie_7d').", ["communications"])]},
            "market_intel": {"backend": "client-side MetaApi + LSE via AXE API /market/lse (not the NorthSea database)",
                             "metrics": [_metric("instruments", [m["symbol"] for m in MARKET_INSTRUMENTS], "Configured in MarktTab.tsx.", [])],
                             "note": "Prices are not reproduced by the MCP; see northsea_get_market_context."},
            "documents": {"backend": "northsea.py TAB_SQL['documenten']", "metrics": [
                _metric("deal_documents", len(v.s.rows("deal_documents")), "Rows in deal_documents.", ["deal_documents"]),
                _metric("inbound_attachments", len(v.s.rows("inbound_email_attachments")), "Rows in inbound_email_attachments (metadata only).",
                        ["inbound_email_attachments"])]},
            "evidence": {"backend": "northsea.py TAB_SQL['bewijs']", "metrics": [
                _metric("evidence_records", len(v.s.rows("deal_evidence")), "Rows in deal_evidence.", ["deal_evidence"]),
                _metric("evidence_by_class", dict(Counter(canon.evidence_class(e.get("verification_status")) for e in v.s.rows("deal_evidence"))),
                        "tabs/status.ts bewijsBadge classes; only 'verified' may be shown green.", ["deal_evidence"]),
                _metric("verification_checks", dict(Counter(x.get("status") or "(none)" for x in v.s.rows("verification_checks"))),
                        "verification_checks.status.", ["verification_checks"])]},
            "automation": {"backend": "northsea.py TAB_SQL['automatisering']", "metrics": [
                _metric("deal_automation_status", dict(Counter(o.get("automation_status") or "(none)" for o in alle if o.get("stage") != "lost")),
                        "opportunities.automation_status (stage <> lost).", ["opportunities"]),
                _metric("sourcing_campaigns", len(v.s.rows("sourcing_campaigns")), "Rows in sourcing_campaigns.", ["sourcing_campaigns"]),
                _metric("chase_items", len(chase), "AXE Chase: " + " | ".join(canon.CHASE_RULES[:8]),
                        ["action_queue", "deal_tasks", "reply_drafts", "communications"], [c["id"] for c in chase]),
                _metric("chase_critical", sum(1 for c in chase if c["critical"]), "Critical chase items.", ["action_queue", "deal_tasks"],
                        [c["id"] for c in chase if c["critical"]])]},
            "reports": {"backend": "northsea.py TAB_SQL['rapporten']", "metrics": [
                _metric("by_stage", dict(Counter(o.get("stage") for o in alle)), "count(*) group by stage (all opportunities).", ["opportunities"]),
                _metric("by_execution_state", dict(Counter(o.get("execution_state") or "(none)" for o in alle if o.get("stage") != "lost")),
                        "count(*) group by execution_state where stage <> lost. 'qualifying' and 'matched' in Reports come from here.",
                        ["opportunities"]),
                _metric("qualifying_ids", sum(1 for o in alle if o.get("stage") != "lost" and o.get("execution_state") == "qualifying"),
                        "execution_state = qualifying, stage <> lost.", ["opportunities"],
                        [o["id"] for o in alle if o.get("stage") != "lost" and o.get("execution_state") == "qualifying"]),
                _metric("qualifying_and_blocked", sum(1 for o in alle if o.get("stage") != "lost" and o.get("execution_state") == "qualifying" and canon.is_blocked(o)),
                        "Qualifying opportunities that the map classifies under Blocked.", ["opportunities"],
                        [o["id"] for o in alle if o.get("stage") != "lost" and o.get("execution_state") == "qualifying" and canon.is_blocked(o)]),
                _metric("commission_amounts_recorded", sum(1 for o in alle if o.get("commission_amount") is not None),
                        "Reports 'commissie_bedragen'. Zero means no commission is recorded, not zero commission.", ["opportunities"]),
                _metric("won", sum(1 for o in alle if o.get("stage") == "won"), "stage = won.", ["opportunities"])]},
        }
        if view:
            if view not in views:
                raise ServiceError("invalid_input", f"view must be one of: {', '.join(views)}")
            views = {view: views[view]}
        return {"generated_at": v.generated_at, "views": views,
                "scope": "Backend/data verification of the 10 Global Trade Center views. This is NOT a visual/pixel inspection of the "
                         "AXE CORE window; no such capability exists in this MCP.",
                "freshness": {"snapshot_loaded_at": v.generated_at, "cache_seconds": self.i.cache_s, "truncated_tables": sorted(v.s.truncated)},
                "source": sorted(v.s.t)}


MAX_ALL = 10_000


def _dt(t: float):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(t, tz=timezone.utc)


def _now_minus(days: float):
    from datetime import datetime, timezone
    return datetime.now(timezone.utc) - timedelta(days=float(days))


def _bucket(r: Any) -> str:
    if r is None:
        return "(none)"
    return "0-24" if r < 25 else "25-49" if r < 50 else "50-74" if r < 75 else "75-100"


def _readiness(o: dict) -> dict:
    return {"score": o.get("readiness_score"), "stored_breakdown": o.get("readiness_breakdown"),
            "target_framework": READINESS_FRAMEWORK,
            "note": "stored_breakdown is exactly what NorthSea computed and stored. target_framework is the intended 100-point model; "
                    "compare the two before relying on the score."}


def _spec(r: dict, v: View, role: str) -> dict:
    if not r:
        return {}
    co = v.s.get("companies", r.get("company_id"))
    uit = {k: r.get(k) for k in ("id", "commodity", "product", "grade", "purity", "quantity_mt", "frequency", "incoterm", "payment_terms",
                                 "status", "created_at", "updated_at")}
    uit.update({"counterparty": v.company_ref(co, role)})
    if role == "buyer":
        uit.update({k: r.get(k) for k in ("destination", "origin_preference", "target_price", "target_price_currency", "required_delivery", "contract_duration")})
    else:
        uit.update({k: r.get(k) for k in ("origin", "loading_port", "monthly_capacity_mt", "price_basis", "price", "price_currency",
                                          "mandate_status", "valid_until", "verification_score")})
    reden = canon.testcase_reason(r, co)
    if reden:
        uit["integrity_flags"] = [{"flag": "internal_testcase", "reason": reden}]
    bron = r.get("evidence") if role == "buyer" else r.get("documentation")
    if bron:
        tekst = bron if isinstance(bron, str) else json.dumps(bron, default=str)
        uit["evidence" if role == "buyer" else "documentation"] = v.red(tekst)[:400]
    return uit


def _match(m: dict) -> dict:
    return {k: m.get(k) for k in ("id", "overall_score", "product_score", "quantity_score", "geography_score", "incoterm_score", "payment_score",
                                  "timing_score", "verification_score", "blockers", "missing_information", "executable", "assessed_at")} | {
        "note": "A high overall_score does not make a deal executable; see 'executable' and the gates."}


def _task(t: dict, bron: str, v: View) -> dict:
    due = t.get("due_at")
    return {"task_id": t.get("id"), "source": bron, "deal_id": t.get("opportunity_id"),
            "type": t.get("task_type") or t.get("action_type"), "title": v.red(t.get("title")), "status": t.get("status"),
            "priority": t.get("priority"), "owner": t.get("owner") or ("axe" if bron == "action_queue" else None),
            "requires_approval": bool(t.get("requires_approval")), "due_at": due,
            "overdue": bool(due) and ts(due) < v.now.timestamp() and t.get("status") in OPEN_TASK,
            "execution_error": t.get("execution_error"), "created_at": t.get("created_at"), "updated_at": t.get("updated_at")}


def _evidence(e: dict, v: View) -> dict:
    return {"evidence_id": e.get("id"), "deal_id": e.get("opportunity_id"), "party_side": e.get("party_side"),
            "evidence_type": e.get("evidence_type"), "source_type": e.get("source_type"),
            "source_reference": v.red(e.get("source_reference")) or None, "claim": v.red(e.get("claim"))[:400],
            "verification_status": e.get("verification_status"), "verification_class": canon.evidence_class(e.get("verification_status")),
            "verified_at": e.get("verified_at"), "created_at": e.get("created_at")}


def _document(d: dict) -> dict:
    return {"document_id": d.get("id"), "deal_id": d.get("opportunity_id"), "document_type": d.get("document_type"), "status": d.get("status"),
            "has_file": bool(d.get("file_path")), "has_external_url": bool(d.get("external_url")),
            "created_at": d.get("created_at"), "updated_at": d.get("updated_at")}


def _check(x: dict, v: View) -> dict:
    return {"check_id": x.get("id"), "check_type": x.get("check_type"), "status": x.get("status"), "score_delta": x.get("score_delta"),
            "notes": v.red(x.get("notes"))[:400] or None, "checked_at": x.get("checked_at")}


def _event(e: dict, v: View) -> dict:
    return {"event_id": e.get("id"), "deal_id": e.get("opportunity_id"), "event_type": e.get("event_type"), "actor": e.get("actor"),
            "summary": v.red(e.get("summary")), "created_at": e.get("created_at")}
